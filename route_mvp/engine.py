"""Deterministic multimodal route engine, conditional boarding evaluator, and freshness gate."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

BASELINE_ROUTE_ID = "walk_subway"
BASELINE_DURATION_S = 1800

DEFAULT_TTLS = {
    "train_age_s": 60,
    "ddareungi_age_s": 60,
    "taxi_wait_age_s": 120,
    "traffic_age_s": 300,
    "traffic_strict_age_s": 120,
}

SEOUL_VALUE_V1_CANDIDATES: list[dict[str, Any]] = [
    {
        "route": "walk",
        "label_ko": "도보",
        "duration_seconds": 2400,
        "cost_krw": 0,
        "run_seconds": 0,
        "cycle_seconds": 0,
        "uses_train": False,
        "uses_ddareungi": False,
        "uses_taxi": False,
        "requires_own_bike": False,
        "time_components": {
            "outdoor_move_s": 2400,
            "station_entry_s": 0,
            "platform_move_s": 0,
            "transfer_s": 0,
            "train_wait_s": 0,
            "transit_ride_s": 0,
            "bike_rent_return_s": 0,
            "taxi_wait_s": 0,
            "traffic_ride_s": 0,
        },
    },
    {
        "route": "walk_subway",
        "label_ko": "도보+지하철",
        "duration_seconds": 1800,
        "cost_krw": 1550,
        "run_seconds": 0,
        "cycle_seconds": 0,
        "uses_train": True,
        "uses_ddareungi": False,
        "uses_taxi": False,
        "requires_own_bike": False,
        "time_components": {
            "outdoor_move_s": 420,
            "station_entry_s": 60,
            "platform_move_s": 60,
            "transfer_s": 120,
            "train_wait_s": 360,
            "transit_ride_s": 780,
            "bike_rent_return_s": 0,
            "taxi_wait_s": 0,
            "traffic_ride_s": 0,
        },
    },
    {
        "route": "run_subway",
        "label_ko": "달리기+지하철",
        "duration_seconds": 1440,
        "cost_krw": 1550,
        "run_seconds": 180,
        "cycle_seconds": 0,
        "uses_train": True,
        "uses_ddareungi": False,
        "uses_taxi": False,
        "requires_own_bike": False,
        "conditional_boarding": {
            "run_distance_m": 450,
            "run_seconds": 180,
            "station_entry_s": 60,
            "boarding_buffer_s": 30,
            "entry_deadline": "08:03",
            "train_departure_time": "08:04:30",
            "next_train_headway_s": 360,
        },
        "time_components": {
            "outdoor_move_s": 180,
            "station_entry_s": 60,
            "platform_move_s": 30,
            "transfer_s": 120,
            "train_wait_s": 270,
            "transit_ride_s": 780,
            "bike_rent_return_s": 0,
            "taxi_wait_s": 0,
            "traffic_ride_s": 0,
        },
    },
    {
        "route": "own_bike",
        "label_ko": "개인 자전거",
        "duration_seconds": 1560,
        "cost_krw": 0,
        "run_seconds": 0,
        "cycle_seconds": 900,
        "uses_train": False,
        "uses_ddareungi": False,
        "uses_taxi": False,
        "requires_own_bike": True,
        "time_components": {
            "outdoor_move_s": 1560,
            "station_entry_s": 0,
            "platform_move_s": 0,
            "transfer_s": 0,
            "train_wait_s": 0,
            "transit_ride_s": 0,
            "bike_rent_return_s": 0,
            "taxi_wait_s": 0,
            "traffic_ride_s": 0,
        },
    },
    {
        "route": "ddareungi",
        "label_ko": "서울 따릉이",
        "duration_seconds": 1620,
        "cost_krw": 1000,
        "run_seconds": 0,
        "cycle_seconds": 1000,
        "uses_train": False,
        "uses_ddareungi": True,
        "uses_taxi": False,
        "requires_own_bike": False,
        "time_components": {
            "outdoor_move_s": 1500,
            "station_entry_s": 0,
            "platform_move_s": 0,
            "transfer_s": 0,
            "train_wait_s": 0,
            "transit_ride_s": 0,
            "bike_rent_return_s": 120,
            "taxi_wait_s": 0,
            "traffic_ride_s": 0,
        },
    },
    {
        "route": "taxi_subway",
        "label_ko": "택시+지하철",
        "duration_seconds": 1320,
        "cost_krw": 8500,
        "run_seconds": 0,
        "cycle_seconds": 0,
        "uses_train": True,
        "uses_ddareungi": False,
        "uses_taxi": True,
        "requires_own_bike": False,
        "time_components": {
            "outdoor_move_s": 60,
            "station_entry_s": 60,
            "platform_move_s": 60,
            "transfer_s": 0,
            "train_wait_s": 120,
            "transit_ride_s": 600,
            "bike_rent_return_s": 0,
            "taxi_wait_s": 120,
            "traffic_ride_s": 300,
        },
    },
]

BOUNDED_INTERVAL_COMPONENT_KEYS = (
    "station_entry_s",
    "platform_move_s",
    "transfer_s",
    "bike_rent_return_s",
)


def resolve_interval_upper_bound(value: Any) -> int | None:
    """Resolve a scalar or [min_s, max_s] interval to its conservative upper bound.

    Returns None when the value or range is missing or invalid, signaling that the
    candidate must be excluded rather than filled with an unverified default.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        if value < 0:
            return None
        return int(value)
    if isinstance(value, (list, tuple)) and len(value) == 2:
        low, high = value
        if (
             low is None
            or high is None
            or isinstance(low, bool)
            or isinstance(high, bool)
            or not isinstance(low, (int, float))
            or not isinstance(high, (int, float))
        ):
            return None
        if low < 0 or high < low:
            return None
        return int(high)
    return None


