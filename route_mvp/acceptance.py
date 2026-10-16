"""CLI acceptance runner for route_mvp (`python -m route_mvp.acceptance --fixture seoul_value_v1 --json`)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from verification.mvp_value import load_and_verify_fixture


def run_acceptance(fixture_name: str, fixture_path: str | Path | None = None) -> bool:
    """Run full acceptance suite for the given fixture identifier."""
    if fixture_name != "seoul_value_v1":
        return False

    resolved_path = (
        Path(fixture_path)
        if fixture_path is not None
        else Path(__file__).resolve().parent.parent / "fixtures" / "seoul_mvp_value.json"
    )
    try:
        passed, report = load_and_verify_fixture(resolved_path, report_path=None)
    except Exception:
        return False

    if not passed:
        return False
    if report.get("fixture_id") != fixture_name:
        return False
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run route_mvp acceptance verification.")
    parser.add_argument("--fixture", required=True, help="Fixture ID (e.g. seoul_value_v1)")
    parser.add_argument("--json", action="store_true", help="Output compact JSON status")
    parser.add_argument("--fixture-file", required=False, default=None, help="Optional override path to fixture JSON")

    try:
        args = parser.parse_args(argv)
    except SystemExit:
        sys.stderr.write("ACCEPTANCE_FAILED\n")
        return 1

    ok = run_acceptance(args.fixture, fixture_path=args.fixture_file)
    if ok:
        if args.json:
            sys.stdout.write(
                json.dumps({"status": "PASS", "fixture": args.fixture}, separators=(",", ":")) + "\n"
            )
        else:
            sys.stdout.write("PASS\n")
        return 0

    sys.stderr.write("ACCEPTANCE_FAILED\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
