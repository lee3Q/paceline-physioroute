"""Tests for data freshness gate, fail-closed exclusions, p95 taxi wait fallback, CLI contracts, and evidence honesty."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys

import pytest

from route_mvp.engine import (
    evaluate_data_freshness,
    evaluate_multimodal_routes,
    recommend_route,
)


def test_train_data_freshness_boundary_60s_vs_61s() -> None:
    """Verify exact train data eligibility boundary at 60s and 61s."""
    stale = evaluate_data_freshness({"age_seconds": 61, "departure_available": True})
    assert stale == {"eligible_for_fastest": False, "reason": "STALE_TRAIN_DATA"}

    fresh = evaluate_data_freshness({"age_seconds": 60, "departure_available": True})
    assert fresh == {"eligible_for_fastest": True, "reason": None}

    missing = evaluate_data_freshness({"age_seconds": 10, "departure_available": False})
    assert missing == {"eligible_for_fastest": False, "reason": "MISSING_TRAIN_DATA"}


def test_composite_stale_data_excludes_baseline_and_sets_saved_seconds_none() -> None:
    """Verify the canonical composite stale-data input selects own_bike with saved_seconds=None."""
    payload = {
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
    res = recommend_route(payload)
    assert res == {
        "route": "own_bike",
        "duration_seconds": 1560,
        "cost_krw": 0,
        "saved_seconds": None,
    }


def test_taxi_wait_p95_plus_120_fallback_and_sample_size_guard() -> None:
    """Verify taxi wait fallback (p95 + 120s) works only when >=30 samples in last 30 days exist."""
    with_valid_p95 = evaluate_multimodal_routes(
        {
            "budget_krw": 10000,
            "max_run_seconds": 180,
            "max_cycle_seconds": 1200,
            "own_bike": True,
            "taxi_wait_age_s": 130,
            "taxi_wait_p95_s": 60,
            "taxi_wait_sample_count": 32,
            "taxi_wait_window_days": 30,
        }
    )
    assert with_valid_p95["recommendation"] == {
        "route": "taxi_subway",
        "duration_seconds": 1380,
        "cost_krw": 8500,
        "saved_seconds": 420,
    }
    assert with_valid_p95["best_candidate"]["taxi_wait_estimated"] is True

    # Under 30 samples -> taxi_subway must be excluded
    insufficient_samples = evaluate_multimodal_routes(
        {
            "budget_krw": 10000,
            "max_run_seconds": 180,
            "max_cycle_seconds": 1200,
            "own_bike": True,
            "taxi_wait_age_s": 130,
            "taxi_wait_p95_s": 60,
            "taxi_wait_sample_count": 29,
            "taxi_wait_window_days": 30,
        }
    )
    assert insufficient_samples["recommendation"]["route"] == "run_subway"


def test_no_eligible_route_returns_503_error() -> None:
    """Verify HTTP 503 and NO_ELIGIBLE_ROUTE when all candidates are excluded."""
    payload = {
        "budget_krw": 0,
        "max_run_seconds": 0,
        "max_cycle_seconds": 0,
        "own_bike": False,
        "allow_walk": False,
        "train_age_s": 61,
        "ddareungi_age_s": 61,
        "taxi_wait_age_s": 121,
    }
    res = recommend_route(payload)
    assert res == {"error": "NO_ELIGIBLE_ROUTE", "status_code": 503}

    detailed = evaluate_multimodal_routes(payload)
    assert detailed["http_status"] == 503
    assert detailed["http_body"] == {"error": "NO_ELIGIBLE_ROUTE"}


def test_evidence_and_unresolved_policy_transparency() -> None:
    """Verify fixture evaluation does not claim live supplier connection or field-trial completion."""
    detailed = evaluate_multimodal_routes(
        {"budget_krw": 10000, "max_run_seconds": 180, "max_cycle_seconds": 1200, "own_bike": True}
    )
    val_status = detailed["validation_status"]
    assert val_status["scope"] == "fixture_verification_only"
    assert val_status["supplier_api_connected"] is False
    assert val_status["field_trial_status"] == "NOT_CONDUCTED_SKIP_RUN"
    assert val_status["claims_global_optimality"] is False

    unresolved = detailed["freshness"]["unresolved_data_policy"]
    assert unresolved["traffic_ttl_conflict"]["conservative_default_s"] == 300
    assert unresolved["traffic_ttl_conflict"]["strict_alternative_s"] == 120


def test_cli_contracts_mvp_value_and_route_mvp_acceptance(tmp_path: Path) -> None:
    """Verify stdout, stderr, and exit codes of both required verification CLIs."""
    repo_root = Path(__file__).resolve().parent.parent
    fixture_file = repo_root / "fixtures" / "seoul_mvp_value.json"
    report_file = tmp_path / "mvp_value.json"

    # 1. verification.mvp_value PASS
    proc_pass = subprocess.run(
        [
            sys.executable,
            "-B",
            "-m",
            "verification.mvp_value",
            "--fixtures",
            str(fixture_file),
            "--report",
            str(report_file),
        ],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc_pass.returncode == 0
    assert proc_pass.stdout == "PASS\n"
    assert proc_pass.stderr == ""
    assert report_file.is_file()

    # 2. verification.mvp_value FAIL acceptance criteria (exit 1)
    failing_fixture = tmp_path / "failing_fixture.json"
    fixture_data = json.loads(fixture_file.read_text(encoding="utf-8"))
    fixture_data["scenarios"] = fixture_data["scenarios"][:5]  # fewer than 24 scenarios
    failing_fixture.write_text(json.dumps(fixture_data), encoding="utf-8")

    proc_fail = subprocess.run(
        [
            sys.executable,
            "-B",
            "-m",
            "verification.mvp_value",
            "--fixtures",
            str(failing_fixture),
        ],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc_fail.returncode == 1
    assert proc_fail.stdout == ""
    assert proc_fail.stderr == "FAIL acceptance criteria\n"

    # 3. verification.mvp_value ERROR invalid fixture (exit 2)
    invalid_fixture = tmp_path / "invalid_fixture.json"
    invalid_fixture.write_text("{not_valid_json", encoding="utf-8")
    proc_err = subprocess.run(
        [
            sys.executable,
            "-B",
            "-m",
            "verification.mvp_value",
            "--fixtures",
            str(invalid_fixture),
        ],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc_err.returncode == 2
    assert proc_err.stdout == ""
    assert proc_err.stderr == "ERROR invalid fixture\n"

    # 4. route_mvp.acceptance PASS (exit 0)
    proc_acc_pass = subprocess.run(
        [
            sys.executable,
            "-B",
            "-m",
            "route_mvp.acceptance",
            "--fixture",
            "seoul_value_v1",
            "--json",
        ],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc_acc_pass.returncode == 0
    assert proc_acc_pass.stdout == '{"status":"PASS","fixture":"seoul_value_v1"}\n'
    assert proc_acc_pass.stderr == ""

    # 5. route_mvp.acceptance FAIL (exit 1)
    proc_acc_fail = subprocess.run(
        [
            sys.executable,
            "-B",
            "-m",
            "route_mvp.acceptance",
            "--fixture",
            "unknown_fixture",
            "--json",
        ],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc_acc_fail.returncode == 1
    assert proc_acc_fail.stdout == ""
    assert proc_acc_fail.stderr == "ACCEPTANCE_FAILED\n"