def compute_total_duration_from_components(time_components: dict[str, Any]) -> tuple[int | None, dict[str, int]]:
    """Compute total duration from time_components, applying upper-bound rules to intervals."""
    resolved: dict[str, int] = {}
    for key, raw_val in time_components.items():
        if key in BOUNDED_INTERVAL_COMPONENT_KEYS:
            bound = resolve_interval_upper_bound(raw_val)
            if bound is None:
                return None, {}
            resolved[key] = bound
        else:
            if raw_val is None or isinstance(raw_val, bool) or not isinstance(raw_val, (int, float)) or raw_val < 0:
                return None, {}
            resolved[key] = int(raw_val)
    return sum(resolved.values()), resolved


def evaluate_train_data_eligibility(payload: dict[str, Any]) -> dict[str, Any]:
    """Evaluate whether train departure data is eligible for fastest-route recommendation.

    Contract:
    - {"age_seconds": 61, "departure_available": True} -> {"eligible_for_fastest": False, "reason": "STALE_TRAIN_DATA"}
    - {"age_seconds": 60, "departure_available": True} -> {"eligible_for_fastest": True, "reason": None}
    """
    departure_available = payload.get("departure_available", True)
    age_seconds = payload.get("age_seconds")
    ttl_seconds = int(payload.get("ttl_seconds", DEFAULT_TTLS["train_age_s"]))

    if not departure_available or age_seconds is None or isinstance(age_seconds, bool):
        return {"eligible_for_fastest": False, "reason": "MISSING_TRAIN_DATA"}
    if not isinstance(age_seconds, (int, float)) or age_seconds < 0:
        return {"eligible_for_fastest": False, "reason": "INVALID_TRAIN_DATA"}
    if age_seconds > ttl_seconds:
        return {"eligible_for_fastest": False, "reason": "STALE_TRAIN_DATA"}
    return {"eligible_for_fastest": True, "reason": None}


