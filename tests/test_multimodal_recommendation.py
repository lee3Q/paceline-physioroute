"""Tests for multimodal candidate comparison, time component aggregation, and ranking inversion."""

from __future__ import annotations

from pathlib import Path

from route_mvp.engine import (
    BASELINE_DURATION_S,
    BASELINE_ROUTE_ID,
    SEOUL_VALUE_V1_CANDIDATES,
    evaluate_multimodal_routes,
    recommend_route,
    resolve_interval_upper_bound,
    run_ranking_inversion_chain,
)
from verification.mvp_value import load_and_verify_fixture


def test_seoul_value_v1_canonical_candidates_and_time_components() -> None:
    """Verify the 6 canonical Seoul multimodal candidates and that their time components sum to total duration."""
    expected_tuples = {
        "walk": (2400, 0, 0, 0),
        "walk_subway": (1800, 1550, 0, 0),
        "run_subway": (1440, 1550, 180, 0),
        "own_bike": (1560, 0, 0, 900),
        "ddareungi": (1620, 1000, 0, 1000),
        "taxi_subway": (1320, 8500, 0, 0),
    }
    actual_tuples = {
        c["route"]: (
            c["duration_seconds"],
            c["cost_krw"],
            c["run_seconds"],
            c["cycle_seconds"],
        )
        for c in SEOUL_VALUE_V1_CANDIDATES
    }
    assert actual_tuples == expected_tuples
    assert BASELINE_ROUTE_ID == "walk_subway"
    assert BASELINE_DURATION_S == 1800

    for candidate in SEOUL_VALUE_V1_CANDIDATES:
        comp_sum = sum(candidate["time_components"].values())
        assert comp_sum == candidate["duration_seconds"], f"Component sum mismatch for {candidate['route']}"


def test_five_step_ranking_inversion_chain() -> None:
    """Verify the 5-step constraint-driven ranking inversion specified in route_service_seed.yaml."""
    # Step 1: Full budget -> taxi_subway
    res1 = recommend_route(
        {
            "budget_krw": 10000,
            "max_run_seconds": 180,
            "max_cycle_seconds": 1200,
            "own_bike": True,
        }
    )
    assert res1 == {
        "route": "taxi_subway",
        "duration_seconds": 1320,
        "cost_krw": 8500,
        "saved_seconds": 480,
    }

    # Step 2: Lower budget to 2000 -> run_subway
    res2 = recommend_route(
        {
            "budget_krw": 2000,
            "max_run_seconds": 180,
            "max_cycle_seconds": 1200,
            "own_bike": True,
        }
    )
    assert res2 == {
        "route": "run_subway",
        "duration_seconds": 1440,
        "cost_krw": 1550,
        "saved_seconds": 360,
    }

    # Step 3: Lower max_run_seconds to 0 -> own_bike
    res3 = recommend_route(
        {
            "budget_krw": 2000,
            "max_run_seconds": 0,
            "max_cycle_seconds": 1200,
            "own_bike": True,
        }
    )
    assert res3 == {
        "route": "own_bike",
        "duration_seconds": 1560,
        "cost_krw": 0,
        "saved_seconds": 240,
    }

    # Step 4: Set own_bike to False -> ddareungi
    res4 = recommend_route(
        {
            "budget_krw": 2000,
            "max_run_seconds": 0,
            "max_cycle_seconds": 1200,
            "own_bike": False,
        }
    )
    assert res4 == {
        "route": "ddareungi",
        "duration_seconds": 1620,
        "cost_krw": 1000,
        "saved_seconds": 180,
    }

    # Step 5: Set ddareungi_stock to 0 -> walk_subway
    res5 = recommend_route(
        {
            "budget_krw": 2000,
            "max_run_seconds": 0,
            "max_cycle_seconds": 1200,
            "own_bike": False,
            "ddareungi_stock": 0,
        }
    )
    assert res5 == {
        "route": "walk_subway",
        "duration_seconds": 1800,
        "cost_krw": 1550,
        "saved_seconds": 0,
    }

    chain = run_ranking_inversion_chain()
    assert len(chain) == 5
    assert all(step["passed"] for step in chain)


def test_interval_upper_bound_and_missing_range_exclusion() -> None:
    """Verify [60, 120] resolves to 120s upper bound and missing range excludes the candidate."""
    assert resolve_interval_upper_bound([60, 120]) == 120
    assert resolve_interval_upper_bound(60) == 60
    assert resolve_interval_upper_bound(None) is None
    assert resolve_interval_upper_bound([120, 60]) is None

    eval_with_range = evaluate_multimodal_routes(
        {
            "budget_krw": 2000,
            "max_run_seconds": 180,
            "max_cycle_seconds": 1200,
            "own_bike": False,
            "component_overrides": {"run_subway": {"station_entry_s": [60, 120]}},
        }
    )
    assert eval_with_range["recommendation"] == {
        "route": "run_subway",
        "duration_seconds": 1500,
        "cost_krw": 1550,
        "saved_seconds": 300,
    }

    eval_missing_range = evaluate_multimodal_routes(
        {
            "budget_krw": 2000,
            "max_run_seconds": 180,
            "max_cycle_seconds": 1200,
            "own_bike": True,
            "component_overrides": {"run_subway": {"transfer_s": None}},
        }
    )
    run_cand = next(c for c in eval_missing_range["route_candidates"] if c["route"] == "run_subway")
    assert run_cand["eligible"] is False
    assert "MISSING_COMPONENT_RANGE" in run_cand["exclusion_reasons"]
    assert eval_missing_range["recommendation"]["route"] == "own_bike"


def test_24_seoul_scenarios_fixture_value_criteria() -> None:
    """Verify all 24 scenarios in fixtures/seoul_mvp_value.json meet acceptance criteria."""
    fixture_path = Path(__file__).resolve().parent.parent / "fixtures" / "seoul_mvp_value.json"
    passed, report = load_and_verify_fixture(fixture_path)
    assert passed is True
    assert report["total_scenarios"] == 24
    assert report["compared_all_modes_count"] == 24
    assert report["constraint_violations"] == 0
    assert report["expected_mismatches"] == 0
    assert report["saved_180s_or_more_count"] >= 6
    assert {"run_subway", "ddareungi", "taxi_subway"}.issubset(set(report["saved_180s_modes"]))
