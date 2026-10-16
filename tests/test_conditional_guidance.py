"""Tests for conditional boarding guidance, 1-second boundary precision, fallback re-search, and LLM consistency."""

from __future__ import annotations

from route_mvp.engine import (
    check_explanation_consistency,
    evaluate_conditional_boarding,
    evaluate_multimodal_routes,
    recommend_route,
)


def test_conditional_boarding_exact_180s_boundary_passes() -> None:
    """Verify required canonical boarding input returns boardable=True, saving_s=240, and exact Korean guidance."""
    payload = {
        "platform_arrival_s": 180,
        "train_departure_s": 240,
        "boarding_margin_s": 60,
        "baseline_arrival_s": 1200,
        "candidate_arrival_s": 960,
    }
    res = evaluate_conditional_boarding(payload)
    assert res["boardable"] is True
    assert res["saving_s"] == 240
    assert res["confirmed_boarding_allowed"] is True
    assert res["guidance_text"] == "08:03까지 역 입구에 도착하면 08:04:30 열차를 탈 수 있습니다"
    assert res["run_distance_m"] == 450
    assert res["run_seconds"] == 180
    assert res["station_entry_s"] == 60
    assert res["boarding_buffer_s"] == 30

    minimal_res = evaluate_conditional_boarding(payload, minimal=True)
    assert minimal_res == {"boardable": True, "saving_s": 240}


def test_conditional_boarding_181s_missed_by_one_second_blocks_and_reroutes() -> None:
    """Verify changing platform_arrival_s from 180 to 181 triggers boardable=False and fallback alternatives."""
    payload = {
        "platform_arrival_s": 181,
        "train_departure_s": 240,
        "boarding_margin_s": 60,
        "baseline_arrival_s": 1200,
        "candidate_arrival_s": 960,
    }
    res = evaluate_conditional_boarding(payload)
    assert res["boardable"] is False
    assert res["confirmed_boarding_allowed"] is False
    assert res["failure_reason"] == "MISSED_BOARDING_DEADLINE"
    assert "08:04:30 열차를 탈 수 있습니다" not in res["guidance_text"]
    assert res["fallback"]["triggered"] is True
    assert res["fallback"]["next_train_wait_s"] == 360
    assert res["fallback"]["next_train_arrival_s"] == 1320
    alt_routes = {r["route"] for r in res["fallback"]["alternative_routes"]}
    assert {"own_bike", "ddareungi", "walk_subway"}.issubset(alt_routes)

    # In multimodal route selection, platform_arrival_s=181 excludes run_subway and reroutes to own_bike or ddareungi
    rerouted_own_bike = recommend_route(
        {
            "budget_krw": 2000,
            "max_run_seconds": 180,
            "max_cycle_seconds": 1200,
            "own_bike": True,
            "platform_arrival_s": 181,
            "train_departure_s": 240,
            "boarding_margin_s": 60,
        }
    )
    assert rerouted_own_bike == {
        "route": "own_bike",
        "duration_seconds": 1560,
        "cost_krw": 0,
        "saved_seconds": 240,
    }

    rerouted_ddareungi = recommend_route(
        {
            "budget_krw": 2000,
            "max_run_seconds": 180,
            "max_cycle_seconds": 1200,
            "own_bike": False,
            "platform_arrival_s": 181,
            "train_departure_s": 240,
            "boarding_margin_s": 60,
        }
    )
    assert rerouted_ddareungi == {
        "route": "ddareungi",
        "duration_seconds": 1620,
        "cost_krw": 1000,
        "saved_seconds": 180,
    }


def test_conditional_boarding_stale_train_data_blocks_confirmed_guidance() -> None:
    """Verify that when train data exceeds 60s TTL, confirmed boarding guidance is blocked."""
    res = evaluate_conditional_boarding(
        {
            "platform_arrival_s": 180,
            "train_departure_s": 240,
            "boarding_margin_s": 60,
            "baseline_arrival_s": 1200,
            "candidate_arrival_s": 960,
            "train_age_s": 61,
        }
    )
    assert res["boardable"] is False
    assert res["confirmed_boarding_allowed"] is False
    assert res["failure_reason"] == "STALE_TRAIN_DATA"
    assert "08:04:30 열차를 탈 수 있습니다" not in res["guidance_text"]


def test_llm_explanation_consistency_with_computed_values() -> None:
    """Verify LLM explanation numbers and boarding conditions strictly match engine calculations."""
    eval_run = evaluate_multimodal_routes(
        {
            "budget_krw": 2000,
            "max_run_seconds": 180,
            "max_cycle_seconds": 1200,
            "own_bike": True,
        }
    )
    explanation = eval_run["llm_explanation"]
    assert check_explanation_consistency(explanation, eval_run) is True
    assert "08:03까지 역 입구에 도착하면 08:04:30 열차를 탈 수 있습니다" in explanation["text"]
    assert "1440초" in explanation["text"]
    assert "1550원" in explanation["text"]

    # Tampering with explanation duration or fabricating boarding claim when run_subway is excluded must fail consistency check
    bad_explanation = dict(explanation, duration_seconds=999)
    assert check_explanation_consistency(bad_explanation, eval_run) is False

    eval_missed = evaluate_multimodal_routes(
        {
            "budget_krw": 2000,
            "max_run_seconds": 180,
            "max_cycle_seconds": 1200,
            "own_bike": True,
            "platform_arrival_s": 181,
        }
    )
    assert check_explanation_consistency(eval_missed["llm_explanation"], eval_missed) is True
    fabricated = dict(
        eval_missed["llm_explanation"],
        text=eval_missed["llm_explanation"]["text"] + " 08:03까지 역 입구에 도착하면 08:04:30 열차를 탈 수 있습니다",
    )
    assert check_explanation_consistency(fabricated, eval_missed) is False