def evaluate_data_freshness(
    payload: dict[str, Any],
    *,
    traffic_ttl_s: int | None = None,
    allow_taxi_p95_fallback: bool | None = None,
) -> dict[str, Any]:
    """Evaluate freshness and fail-closed eligibility for single train check or multimodal sources."""
    multimodal_keys = {
        "train_age_s",
        "ddareungi_age_s",
        "taxi_wait_age_s",
        "traffic_age_s",
        "ddareungi_stock",
        "taxi_wait_p95_s",
    }
    if "age_seconds" in payload and not (multimodal_keys & set(payload.keys())):
        return evaluate_train_data_eligibility(payload)

    effective_traffic_ttl = (
        traffic_ttl_s
        if traffic_ttl_s is not None
        else int(payload.get("traffic_ttl_s", DEFAULT_TTLS["traffic_age_s"]))
    )
    if allow_taxi_p95_fallback is None:
        allow_taxi_p95_fallback = bool(payload.get("allow_taxi_p95_fallback", True))

    # 1. Train departure freshness (TTL: 60s, no timetable fallback allowed)
    train_age_s = payload.get("train_age_s", payload.get("age_seconds", 0))
    train_available = payload.get("train_departure_available", payload.get("departure_available", True))
    train_check = evaluate_train_data_eligibility(
        {
            "age_seconds": train_age_s,
            "departure_available": train_available,
            "ttl_seconds": DEFAULT_TTLS["train_age_s"],
        }
    )

    # 2. Ddareungi stock & return availability (TTL: 60s, stock > 0, return_available=True)
    ddareungi_age_s = payload.get("ddareungi_age_s", 0)
    ddareungi_stock = payload.get("ddareungi_stock", 5)
    ddareungi_return_ok = payload.get("ddareungi_return_available", True)

    if ddareungi_age_s is None or not isinstance(ddareungi_age_s, (int, float)) or ddareungi_age_s < 0:
        ddareungi_eligible = False
        ddareungi_reason = "MISSING_DDAREUNGI_DATA"
    elif ddareungi_age_s > DEFAULT_TTLS["ddareungi_age_s"]:
        ddareungi_eligible = False
        ddareungi_reason = "STALE_DDAREUNGI_DATA"
    elif ddareungi_stock is None or ddareungi_stock <= 0:
        ddareungi_eligible = False
        ddareungi_reason = "ZERO_DDAREUNGI_STOCK"
    elif not ddareungi_return_ok:
        ddareungi_eligible = False
        ddareungi_reason = "DDAREUNGI_RETURN_UNAVAILABLE"
    else:
        ddareungi_eligible = True
        ddareungi_reason = None

    # 3. Taxi wait freshness (TTL: 120s; optional fallback p95_wait_seconds + 120 with >=30 samples in 30d)
    taxi_wait_age_s = payload.get("taxi_wait_age_s", 0)
    taxi_wait_available = payload.get("taxi_wait_available", True)
    taxi_wait_p95_s = payload.get("taxi_wait_p95_s")
    taxi_sample_count = int(payload.get("taxi_wait_sample_count", 30))
    taxi_window_days = int(payload.get("taxi_wait_window_days", 30))
    taxi_same_context = bool(payload.get("taxi_wait_same_zone_day_slot", True))

    taxi_wait_is_estimated = False
    taxi_wait_override_s: int | None = None

    if (
        taxi_wait_available
        and taxi_wait_age_s is not None
        and isinstance(taxi_wait_age_s, (int, float))
        and 0 <= taxi_wait_age_s <= DEFAULT_TTLS["taxi_wait_age_s"]
    ):
        taxi_wait_eligible = True
        taxi_wait_reason = None
    elif (
        allow_taxi_p95_fallback
        and taxi_wait_p95_s is not None
        and isinstance(taxi_wait_p95_s, (int, float))
        and taxi_wait_p95_s >= 0
        and taxi_sample_count >= 30
        and 1 <= taxi_window_days <= 30
        and taxi_same_context
    ):
        taxi_wait_eligible = True
        taxi_wait_reason = "ESTIMATED_TAXI_WAIT_P95_PLUS_120"
        taxi_wait_is_estimated = True
        taxi_wait_override_s = int(taxi_wait_p95_s) + 120
    else:
        taxi_wait_eligible = False
        taxi_wait_reason = (
            "STALE_TAXI_WAIT_DATA"
            if (taxi_wait_age_s is not None and isinstance(taxi_wait_age_s, (int, float)) and taxi_wait_age_s > DEFAULT_TTLS["taxi_wait_age_s"])
            else "MISSING_TAXI_WAIT_DATA"
        )

    # 4. Road traffic freshness (TTL: 300s default or 120s strict; never substituted with fixed default)
    traffic_age_s = payload.get("traffic_age_s", 0)
    traffic_available = payload.get("traffic_available", True)
    if not traffic_available or traffic_age_s is None or not isinstance(traffic_age_s, (int, float)) or traffic_age_s < 0:
        traffic_eligible = False
        traffic_reason = "MISSING_TRAFFIC_DATA"
    elif traffic_age_s > effective_traffic_ttl:
        traffic_eligible = False
        traffic_reason = "STALE_TRAFFIC_DATA"
    else:
        traffic_eligible = True
        traffic_reason = None

    return {
        "eligible_for_fastest": train_check["eligible_for_fastest"],
        "reason": train_check["reason"],
        "train": train_check,
        "ddareungi": {
            "eligible_for_fastest": ddareungi_eligible,
            "reason": ddareungi_reason,
            "age_seconds": ddareungi_age_s,
            "ttl_seconds": DEFAULT_TTLS["ddareungi_age_s"],
            "stock": ddareungi_stock,
            "return_available": ddareungi_return_ok,
        },
        "taxi_wait": {
            "eligible_for_fastest": taxi_wait_eligible,
            "reason": taxi_wait_reason,
            "age_seconds": taxi_wait_age_s,
            "ttl_seconds": DEFAULT_TTLS["taxi_wait_age_s"],
            "is_estimated": taxi_wait_is_estimated,
            "estimated_wait_seconds": taxi_wait_override_s,
        },
        "traffic": {
            "eligible_for_fastest": traffic_eligible,
            "reason": traffic_reason,
            "age_seconds": traffic_age_s,
            "ttl_seconds": effective_traffic_ttl,
        },
        "unresolved_data_policy": {
            "traffic_ttl_conflict": {
                "conservative_default_s": 300,
                "strict_alternative_s": 120,
                "applied_ttl_s": effective_traffic_ttl,
                "status": "UNRESOLVED_AUTO_ASSUMPTION",
            },
            "taxi_wait_estimation_conflict": {
                "strict_policy": "prohibit_estimation_exclude_when_stale",
                "conditional_policy": "allow_p95_plus_120_when_30d_same_zone_day_slot_samples_ge_30",
                "applied_allow_p95_fallback": allow_taxi_p95_fallback,
                "status": "UNRESOLVED_AUTO_ASSUMPTION",
            },
        },
    }


