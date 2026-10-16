"""CLI and programmatic verifier for fixtures/seoul_mvp_value.json."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

from route_mvp.engine import (
    SEOUL_VALUE_V1_CANDIDATES,
    check_explanation_consistency,
    evaluate_conditional_boarding,
    evaluate_data_freshness,
    evaluate_multimodal_routes,
    recommend_route,
    run_ranking_inversion_chain,
)


class InvalidFixtureError(Exception):
    """Raised when the fixture file cannot be parsed or lacks required schema fields."""


def validate_fixture_schema(data: Any) -> dict[str, Any]:
    """Validate top-level structure of the fixture JSON."""
    if not isinstance(data, dict):
        raise InvalidFixtureError("Root must be a JSON object")
    if "fixture_id" not in data or not isinstance(data["fixture_id"], str):
        raise InvalidFixtureError("Missing fixture_id")
    scenarios = data.get("scenarios")
    if not isinstance(scenarios, list) or len(scenarios) == 0:
        raise InvalidFixtureError("Missing or empty scenarios list")
    for item in scenarios:
        if not isinstance(item, dict):
            raise InvalidFixtureError("Scenario item must be an object")
        if "id" not in item or "input" not in item or "expected" not in item:
            raise InvalidFixtureError("Scenario missing id, input, or expected")
        if not isinstance(item["input"], dict) or not isinstance(item["expected"], dict):
            raise InvalidFixtureError("Scenario input and expected must be dicts")
        if "route" not in item["expected"] or "duration_seconds" not in item["expected"]:
            raise InvalidFixtureError("Scenario expected missing route or duration_seconds")
    return data


def evaluate_fixture_data(data: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    """Run all 24 scenario checks, conditional boarding checks, and freshness checks."""
    validate_fixture_schema(data)
    scenarios = data["scenarios"]

    scenario_reports: list[dict[str, Any]] = []
    constraint_violations = 0
    expected_mismatches = 0
    saved_180_or_more_count = 0
    saved_180_modes: set[str] = set()
    compared_all_modes_count = 0

    required_candidate_ids = {c["route"] for c in SEOUL_VALUE_V1_CANDIDATES}

    for sc in scenarios:
        inp = sc["input"]
        exp = sc["expected"]
        eval_res = evaluate_multimodal_routes(inp)
        actual_rec = eval_res["recommendation"]

        candidate_ids = {c["route"] for c in eval_res.get("route_candidates", [])}
        if required_candidate_ids.issubset(candidate_ids):
            compared_all_modes_count += 1

        # Verify selected candidate did not violate any user or freshness constraints
        best_cand = eval_res.get("best_candidate")
        violated = False
        if best_cand is None or not best_cand.get("eligible", False):
            violated = True
        else:
            if best_cand["cost_krw"] > int(inp.get("budget_krw", 10000)):
                violated = True
            if best_cand["run_seconds"] > int(inp.get("max_run_seconds", 180)):
                violated = True
            if best_cand["cycle_seconds"] > int(inp.get("max_cycle_seconds", 1200)):
                violated = True
            if best_cand["requires_own_bike"] and not bool(inp.get("own_bike", True)):
                violated = True
            if not check_explanation_consistency(eval_res["llm_explanation"], eval_res):
                violated = True

        if violated:
            constraint_violations += 1

        matched = actual_rec == exp
        if not matched:
            expected_mismatches += 1

        saved_s = actual_rec.get("saved_seconds")
        if isinstance(saved_s, (int, float)) and saved_s >= 180:
            saved_180_or_more_count += 1
            saved_180_modes.add(actual_rec["route"])

        scenario_reports.append(
            {
                "id": sc["id"],
                "category": sc.get("category"),
                "expected": exp,
                "actual": actual_rec,
                "matched": matched,
                "constraint_violated": violated,
            }
        )

    # Verify conditional boarding canonical examples (180s vs 181s)
    cb_pass_res = evaluate_conditional_boarding(
        {
            "platform_arrival_s": 180,
            "train_departure_s": 240,
            "boarding_margin_s": 60,
            "baseline_arrival_s": 1200,
            "candidate_arrival_s": 960,
        }
    )
    cb_fail_res = evaluate_conditional_boarding(
        {
            "platform_arrival_s": 181,
            "train_departure_s": 240,
            "boarding_margin_s": 60,
            "baseline_arrival_s": 1200,
            "candidate_arrival_s": 960,
        }
    )
    conditional_boarding_ok = (
        cb_pass_res["boardable"] is True
        and cb_pass_res["saving_s"] == 240
        and cb_pass_res["guidance_text"] == "08:03까지 역 입구에 도착하면 08:04:30 열차를 탈 수 있습니다"
        and cb_fail_res["boardable"] is False
        and cb_fail_res["confirmed_boarding_allowed"] is False
        and cb_fail_res["fallback"]["triggered"] is True
    )

    # Verify train data freshness boundary (61s vs 60s) and composite stale fallback
    stale_61 = evaluate_data_freshness({"age_seconds": 61, "departure_available": True})
    fresh_60 = evaluate_data_freshness({"age_seconds": 60, "departure_available": True})
    composite_stale = recommend_route(
        {
            "fixture": "seoul_value_v1",
            "budget_krw": 10000,
            "max_run_seconds": 180,
            "max_cycle_seconds": 1200,
            "own_bike": True,
            "train_age_s": 61,
            "ddareungi_age_s": 61,
            "taxi_wait_age_s": 121,
            "taxi_wait_p95_s": None,
        }
    )
    freshness_ok = (
        stale_61 == {"eligible_for_fastest": False, "reason": "STALE_TRAIN_DATA"}
        and fresh_60 == {"eligible_for_fastest": True, "reason": None}
        and composite_stale
        == {
            "route": "own_bike",
            "duration_seconds": 1560,
            "cost_krw": 0,
            "saved_seconds": None,
        }
    )

    # Verify 5-step ranking inversion chain
    inversion_chain = run_ranking_inversion_chain()
    inversion_ok = all(step["passed"] for step in inversion_chain)

    required_saving_modes = {"run_subway", "ddareungi", "taxi_subway"}
    criteria_checks = {
        "scenario_count_eq_24": len(scenarios) == 24,
        "all_modes_compared_in_all_24": compared_all_modes_count == 24,
        "zero_constraint_violations": constraint_violations == 0,
        "zero_expected_mismatches": expected_mismatches == 0,
        "saved_180s_at_least_6": saved_180_or_more_count >= 6,
        "saved_180s_includes_run_ddareungi_taxi": required_saving_modes.issubset(saved_180_modes),
        "conditional_boarding_180_vs_181_ok": conditional_boarding_ok,
        "freshness_and_stale_fallback_ok": freshness_ok,
        "ranking_inversion_chain_ok": inversion_ok,
    }

    overall_passed = all(criteria_checks.values())

    report = {
        "status": "PASS" if overall_passed else "FAIL",
        "fixture_id": data.get("fixture_id"),
        "total_scenarios": len(scenarios),
        "compared_all_modes_count": compared_all_modes_count,
        "constraint_violations": constraint_violations,
        "expected_mismatches": expected_mismatches,
        "saved_180s_or_more_count": saved_180_or_more_count,
        "saved_180s_modes": sorted(saved_180_modes),
        "criteria_checks": criteria_checks,
        "ranking_inversion_chain": inversion_chain,
        "conditional_boarding_verification": {
            "boardable_180s": {"boardable": cb_pass_res["boardable"], "saving_s": cb_pass_res["saving_s"]},
            "missed_181s": {"boardable": cb_fail_res["boardable"], "saving_s": cb_fail_res["saving_s"]},
        },
        "freshness_verification": {
            "stale_61s": stale_61,
            "fresh_60s": fresh_60,
            "composite_stale": composite_stale,
        },
        "validation_boundary": {
            "scope": "fixture_verification_only",
            "supplier_api_connected": False,
            "seoul_field_trial_12_cases": "NOT_CONDUCTED_SKIP_RUN",
            "claims_live_superiority": False,
        },
        "scenarios": scenario_reports,
    }
    return overall_passed, report


def load_and_verify_fixture(fixture_path: str | Path, report_path: str | Path | None = None) -> tuple[bool, dict[str, Any]]:
    """Load fixture JSON from disk, evaluate acceptance criteria, and optionally write report."""
    path = Path(fixture_path)
    if not path.is_file():
        raise InvalidFixtureError(f"Fixture file does not exist: {fixture_path}")
    try:
        raw_text = path.read_text(encoding="utf-8")
        data = json.loads(raw_text)
    except Exception as exc:
        raise InvalidFixtureError(f"Failed to parse JSON: {exc}") from exc

    passed, report = evaluate_fixture_data(data)

    if report_path is not None:
        out_path = Path(report_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return passed, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify Seoul multimodal MVP value fixture.")
    parser.add_argument("--fixtures", required=True, help="Path to fixtures/seoul_mvp_value.json")
    parser.add_argument("--report", required=False, default=None, help="Path to write JSON verification report")

    try:
        args = parser.parse_args(argv)
    except SystemExit:
        sys.stderr.write("ERROR invalid fixture\n")
        return 2

    try:
        passed, _ = load_and_verify_fixture(args.fixtures, args.report)
    except InvalidFixtureError:
        sys.stderr.write("ERROR invalid fixture\n")
        return 2
    except Exception:
        sys.stderr.write("ERROR invalid fixture\n")
        return 2

    if passed:
        sys.stdout.write("PASS\n")
        return 0

    sys.stderr.write("FAIL acceptance criteria\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