def evaluate_conditional_boarding(
    payload: dict[str, Any],
    *,
    minimal: bool = False,
) -> dict[str, Any]:
    """Evaluate conditional train boarding with 1-second boundary precision and fallback re-search.

    Required canonical example:
    {"platform_arrival_s":180,"train_departure_s":240,"boarding_margin_s":60,"baseline_arrival_s":1200,"candidate_arrival_s":960}
    -> {"boardable": True, "saving_s": 240, ...}

    When platform_arrival_s is 181 (181 + 60 > 240):
    -> boardable: False, blocks confirmed boarding guidance, and provides next-train / multimodal fallback.
    """
    platform_arrival_s = int(payload.get("platform_arrival_s", 180))
    train_departure_s = int(payload.get("train_departure_s", 240))
    boarding_margin_s = int(payload.get("boarding_margin_s", 60))
    baseline_arrival_s = int(payload.get("baseline_arrival_s", 1200))
    candidate_arrival_s = int(payload.get("candidate_arrival_s", 960))

    run_allowed = bool(payload.get("run_allowed", True))
    run_distance_m = int(payload.get("run_distance_m", 450))
    run_seconds = int(payload.get("run_seconds", 180))
    station_entry_s = int(payload.get("station_entry_s", 60))
    boarding_buffer_s = int(payload.get("boarding_buffer_s", 30))
    train_age_s = payload.get("train_age_s", 0)
    train_ttl_s = int(payload.get("train_ttl_s", DEFAULT_TTLS["train_age_s"]))
    next_train_wait_s = int(payload.get("next_train_wait_s", 360))
    entry_deadline = str(payload.get("entry_deadline", "08:03"))
    target_train_departure = str(payload.get("target_train_departure", "08:04:30"))
    cost_krw = int(payload.get("cost_krw", 1550))

    train_fresh = (
        train_age_s is not None
        and isinstance(train_age_s, (int, float))
        and 0 <= train_age_s <= train_ttl_s
    )
    margin_satisfied = (platform_arrival_s + boarding_margin_s) <= train_departure_s
    boardable = bool(run_allowed and train_fresh and margin_satisfied)

    if boardable:
        saving_s = baseline_arrival_s - candidate_arrival_s
        guidance_text = f"{entry_deadline}까지 역 입구에 도착하면 {target_train_departure} 열차를 탈 수 있습니다"
        failure_reason = None
        selected_alternative = None
    else:
        saving_s = 0
        if not train_fresh:
            failure_reason = "STALE_TRAIN_DATA"
            guidance_text = (
                f"열차 실시간 정보 유효기간({train_ttl_s}초)이 지나 {target_train_departure} 열차 탑승을 확정 안내하지 않고 "
                "개인 자전거(own_bike, 1560초) 또는 따릉이(ddareungi, 1620초) 경로로 재탐색합니다."
            )
            selected_alternative = "own_bike"
        elif not run_allowed:
            failure_reason = "RUNNING_DISABLED"
            guidance_text = (
                "달리기 비허용 조건이므로 조건부 열차 탑승을 안내하지 않고 "
                "개인 자전거(own_bike, 1560초) 또는 다음 열차(walk_subway, 1800초)로 재탐색합니다."
            )
            selected_alternative = "own_bike"
        else:
            failure_reason = "MISSED_BOARDING_DEADLINE"
            guidance_text = (
                f"플랫폼 도착({platform_arrival_s}초)이 마감 여유({boarding_margin_s}초 포함 {train_departure_s}초)를 초과하여 "
                f"탑승 불가로 판정했습니다. 다음 열차(+{next_train_wait_s}초 대기, 예상 도착 {candidate_arrival_s + next_train_wait_s}초) "
                "또는 개인 자전거(own_bike, 1560초)·따릉이(ddareungi, 1620초) 대안을 제시합니다."
            )
            selected_alternative = "next_train_or_own_bike"

    if minimal:
        return {"boardable": boardable, "saving_s": saving_s}

    return {
        "boardable": boardable,
        "saving_s": saving_s,
        "confirmed_boarding_allowed": boardable,
        "failure_reason": failure_reason,
        "guidance_text": guidance_text,
        "entry_deadline": entry_deadline,
        "target_train_departure": target_train_departure,
        "run_distance_m": run_distance_m,
        "run_seconds": run_seconds,
        "run_speed_mps": round(run_distance_m / run_seconds, 2) if run_seconds > 0 else 0.0,
        "station_entry_s": station_entry_s,
        "boarding_buffer_s": boarding_buffer_s,
        "platform_arrival_s": platform_arrival_s,
        "train_departure_s": train_departure_s,
        "boarding_margin_s": boarding_margin_s,
        "required_arrival_plus_margin_s": platform_arrival_s + boarding_margin_s,
        "cost_krw": cost_krw,
        "fallback": {
            "triggered": not boardable,
            "reason": failure_reason,
            "next_train_wait_s": next_train_wait_s,
            "next_train_arrival_s": candidate_arrival_s + next_train_wait_s,
            "next_train_saving_s": baseline_arrival_s - (candidate_arrival_s + next_train_wait_s),
            "alternative_routes": [
                {"route": "own_bike", "duration_seconds": 1560, "cost_krw": 0},
                {"route": "ddareungi", "duration_seconds": 1620, "cost_krw": 1000},
                {"route": "walk_subway", "duration_seconds": 1800, "cost_krw": 1550},
            ],
            "selected_alternative": selected_alternative,
        },
    }


def evaluate_multimodal_routes(payload: dict[str, Any]) -> dict[str, Any]:
    """Evaluate all multimodal route candidates under user constraints, freshness gates, and conditional boarding."""
    budget_krw = int(payload.get("budget_krw", 10000))
    max_run_seconds = int(payload.get("max_run_seconds", 180))
    max_cycle_seconds = int(payload.get("max_cycle_seconds", 1200))
    own_bike_available = bool(payload.get("own_bike", True))
    allow_walk = bool(payload.get("allow_walk", True))

    freshness = evaluate_data_freshness(payload)

    raw_candidates = deepcopy(payload.get("candidates", SEOUL_VALUE_V1_CANDIDATES))
    component_overrides: dict[str, dict[str, Any]] = payload.get("component_overrides", {})

    # Optional conditional boarding override for run_subway
    boarding_override = payload.get("conditional_boarding")
    if boarding_override is not None:
        boarding_eval = evaluate_conditional_boarding(
            {
                **boarding_override,
                "train_age_s": payload.get("train_age_s", 0),
                "run_allowed": max_run_seconds > 0,
            }
        )
    else:
        boarding_eval = evaluate_conditional_boarding(
            {
                "platform_arrival_s": int(payload.get("platform_arrival_s", 180)),
                "train_departure_s": int(payload.get("train_departure_s", 240)),
                "boarding_margin_s": int(payload.get("boarding_margin_s", 60)),
                "baseline_arrival_s": 1200,
                "candidate_arrival_s": 960,
                "train_age_s": payload.get("train_age_s", 0),
                "run_allowed": max_run_seconds >= 180,
            }
        )

    evaluated_candidates: list[dict[str, Any]] = []
    baseline_eligible_duration: int | None = None

    for candidate in raw_candidates:
        route_id = candidate["route"]
        reasons: list[str] = []

        time_components = deepcopy(candidate.get("time_components", {}))
        if route_id in component_overrides:
            time_components.update(component_overrides[route_id])

        # Apply estimated taxi wait if p95 + 120 fallback was triggered
        if candidate.get("uses_taxi") and freshness["taxi_wait"]["is_estimated"]:
            estimated_wait = freshness["taxi_wait"]["estimated_wait_seconds"]
            if estimated_wait is not None:
                time_components["taxi_wait_s"] = estimated_wait

        computed_duration, resolved_components = compute_total_duration_from_components(time_components)
        if computed_duration is None:
            reasons.append("MISSING_COMPONENT_RANGE")
            duration_seconds = int(candidate.get("duration_seconds", 0))
        else:
            # If overrides or taxi p95 fallback changed component sum, use computed_duration
            default_components = next(
                (c["time_components"] for c in SEOUL_VALUE_V1_CANDIDATES if c["route"] == route_id),
                None,
            )
            if (
                route_id in component_overrides
                or (candidate.get("uses_taxi") and freshness["taxi_wait"]["is_estimated"])
                or default_components != time_components
            ):
                duration_seconds = computed_duration
            else:
                duration_seconds = int(candidate["duration_seconds"])

        cost_krw = int(candidate["cost_krw"])
        run_seconds = int(candidate["run_seconds"])
        cycle_seconds = int(candidate["cycle_seconds"])

        # Data freshness checks (Fail-Closed)
        if candidate.get("uses_train") and not freshness["train"]["eligible_for_fastest"]:
            reasons.append(freshness["train"]["reason"] or "STALE_TRAIN_DATA")

        if candidate.get("uses_ddareungi") and not freshness["ddareungi"]["eligible_for_fastest"]:
            reasons.append(freshness["ddareungi"]["reason"] or "STALE_DDAREUNGI_DATA")

        if candidate.get("uses_taxi"):
            if not freshness["taxi_wait"]["eligible_for_fastest"]:
                reasons.append(freshness["taxi_wait"]["reason"] or "STALE_TAXI_WAIT_DATA")
            if not freshness["traffic"]["eligible_for_fastest"]:
                reasons.append(freshness["traffic"]["reason"] or "STALE_TRAFFIC_DATA")

        # Baseline eligibility depends on data freshness & valid components
        is_data_eligible = len(reasons) == 0
        if route_id == BASELINE_ROUTE_ID and is_data_eligible:
            baseline_eligible_duration = duration_seconds

        # Conditional boarding cutoff check for run_subway
        if route_id == "run_subway" and not boarding_eval["boardable"]:
            if boarding_eval["failure_reason"] and boarding_eval["failure_reason"] not in reasons:
                reasons.append(boarding_eval["failure_reason"])

        # User constraint checks
        if route_id == "walk" and not allow_walk:
            reasons.append("WALK_DISABLED")
        if cost_krw > budget_krw:
            reasons.append("BUDGET_EXCEEDED")
        if run_seconds > max_run_seconds:
            reasons.append("RUN_LIMIT_EXCEEDED")
        if cycle_seconds > max_cycle_seconds:
            reasons.append("CYCLE_LIMIT_EXCEEDED")
        if candidate.get("requires_own_bike") and not own_bike_available:
            reasons.append("NO_OWN_BIKE")

        eligible = len(reasons) == 0
        evaluated_candidates.append(
            {
                "route": route_id,
                "label_ko": candidate.get("label_ko", route_id),
                "duration_seconds": duration_seconds,
                "cost_krw": cost_krw,
                "run_seconds": run_seconds,
                "cycle_seconds": cycle_seconds,
                "uses_train": bool(candidate.get("uses_train", False)),
                "uses_ddareungi": bool(candidate.get("uses_ddareungi", False)),
                "uses_taxi": bool(candidate.get("uses_taxi", False)),
                "requires_own_bike": bool(candidate.get("requires_own_bike", False)),
                "time_components": resolved_components if resolved_components else time_components,
                "taxi_wait_estimated": bool(
                    candidate.get("uses_taxi") and freshness["taxi_wait"]["is_estimated"]
                ),
                "eligible": eligible,
                "exclusion_reasons": reasons,
            }
        )

    eligible_candidates = [c for c in evaluated_candidates if c["eligible"]]
    eligible_candidates.sort(key=lambda c: (c["duration_seconds"], c["cost_krw"]))

    if not eligible_candidates:
        return {
            "status": "NO_ELIGIBLE_ROUTE",
            "http_status": 503,
            "http_body": {"error": "NO_ELIGIBLE_ROUTE"},
            "recommendation": {"error": "NO_ELIGIBLE_ROUTE", "status_code": 503},
            "route_candidates": evaluated_candidates,
            "freshness": freshness,
            "conditional_guidance": boarding_eval,
            "validation_status": {
                "scope": "fixture_verification_only",
                "supplier_api_connected": False,
                "field_trial_status": "NOT_CONDUCTED_SKIP_RUN",
                "claims_global_optimality": False,
            },
        }

    best = eligible_candidates[0]
    if baseline_eligible_duration is not None:
        saved_seconds: int | None = baseline_eligible_duration - best["duration_seconds"]
    else:
        saved_seconds = None

    recommendation = {
        "route": best["route"],
        "duration_seconds": best["duration_seconds"],
        "cost_krw": best["cost_krw"],
        "saved_seconds": saved_seconds,
    }

    explanation = build_llm_explanation(
        recommendation=recommendation,
        best_candidate=best,
        boarding_eval=boarding_eval,
        freshness=freshness,
    )

    return {
        "status": "OK",
        "http_status": 200,
        "recommendation": recommendation,
        "best_candidate": best,
        "baseline_route": BASELINE_ROUTE_ID,
        "baseline_eligible": baseline_eligible_duration is not None,
        "baseline_duration_seconds": baseline_eligible_duration,
        "route_candidates": evaluated_candidates,
        "freshness": freshness,
        "conditional_guidance": boarding_eval,
        "llm_explanation": explanation,
        "supplier_readiness": [
            {
                "provider": "seoul_subway_realtime",
                "access_verified": False,
                "live_connected": False,
                "verification_mode": "fixture_only",
            },
            {
                "provider": "seoul_ddareungi_realtime",
                "access_verified": False,
                "live_connected": False,
                "verification_mode": "fixture_only",
            },
            {
                "provider": "seoul_taxi_and_traffic",
                "access_verified": False,
                "live_connected": False,
                "verification_mode": "fixture_only",
            },
        ],
        "validation_status": {
            "scope": "fixture_verification_only",
            "supplier_api_connected": False,
            "field_trial_status": "NOT_CONDUCTED_SKIP_RUN",
            "claims_global_optimality": False,
        },
    }


def recommend_route(payload: dict[str, Any], *, include_details: bool = False) -> dict[str, Any]:
    """Return the fastest eligible route matching user constraints and freshness rules.

    Default return shape matches the exact Seed specification:
    {"route": ..., "duration_seconds": ..., "cost_krw": ..., "saved_seconds": ...}
    or {"error": "NO_ELIGIBLE_ROUTE", "status_code": 503} when no route is eligible.
    """
    evaluation = evaluate_multimodal_routes(payload)
    if include_details:
        return evaluation
    return deepcopy(evaluation["recommendation"])


def run_ranking_inversion_chain() -> list[dict[str, Any]]:
    """Run the 5-step canonical ranking inversion chain from route_service_seed.yaml."""
    steps = [
        {
            "step": "baseline_full_budget",
            "input": {
                "budget_krw": 10000,
                "max_run_seconds": 180,
                "max_cycle_seconds": 1200,
                "own_bike": True,
            },
            "expected": {
                "route": "taxi_subway",
                "duration_seconds": 1320,
                "cost_krw": 8500,
                "saved_seconds": 480,
            },
        },
        {
            "step": "lower_budget_to_2000",
            "input": {
                "budget_krw": 2000,
                "max_run_seconds": 180,
                "max_cycle_seconds": 1200,
                "own_bike": True,
            },
            "expected": {
                "route": "run_subway",
                "duration_seconds": 1440,
                "cost_krw": 1550,
                "saved_seconds": 360,
            },
        },
        {
            "step": "lower_run_limit_to_0",
            "input": {
                "budget_krw": 2000,
                "max_run_seconds": 0,
                "max_cycle_seconds": 1200,
                "own_bike": True,
            },
            "expected": {
                "route": "own_bike",
                "duration_seconds": 1560,
                "cost_krw": 0,
                "saved_seconds": 240,
            },
        },
        {
            "step": "disable_own_bike",
            "input": {
                "budget_krw": 2000,
                "max_run_seconds": 0,
                "max_cycle_seconds": 1200,
                "own_bike": False,
            },
            "expected": {
                "route": "ddareungi",
                "duration_seconds": 1620,
                "cost_krw": 1000,
                "saved_seconds": 180,
            },
        },
        {
            "step": "deplete_ddareungi_stock",
            "input": {
                "budget_krw": 2000,
                "max_run_seconds": 0,
                "max_cycle_seconds": 1200,
                "own_bike": False,
                "ddareungi_stock": 0,
            },
            "expected": {
                "route": "walk_subway",
                "duration_seconds": 1800,
                "cost_krw": 1550,
                "saved_seconds": 0,
            },
        },
    ]

    results = []
    for item in steps:
        actual = recommend_route(item["input"])
        results.append(
            {
                "step": item["step"],
                "input": item["input"],
                "expected": item["expected"],
                "actual": actual,
                "passed": actual == item["expected"],
            }
        )
    return results


def build_llm_explanation(
    *,
    recommendation: dict[str, Any],
    best_candidate: dict[str, Any],
    boarding_eval: dict[str, Any],
    freshness: dict[str, Any],
) -> dict[str, Any]:
    """Generate a deterministic, evidence-aligned explanation object for the recommended route."""
    route_id = recommendation["route"]
    duration_s = recommendation["duration_seconds"]
    cost_krw = recommendation["cost_krw"]
    saved_s = recommendation["saved_seconds"]

    saved_clause = (
        f"도보+지하철 기준 대비 {saved_s}초 단축"
        if saved_s is not None
        else "도보+지하철 기준 경로 데이터 만료로 절약시간 미표시"
    )
    estimation_clause = (
        " (택시 대기시간은 최근 30일 동일 구역·요일·시간대 30건 이상 표본 기반 p95+120초 추정값 적용)"
        if best_candidate.get("taxi_wait_estimated")
        else ""
    )

    if route_id == "run_subway" and boarding_eval.get("boardable"):
        summary = (
            f"{boarding_eval[' guidance_text' if ' guidance_text' in boarding_eval else 'guidance_text']}. "
            f"달리기 {boarding_eval['run_distance_m']}m/{boarding_eval['run_seconds']}초, "
            f"역 진입 {boarding_eval['station_entry_s']}초, 탑승 여유 {boarding_eval['boarding_buffer_s']}초를 반영한 "
            f"총 소요시간은 {duration_s}초, 비용은 {cost_krw}원({saved_clause})입니다."
        )
    else:
        summary = (
            f"가용 데이터와 사용자 조건 하의 최단시간 경로는 {route_id}이며, "
            f"총 소요시간 {duration_s}초, 비용 {cost_krw}원({saved_clause}){estimation_clause}입니다."
        )

    return {
        "text": summary,
        "route": route_id,
        "duration_seconds": duration_s,
        "cost_krw": cost_krw,
        "saved_seconds": saved_s,
        "taxi_wait_estimated": bool(best_candidate.get("taxi_wait_estimated", False)),
        "boarding_condition": (
            boarding_eval["guidance_text"] if route_id == "run_subway" and boarding_eval["boardable"] else None
        ),
        "evidence_disclaimer": (
            "본 결과는 서울 이동 fixture 기반 계산 검증이며, 실제 공급자 API 연결이나 현장 도착시간 단축(현장시험 12건 미실시)을 보증하지 않습니다."
        ),
        "freshness_snapshot": {
            "train_eligible": freshness["train"]["eligible_for_fastest"],
            "ddareungi_eligible": freshness["ddareungi"]["eligible_for_fastest"],
            "taxi_wait_eligible": freshness["taxi_wait"]["eligible_for_fastest"],
            "traffic_eligible": freshness["traffic"]["eligible_for_fastest"],
        },
    }


def check_explanation_consistency(explanation: dict[str, Any], evaluation: dict[str, Any]) -> bool:
    """Verify that LLM explanation numbers and boarding claims strictly match engine output."""
    if evaluation.get("status") != "OK":
        return False
    rec = evaluation["recommendation"]
    if explanation.get("route") != rec["route"]:
        return False
    if explanation.get("duration_seconds") != rec["duration_seconds"]:
        return False
    if explanation.get("cost_krw") != rec["cost_krw"]:
        return False
    if explanation.get("saved_seconds") != rec["saved_seconds"]:
        return False

    text = str(explanation.get("text", ""))
    if str(rec["duration_seconds"]) not in text or str(rec["cost_krw"]) not in text:
        return False

    # Excluded candidates must never have boarding or arrival claims fabricated in the explanation
    excluded_routes = [c["route"] for c in evaluation.get("route_candidates", []) if not c["eligible"]]
    if "run_subway" in excluded_routes and "08:04:30 열차를 탈 수 있습니다" in text:
        return False

    return True
