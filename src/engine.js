export const SEED_ID = 'seed_f1602f353109';
export const INVERSION_SEED_ID = 'seed_c04d407ebfaf';

export const COMMUTE_DEFAULTS = Object.freeze({
  origin: '서울 역삼역 인근 (강남대로)',
  destination: '홍대입구역 2번 출구',
  departure_clock: '08:00:00',
  departure_s: 0,
  express_train_clock: '08:04:30',
  train_departure_s: 270,
  station_entry_s: 60,
  boarding_safety_margin_s: 30,
  entry_cutoff_s: 180, // 270 - 60 - 30 = 180 (08:03:00)
  platform_cutoff_s: 240, // 270 - 30 = 240 (08:04:00)
  next_train_penalty_s: 360,
  run_distance_m: 450,
  run_speed_mps: 2.5,
  budget_krw: 10000,
  entry_arrival_s: 180,
  platform_arrival_s: 180,
  max_run_seconds: 180,
  max_cycle_seconds: 1200,
  own_bike: true,
  ddareungi_stock: 4,
  ddareungi_return_ok: true,
  train_age_s: 12,
  ddareungi_age_s: 15,
  taxi_wait_age_s: 25,
  traffic_age_s: 40,
  taxi_wait_p95_s: 180,
  taxi_sample_count_30d: 42,
  taxi_wait_policy: 'strict_forbid', // 'strict_forbid' | 'allow_p95_plus_120'
  traffic_ttl_policy: 'standard_300s', // 'standard_300s' | 'strict_120s'
  exclude_walk: false
});

export const UNRESOLVED_DATA_POLICY = Object.freeze({
  seed_id: SEED_ID,
  inversion_seed_id: INVERSION_SEED_ID,
  status: 'UNRESOLVED_IN_SEED_AUDITABLE_TOGGLE',
  note: '사용자 확정 요구와 자동 인터뷰 가정을 엄격히 분리하며, 마지막 인터뷰까지 충돌이 남은 두 정책은 확정 정책으로 둔갑시키지 않고 감사 가능한 토글로 노출한다.',
  conflicts: [
    {
      id: 'traffic_ttl_conflict',
      title: '도로 교통 데이터 유효기간(TTL) 충돌: 300초 vs 120초',
      optionA: { key: 'standard_300s', label: '완화 가정 (TTL 300초)', ttl_s: 300 },
      optionB: { key: 'strict_120s', label: '엄격 가정 (TTL 120초)', ttl_s: 120 },
      resolution: '확정 정책으로 채택하지 않고 UI/API에서 traffic_ttl_policy로 전환 및 비교 검증'
    },
    {
      id: 'taxi_wait_estimation_conflict',
      title: '실시간 택시 대기 결측/만료 시 추정 허용 여부 충돌',
      optionA: { key: 'strict_forbid', label: '추정 전면 금지 (TTL 120초 초과 시 즉시 차단)' },
      optionB: {
        key: 'allow_p95_plus_120',
        label: '조건부 허용 (최근 30일 동일 구역·요일·시간대 표본 30건+ 시 p95 + 120초 보수적 가산)'
      },
      resolution: '확정 정책으로 채택하지 않고 UI/API에서 taxi_wait_policy로 전환 및 비교 검증'
    }
  ],
  auto_assumptions: [
    { key: 'train_ttl_s', value: 60, source: 'from-auto assumption (열차 실시간 정보 유효기간 60초)' },
    { key: 'ddareungi_ttl_s', value: 60, source: 'from-auto assumption (따릉이 재고/반납 정보 유효기간 60초)' },
    { key: 'taxi_wait_ttl_s', value: 120, source: 'from-auto assumption (택시 승차 대기 유효기간 120초)' },
    { key: 'station_entry_s', value: 60, source: 'from-auto assumption (역 입구 -> 플랫폼 계단 이동 60초)' },
    { key: 'boarding_safety_margin_s', value: 30, source: 'from-auto assumption (플랫폼 안전 탑승 마감 여유 30초)' }
  ],
  supplier_readiness: [
    {
      supplier: '서울시 실시간 지하철 열차 위치/도착 API',
      access_verified: false,
      live_connected: false,
      verification_scope: 'fixture_verified_only',
      condition_for_live: 'API 키 발급·호출 쿼터·지연 시간(60초 이내) 현장 검증 필요'
    },
    {
      supplier: '서울시 공공자전거(따릉이) 실시간 대여소 재고 API',
      access_verified: false,
      live_connected: false,
      verification_scope: 'fixture_verified_only',
      condition_for_live: '출발 대여소 거치대 수 및 도착지 반납 거치 가능 여부 API 확인 필요'
    },
    {
      supplier: '택시 호출/배차 대기시간 & 도로 교통 소통 API',
      access_verified: false,
      live_connected: false,
      verification_scope: 'fixture_verified_only',
      condition_for_live: '상용 모빌리티 공급자 계약·비용·실시간 배차 대기 피드 확보 필요'
    }
  ]
});

export function formatClockFromOffset(offsetSeconds, baseHour = 8, baseMinute = 0, baseSecond = 0) {
  const baseTotal = baseHour * 3600 + baseMinute * 60 + baseSecond;
  const total = Math.max(0, Math.round(baseTotal + Number(offsetSeconds || 0)));
  const hh = String(Math.floor(total / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Seed canonical boarding check:
 * evaluateBoardingCheck({
 *   platform_arrival_s: 180,
 *   train_departure_s: 240,
 *   boarding_margin_s: 60,
 *   baseline_arrival_s: 1200,
 *   candidate_arrival_s: 960
 * })
 * -> 180 returns { boardable: true, saving_s: 240 }
 * -> 181 returns { boardable: false, saving_s: 0, reason: 'BOARDING_MARGIN_VIOLATED', next_train_penalty_s: 360 }
 */
export function evaluateBoardingCheck({
  platform_arrival_s = 180,
  train_departure_s = 240,
  boarding_margin_s = 60,
  baseline_arrival_s = 1200,
  candidate_arrival_s = 960,
  next_train_penalty_s = 360
} = {}) {
  const arrival = Number(platform_arrival_s);
  const departure = Number(train_departure_s);
  const margin = Number(boarding_margin_s);
  const baseline = Number(baseline_arrival_s);
  const candidate = Number(candidate_arrival_s);
  const penalty = Number(next_train_penalty_s);

  const cutoff_s = departure - margin;
  const effective_ready_s = arrival + margin;
  const boardable = effective_ready_s <= departure;

  if (boardable) {
    return {
      boardable: true,
      saving_s: Math.max(0, baseline - candidate),
      cutoff_s,
      platform_arrival_s: arrival,
      train_departure_s: departure,
      boarding_margin_s: margin,
      margin_slack_s: departure - effective_ready_s,
      reason: null
    };
  }

  return {
    boardable: false,
    saving_s: 0,
    reason: 'BOARDING_MARGIN_VIOLATED',
    next_train_penalty_s: penalty,
    fallback_arrival_s: candidate + penalty,
    cutoff_s,
    platform_arrival_s: arrival,
    train_departure_s: departure,
    boarding_margin_s: margin,
    margin_deficit_s: effective_ready_s - departure
  };
}

/**
 * Constraint-Aware Ranking Inversion from seed_c04d407ebfaf:
 * When Candidate A has higher evidence/speed but violates user's limit, exclude A and promote B to rank 1.
 */
export function evaluateConstraintInversion({
  daily_limit_minutes = 10,
  candidates = []
} = {}) {
  const limit = Number(daily_limit_minutes);
  const eligible = [];
  const excluded = [];

  for (const item of candidates) {
    const minutes = Number(item.daily_minutes);
    if (minutes > limit) {
      excluded.push({
        id: item.id,
        reason: 'DAILY_LIMIT_EXCEEDED',
        alt_reason: 'DAILY_TIME_LIMIT_EXCEEDED',
        daily_minutes: minutes,
        limit_minutes: limit
      });
    } else {
      eligible.push({ ...item });
    }
  }

  const evidenceOrder = { HIGH: 1, MODERATE: 2, LOW: 3 };
  eligible.sort((a, b) => {
    const rankA = a.evidence_rank ?? evidenceOrder[a.evidence_level] ?? 99;
    const rankB = b.evidence_rank ?? evidenceOrder[b.evidence_level] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return Number(a.daily_minutes) - Number(b.daily_minutes);
  });

  const ranking = eligible.map((item, idx) => ({ id: item.id, rank: idx + 1 }));
  const top = ranking[0];
  const dropped = excluded[0];

  const explanation =
    top && dropped
      ? `${dropped.id}의 근거수준이 더 높지만 하루 ${dropped.daily_minutes}분이 필요하여 사용자의 ${limit}분 한도를 초과하므로, 한도를 충족하는 ${top.id}를 1순위로 제시합니다.`
      : top
        ? `사용자 한도(${limit}분)를 충족하는 ${top.id}를 1순위로 제시합니다.`
        : '사용자 한도를 충족하는 후보가 없습니다.';

  return {
    ranking,
    recommendations: ranking,
    excluded,
    explanation
  };
}

/**
 * Evaluates freshness/TTL gates for train, ddareungi, taxi_wait, and traffic feeds.
 */
export function evaluateDataEvidence(rawInput = {}) {
  const train_age_s = Number(rawInput.train_age_s ?? COMMUTE_DEFAULTS.train_age_s);
  const ddareungi_age_s = Number(rawInput.ddareungi_age_s ?? COMMUTE_DEFAULTS.ddareungi_age_s);
  const taxi_wait_age_s = Number(rawInput.taxi_wait_age_s ?? COMMUTE_DEFAULTS.taxi_wait_age_s);
  const traffic_age_s = Number(
    rawInput.traffic_age_s ?? rawInput.road_traffic_age_s ?? COMMUTE_DEFAULTS.traffic_age_s
  );
  const ddareungi_stock = Number(rawInput.ddareungi_stock ?? COMMUTE_DEFAULTS.ddareungi_stock);
  const ddareungi_return_ok =
    rawInput.ddareungi_return_ok !== undefined
      ? Boolean(rawInput.ddareungi_return_ok)
      : COMMUTE_DEFAULTS.ddareungi_return_ok;

  const traffic_ttl_policy = rawInput.traffic_ttl_policy || COMMUTE_DEFAULTS.traffic_ttl_policy;
  const traffic_ttl_s =
    traffic_ttl_policy === 'strict_120s' ||
    traffic_ttl_policy === 'strict' ||
    String(traffic_ttl_policy) === '120'
      ? 120
      : 300;

  const taxi_wait_policy = rawInput.taxi_wait_policy || COMMUTE_DEFAULTS.taxi_wait_policy;
  const taxi_wait_p95_s = Number(rawInput.taxi_wait_p95_s ?? COMMUTE_DEFAULTS.taxi_wait_p95_s);
  const taxi_sample_count_30d = Number(
    rawInput.taxi_sample_count_30d ?? COMMUTE_DEFAULTS.taxi_sample_count_30d
  );

  const trainFresh = !rawInput.train_missing && train_age_s <= 60;
  const trainReason = rawInput.train_missing
    ? 'MISSING_TRAIN_DATA'
    : train_age_s <= 60
      ? null
      : 'STALE_TRAIN_DATA';

  const ddareungiFresh = !rawInput.ddareungi_missing && ddareungi_age_s <= 60;
  const ddareungiReason = rawInput.ddareungi_missing
    ? 'MISSING_DDAREUNGI_DATA'
    : ddareungi_age_s > 60
      ? 'STALE_DDAREUNGI_DATA'
      : ddareungi_stock <= 0
        ? 'DDAREUNGI_EMPTY_DOCK'
        : !ddareungi_return_ok
          ? 'DDAREUNGI_RETURN_UNAVAILABLE'
          : null;

  const taxiLiveFresh = !rawInput.taxi_wait_missing && taxi_wait_age_s <= 120;
  const taxiFallbackAllowed =
    !taxiLiveFresh &&
    taxi_wait_policy === 'allow_p95_plus_120' &&
    taxi_sample_count_30d >= 30 &&
    Number.isFinite(taxi_wait_p95_s);

  const taxiEligible = taxiLiveFresh || taxiFallbackAllowed;
  const taxiReason = taxiLiveFresh
    ? null
    : taxiFallbackAllowed
      ? 'ESTIMATED_P95_PLUS_120S'
      : 'STALE_TAXI_WAIT_DATA';

  const trafficFresh = !rawInput.traffic_missing && traffic_age_s <= traffic_ttl_s;
  const trafficReason = rawInput.traffic_missing
    ? 'MISSING_TRAFFIC_DATA'
    : traffic_age_s <= traffic_ttl_s
      ? null
      : 'STALE_TRAFFIC_DATA';

  const items = [
    {
      field: 'train',
      provider: '서울교통공사/도시철도 실시간 열차 위치 피드 (Fixture)',
      observed_age_s: train_age_s,
      ttl_s: 60,
      missing: Boolean(rawInput.train_missing),
      status: trainFresh ? 'FRESH' : 'STALE_TRAIN_DATA',
      eligible_for_fastest: trainFresh,
      reason: trainReason,
      verification_scope: 'fixture_simulation'
    },
    {
      field: 'ddareungi',
      provider: '서울시 공공자전거 따릉이 실시간 대여소 현황 피드 (Fixture)',
      observed_age_s: ddareungi_age_s,
      ttl_s: 60,
      stock: ddareungi_stock,
      return_dock_ok: ddareungi_return_ok,
      missing: Boolean(rawInput.ddareungi_missing),
      status: ddareungiReason === null ? 'FRESH' : ddareungiReason,
      eligible_for_fastest: ddareungiReason === null,
      reason: ddareungiReason,
      verification_scope: 'fixture_simulation'
    },
    {
      field: 'taxi_wait',
      provider: '서울 강남권 택시 배차 대기 피드 (Fixture)',
      observed_age_s: taxi_wait_age_s,
      ttl_s: 120,
      policy: taxi_wait_policy,
      p95_wait_s: taxi_wait_p95_s,
      sample_count_30d: taxi_sample_count_30d,
      missing: Boolean(rawInput.taxi_wait_missing),
      status: taxiLiveFresh ? 'FRESH' : taxiFallbackAllowed ? 'FALLBACK_P95_PLUS_120' : 'STALE_TAXI_WAIT_DATA',
      eligible_for_fastest: taxiEligible,
      reason: taxiEligible ? null : taxiReason,
      verification_scope: 'fixture_simulation'
    },
    {
      field: 'traffic',
      provider: '서울시 TOPIS 도로 소통 속도 피드 (Fixture)',
      observed_age_s: traffic_age_s,
      ttl_s: traffic_ttl_s,
      policy: traffic_ttl_policy,
      missing: Boolean(rawInput.traffic_missing),
      status: trafficFresh ? 'FRESH' : 'STALE_TRAFFIC_DATA',
      eligible_for_fastest: trafficFresh,
      reason: trafficReason,
      verification_scope: 'fixture_simulation'
    }
  ];

  return {
    train_age_s,
    train_ttl_s: 60,
    status: trainFresh ? 'FRESH' : 'STALE_TRAIN_DATA',
    eligible_for_fastest: trainFresh,
    reason: trainReason,
    ddareungi_age_s,
    ddareungi_ttl_s: 60,
    ddareungi_stock,
    ddareungi_return_ok,
    taxi_wait_age_s,
    taxi_wait_ttl_s: 120,
    taxi_wait_policy,
    taxi_fallback_used: taxiFallbackAllowed,
    traffic_age_s,
    traffic_ttl_s,
    traffic_ttl_policy,
    any_stale: !trainFresh || !ddareungiFresh || !taxiEligible || !trafficFresh,
    items
  };
}

/**
 * Full deterministic evaluation of the 6 multimodal commute candidates,
 * 1-second boarding gate, and freshness fail-closed gate.
 */
export function evaluateCommute(rawInput = {}) {
  const budget_krw = Number(rawInput.budget_krw ?? COMMUTE_DEFAULTS.budget_krw);
  const max_run_seconds = Number(rawInput.max_run_seconds ?? COMMUTE_DEFAULTS.max_run_seconds);
  const max_cycle_seconds = Number(rawInput.max_cycle_seconds ?? COMMUTE_DEFAULTS.max_cycle_seconds);
  const own_bike =
    rawInput.own_bike !== undefined ? Boolean(rawInput.own_bike) : COMMUTE_DEFAULTS.own_bike;
  const run_allowed =
    rawInput.run_allowed !== undefined ? Boolean(rawInput.run_allowed) : max_run_seconds > 0;
  const exclude_walk = Boolean(rawInput.exclude_walk ?? COMMUTE_DEFAULTS.exclude_walk);

  // Support both entry_arrival_s and platform_arrival_s slider inputs seamlessly (180s vs 181s 1-second boundary)
  const rawArrival =
    rawInput.entry_arrival_s !== undefined
      ? Number(rawInput.entry_arrival_s)
      : rawInput.platform_arrival_s !== undefined
        ? Number(rawInput.platform_arrival_s)
        : COMMUTE_DEFAULTS.entry_arrival_s;

  const entry_arrival_s = Number.isFinite(rawArrival) ? rawArrival : 180;
  const station_entry_s = COMMUTE_DEFAULTS.station_entry_s; // 60s
  const boarding_safety_margin_s = COMMUTE_DEFAULTS.boarding_safety_margin_s; // 30s
  const train_departure_s = COMMUTE_DEFAULTS.train_departure_s; // 270s (08:04:30)
  const next_train_penalty_s = COMMUTE_DEFAULTS.next_train_penalty_s; // 360s

  const computed_platform_arrival_s = entry_arrival_s + station_entry_s; // 240s when entry_arrival_s = 180s
  const effective_ready_s = computed_platform_arrival_s + boarding_safety_margin_s; // 270s when entry_arrival_s = 180s
  const boardable = effective_ready_s <= train_departure_s; // true for <= 180, false for >= 181

  const canonical_boarding_check = evaluateBoardingCheck({
    platform_arrival_s: entry_arrival_s,
    train_departure_s: 240,
    boarding_margin_s: 60,
    baseline_arrival_s: 1200,
    candidate_arrival_s: 960,
    next_train_penalty_s: 360
  });

  const evidence = evaluateDataEvidence(rawInput);
  const trainFresh = evidence.eligible_for_fastest; // train_age_s <= 60

  const taxiWaitSeconds = evidence.taxi_fallback_used
    ? Number(rawInput.taxi_wait_p95_s ?? COMMUTE_DEFAULTS.taxi_wait_p95_s) + 120
    : 120;
  const taxiDurationSeconds = 1320 + (taxiWaitSeconds - 120);

  const runSubwayDurationSeconds = boardable ? 1440 : 1440 + next_train_penalty_s; // 1440s vs 1800s

  const rawCandidates = [
    {
      id: 'taxi_subway',
      route: 'taxi_subway',
      label: '택시+지하철 (환승 결합)',
      short_label: '택시+지하철',
      mode_icon: '🚕+🚇',
      duration_seconds: taxiDurationSeconds,
      arrival_clock: formatClockFromOffset(taxiDurationSeconds),
      cost_krw: 8500,
      cost_range_label: '₩8,400~₩8,500',
      run_seconds: 0,
      cycle_seconds: 0,
      uses_train: true,
      time_components: {
        taxi_wait_s: taxiWaitSeconds,
        taxi_drive_s: 240,
        station_entry_s: 60,
        platform_transfer_s: 30,
        train_wait_s: 30,
        subway_ride_s: 720,
        exit_walk_s: 120,
        total_s: taxiDurationSeconds
      },
      summary: '강남 정체 구간 전 지하철역까지 단거리 택시 점프 후 급행 환승'
    },
    {
      id: 'run_subway',
      route: 'run_subway',
      label: '달리기+지하철 (08:04:30 급행 조건부)',
      short_label: '달리기+지하철',
      mode_icon: '🏃+🚇',
      duration_seconds: runSubwayDurationSeconds,
      base_duration_seconds: 1440,
      missed_duration_seconds: 1800,
      arrival_clock: formatClockFromOffset(runSubwayDurationSeconds),
      cost_krw: 1550,
      cost_range_label: '₩1,550',
      run_seconds: 180,
      cycle_seconds: 0,
      uses_train: true,
      boardable: boardable && trainFresh,
      boarding_status: !trainFresh
        ? 'STALE_BLOCKED'
        : boardable
          ? 'BOARDABLE'
          : 'MISSED_CUTOFF',
      warning_code: !boardable ? 'BOARDING_CUTOFF_MISSED' : null,
      time_components: {
        outdoor_run_s: 180,
        station_entry_s: 60,
        boarding_safety_margin_s: 30,
        train_wait_penalty_s: boardable ? 0 : next_train_penalty_s,
        subway_ride_s: 1050,
        exit_walk_s: 120,
        total_s: runSubwayDurationSeconds
      },
      summary: boardable
        ? '450m를 3분(180s) 내 주파해 08:03:00 역 입구 진입 -> 08:04:30 급행 탑승'
        : `역 입구 도착(${entry_arrival_s}s) 1초+ 지연으로 08:04:30 열차 탑승 불가 -> 다음 열차 대기 +360s 발생 (1800s)`
    },
    {
      id: 'own_bike',
      route: 'own_bike',
      label: '개인자전거 (열차 무관 독립 경로)',
      short_label: '개인자전거',
      mode_icon: '🚲',
      duration_seconds: 1560,
      arrival_clock: formatClockFromOffset(1560),
      cost_krw: 0,
      cost_range_label: '₩0',
      run_seconds: 0,
      cycle_seconds: 900,
      uses_train: false,
      time_components: {
        bike_prep_s: 60,
        cycle_ride_s: 900,
        parking_and_access_s: 600,
        total_s: 1560
      },
      summary: '열차 시각표/데이터 신선도에 영향을 받지 않는 무비용 확정형 대안'
    },
    {
      id: 'ddareungi',
      route: 'ddareungi',
      label: '서울 따릉이 (공유자전거 대여·반납)',
      short_label: '서울 따릉이',
      mode_icon: '🟢🚲',
      duration_seconds: 1620,
      arrival_clock: formatClockFromOffset(1620),
      cost_krw: 1000,
      cost_range_label: '₩1,000',
      run_seconds: 0,
      cycle_seconds: 1000,
      uses_train: false,
      time_components: {
        walk_to_dock_s: 180,
        rental_return_s: 120,
        cycle_ride_s: 1000,
        dest_walk_s: 320,
        total_s: 1620
      },
      summary: '대여소 재고(1대+) 및 목적지 반납 거치대 유효 시 가동되는 저비용 대안'
    },
    {
      id: 'walk_subway',
      route: 'walk_subway',
      label: '도보+지하철 (기존 지도 앱 기본 추천 / Baseline)',
      short_label: '도보+지하철',
      mode_icon: '🚶+🚇',
      duration_seconds: 1800,
      arrival_clock: formatClockFromOffset(1800),
      cost_krw: 1550,
      cost_range_label: '₩1,550',
      run_seconds: 0,
      cycle_seconds: 0,
      uses_train: true,
      is_baseline: true,
      time_components: {
        walk_to_station_s: 360,
        station_entry_s: 60,
        platform_transfer_s: 30,
        train_wait_s: 180,
        subway_ride_s: 1050,
        exit_walk_s: 120,
        total_s: 1800
      },
      summary: '일반 보행(360s)으로 인해 08:04:30 급행을 놓치고 다음 열차를 타는 기준 경로(30분)'
    },
    {
      id: 'walk',
      route: 'walk',
      label: '전구간 도보 (외부 데이터 무의존 최후 보루)',
      short_label: '전구간 도보',
      mode_icon: '🚶',
      duration_seconds: 2400,
      arrival_clock: formatClockFromOffset(2400),
      cost_krw: 0,
      cost_range_label: '₩0',
      run_seconds: 0,
      cycle_seconds: 0,
      uses_train: false,
      time_components: {
        outdoor_walk_s: 2400,
        total_s: 2400
      },
      summary: '모든 실시간 교통/열차/따릉이 데이터가 만료되었을 때도 작동하는 최후의 보루'
    }
  ];

  // Evaluate eligibility and exclusion reasons for each candidate
  const taxiEvidence = evidence.items.find((i) => i.field === 'taxi_wait');
  const trafficEvidence = evidence.items.find((i) => i.field === 'traffic');
  const ddareungiEvidence = evidence.items.find((i) => i.field === 'ddareungi');

  const route_candidates = [];
  const eligible = [];
  const excluded = [];

  for (const candidate of rawCandidates) {
    const reasons = [];

    if (candidate.id === 'taxi_subway') {
      if (!trainFresh) reasons.push(evidence.reason || 'STALE_TRAIN_DATA');
      if (!taxiEvidence.eligible_for_fastest) reasons.push(taxiEvidence.reason || 'STALE_TAXI_WAIT_DATA');
      if (!trafficEvidence.eligible_for_fastest) reasons.push(trafficEvidence.reason || 'STALE_TRAFFIC_DATA');
      if (candidate.cost_krw > budget_krw) reasons.push('BUDGET_EXCEEDED');
    } else if (candidate.id === 'run_subway') {
      if (!trainFresh) reasons.push(evidence.reason || 'STALE_TRAIN_DATA');
      if (!run_allowed || candidate.run_seconds > max_run_seconds) reasons.push('RUN_LIMIT_EXCEEDED');
      if (candidate.cost_krw > budget_krw) reasons.push('BUDGET_EXCEEDED');
      if (rawInput.strict_boarding_exclusion && !boardable) reasons.push('BOARDING_CUTOFF_MISSED');
    } else if (candidate.id === 'own_bike') {
      if (!own_bike) reasons.push('OWN_BIKE_UNAVAILABLE');
      if (candidate.cycle_seconds > max_cycle_seconds) reasons.push('CYCLE_LIMIT_EXCEEDED');
      if (candidate.cost_krw > budget_krw) reasons.push('BUDGET_EXCEEDED');
    } else if (candidate.id === 'ddareungi') {
      if (evidence.ddareungi_stock <= 0) reasons.push('DDAREUNGI_EMPTY_DOCK');
      if (!evidence.ddareungi_return_ok) reasons.push('DDAREUNGI_RETURN_UNAVAILABLE');
      if (ddareungiEvidence.observed_age_s > ddareungiEvidence.ttl_s || ddareungiEvidence.missing) {
        reasons.push(ddareungiEvidence.missing ? 'MISSING_DDAREUNGI_DATA' : 'STALE_DDAREUNGI_DATA');
      }
      if (candidate.cycle_seconds > max_cycle_seconds) reasons.push('CYCLE_LIMIT_EXCEEDED');
      if (candidate.cost_krw > budget_krw) reasons.push('BUDGET_EXCEEDED');
    } else if (candidate.id === 'walk_subway') {
      if (!trainFresh) reasons.push(evidence.reason || 'STALE_TRAIN_DATA');
      if (candidate.cost_krw > budget_krw) reasons.push('BUDGET_EXCEEDED');
    } else if (candidate.id === 'walk') {
      if (exclude_walk) reasons.push('WALK_EXCLUDED');
    }

    const isEligible = reasons.length === 0;
    const primaryReason = reasons[0] || null;

    // Baseline comparison against walk_subway (1800s) is valid ONLY when walk_subway's train data is fresh
    const baseline_comparable = trainFresh;
    const saved_seconds = baseline_comparable ? 1800 - candidate.duration_seconds : null;

    const enriched = {
      ...candidate,
      eligible: isEligible,
      reason: primaryReason,
      reasons,
      saved_seconds,
      baseline_duration_seconds: baseline_comparable ? 1800 : null
    };

    route_candidates.push(enriched);
    if (isEligible) {
      eligible.push(enriched);
    } else {
      excluded.push({
        id: candidate.id,
        route: candidate.route,
        label: candidate.label,
        short_label: candidate.short_label,
        duration_seconds: candidate.duration_seconds,
        cost_krw: candidate.cost_krw,
        reason: primaryReason,
        reasons
      });
    }
  }

  // Sort eligible routes deterministically by duration_seconds ASC, then cost_krw ASC
  eligible.sort((a, b) => {
    if (a.duration_seconds !== b.duration_seconds) return a.duration_seconds - b.duration_seconds;
    return a.cost_krw - b.cost_krw;
  });

  const ranked = eligible.map((item, index) => ({
    ...item,
    rank: index + 1
  }));

  const winner = ranked[0] || null;

  // Determine fallback alternative when 08:04:30 express train is missed or stale
  const nonRunFallback =
    ranked.find((r) => r.id !== 'run_subway' && r.id !== 'taxi_subway') ||
    ranked.find((r) => r.id !== 'run_subway') ||
    null;

  const conditional_guidance = {
    run_distance_m: 450,
    run_speed_mps: 2.5,
    required_run_seconds: 180,
    entry_arrival_s,
    entry_arrival_clock: formatClockFromOffset(entry_arrival_s),
    entry_cutoff_s: 180,
    entry_cutoff_clock: '08:03:00',
    station_entry_s,
    platform_arrival_s: entry_arrival_s,
    computed_platform_arrival_s,
    computed_platform_arrival_clock: formatClockFromOffset(computed_platform_arrival_s),
    platform_cutoff_s: 240,
    platform_cutoff_clock: '08:04:00',
    boarding_safety_margin_s,
    effective_ready_s,
    effective_ready_clock: formatClockFromOffset(effective_ready_s),
    train_departure_s,
    train_departure_clock: '08:04:30',
    boardable: boardable && trainFresh,
    raw_time_boardable: boardable,
    train_data_fresh: trainFresh,
    saving_s: boardable && trainFresh ? 240 : 0,
    saved_vs_walk_subway_s: boardable && trainFresh ? 360 : 0,
    next_train_penalty_s: boardable ? 0 : next_train_penalty_s,
    reason: !trainFresh
      ? 'STALE_TRAIN_DATA'
      : boardable
        ? null
        : 'BOARDING_MARGIN_VIOLATED',
    status_badge: !trainFresh
      ? '🛑 STALE_TRAIN_DATA — 열차 데이터 만료(60s 초과)로 급행 탑승 확정 안내 차단'
      : boardable
        ? 'BOARDABLE ✅ 08:04:30 급행 탑승 가능'
        : 'MISSED 🚨 08:04:30 열차 탑승 불가 -> 다음 열차 대기 +360초 발생',
    headline: !trainFresh
      ? `🛑 열차 데이터 경과 시간(${evidence.train_age_s}s)이 유효기간(60s)을 초과하여 "08:04:30 열차 탑승 가능" 확정 안내를 차단했습니다.`
      : boardable
        ? '🏃 지금 450m를 3분(180초) 안에 뛰어 08:03:00까지 역 입구에 들어가면(계단 진입 60초 + 안전 여유 30초 포함) 08:04:30 급행열차를 잡아타서 총 4분(240초)~6분(360초)을 단축합니다!'
        : `🚨 역 입구 도착(${formatClockFromOffset(entry_arrival_s)}, ${entry_arrival_s}s)이 마감(08:03:00, 180s)보다 ${entry_arrival_s - 180}초 늦어 플랫폼 안전 여유시간(30초) 위반(${effective_ready_s}s > 270s)으로 08:04:30 급행 탑승이 불가합니다!`,
    fallback_route: nonRunFallback ? nonRunFallback.id : null,
    fallback_label: nonRunFallback ? nonRunFallback.label : '적격 대안 없음',
    fallback_duration_seconds: nonRunFallback ? nonRunFallback.duration_seconds : null,
    canonical_check: canonical_boarding_check
  };

  const epistemicComparison =
    !trainFresh
      ? {
          mode: 'STALE_TRAIN_DATA_GATE',
          staleTriggered: true,
          boardingCutoffTriggered: !boardable,
          naiveLlmOutput: '08:04:30 급행열차를 타세요! 지금 뛰어가면 충분히 탑승 가능합니다.',
          hallucinationRisk:
            'HIGH — 만료된(61초+) 열차 위치 데이터를 확정 사실로 둔갑시켜 헛걸음/지각 유발',
          failClosedGateOutput: `🛑 STALE_TRAIN_DATA FAIL-CLOSED: 실시간 열차 데이터 경과 시간(${evidence.train_age_s}s)이 유효기간(TTL 60s)을 초과하여 열차 기반 확정 안내를 즉시 차단했습니다.`
        }
      : !boardable
        ? {
            mode: 'ONE_SECOND_BOARDING_CUTOFF_GATE',
            staleTriggered: false,
            boardingCutoffTriggered: true,
            naiveLlmOutput: '역까지 450m 거리이니 서둘러 뛰어가서 08:04:30 열차를 타세요!',
            hallucinationRisk:
              'HIGH — 계단 이동(60s)과 플랫폼 안전 여유(30s)를 무시하여 눈앞에서 열차 문이 닫히는 실패 유도',
            failClosedGateOutput: `🛑 BOARDING_MARGIN_VIOLATED (1초 경계 실패): 역 입구 도착(${entry_arrival_s}s) + 계단(60s) + 안전여유(30s) = ${effective_ready_s}s > 열차 출발(270s). 08:04:30 급행 확정 안내를 차단하고 다음 열차(+360s) 페널티 반영 후 ${nonRunFallback ? nonRunFallback.short_label : '차선책'}으로 즉시 역전시켰습니다.`
          }
        : {
            mode: 'VERIFIED_CONDITIONAL_OPTIMAL',
            staleTriggered: false,
            boardingCutoffTriggered: false,
            naiveLlmOutput: '지하철역까지 걸어가서 지하철을 타세요 (약 30분 소요, 08:30 도착).',
            hallucinationRisk:
              'MEDIUM — 다중수단 결합(택시+지하철, 달리기+급행, 따릉이)과 열차 출발 시각 정합성을 계산하지 못해 4~8분 단축 기회 상실',
            failClosedGateOutput: `✅ ALL GATES PASSED (열차 TTL ${evidence.train_age_s}s/60s FRESH & 탑승 여유 30s 확보): 검증된 데이터와 사용자 제약 범위 내에서만 1순위 ${winner ? winner.short_label : '경로'}(${winner ? winner.duration_seconds : '-'}s)를 추천합니다.`
          };

  if (!winner) {
    return {
      ok: false,
      status: 503,
      error: 'NO_ELIGIBLE_ROUTE',
      message: '가용 데이터 신선도(TTL) 및 사용자 비용·체력 제약을 동시에 만족하는 적격 경로가 없습니다.',
      seed_id: SEED_ID,
      inversion_seed_id: INVERSION_SEED_ID,
      ranking: [],
      excluded,
      route_candidates,
      conditional_guidance,
      freshness_gate: evidence,
      data_evidence: evidence.items,
      epistemic_comparison: epistemicComparison,
      epistemicComparison,
      unresolved_data_policy: UNRESOLVED_DATA_POLICY
    };
  }

  return {
    ok: true,
    status: 200,
    seed_id: SEED_ID,
    inversion_seed_id: INVERSION_SEED_ID,
    // Top-level canonical fields from Seed (lines 96-99)
    route: winner.route,
    duration_seconds: winner.duration_seconds,
    cost_krw: winner.cost_krw,
    saved_seconds: winner.saved_seconds,
    recommendation: {
      route: winner.route,
      label: winner.label,
      short_label: winner.short_label,
      mode_icon: winner.mode_icon,
      duration_seconds: winner.duration_seconds,
      arrival_clock: winner.arrival_clock,
      cost_krw: winner.cost_krw,
      cost_range_label: winner.cost_range_label,
      saved_seconds: winner.saved_seconds,
      baseline_route: 'walk_subway',
      baseline_duration_seconds: trainFresh ? 1800 : null,
      baseline_comparable: trainFresh,
      uncertainty_note: trainFresh
        ? 'Fixture 기반 결정론적 검증 완료 (실제 공급자 live 연결 전 전역 최적 미주장)'
        : '열차 실시간 데이터 만료(STALE_TRAIN_DATA)로 지하철 포함 경로 제외 및 절약시간 비교 보류'
    },
    ranking: ranked,
    excluded,
    route_candidates,
    time_components: winner.time_components,
    all_time_components: Object.fromEntries(route_candidates.map((c) => [c.id, c.time_components])),
    user_constraints: {
      budget_krw,
      entry_arrival_s,
      platform_arrival_s: entry_arrival_s,
      max_run_seconds,
      max_cycle_seconds,
      own_bike,
      run_allowed,
      ddareungi_stock: evidence.ddareungi_stock,
      ddareungi_return_ok: evidence.ddareungi_return_ok,
      exclude_walk
    },
    conditional_guidance,
    freshness_gate: evidence,
    data_evidence: evidence.items,
    epistemic_comparison: epistemicComparison,
    epistemicComparison,
    unresolved_data_policy: UNRESOLVED_DATA_POLICY
  };
}

export const DEMO_PRESETS = Object.freeze([
  {
    id: 'act1_Step1_taxi_optimal',
    act: 'Act 1',
    title: 'Step 1 · 여유 예산 (₩10,000) -> 택시+지하철 1순위 (22분)',
    description: '예산 10,000원일 때 택시(대기 120s+주행 240s)로 역에 진입해 08:04:30 급행을 타는 경로가 1320s(8분 단축)로 1순위가 됩니다.',
    params: {
      budget_krw: 10000,
      entry_arrival_s: 180,
      platform_arrival_s: 180,
      max_run_seconds: 180,
      max_cycle_seconds: 1200,
      own_bike: true,
      ddareungi_stock: 4,
      train_age_s: 12,
      ddareungi_age_s: 15,
      taxi_wait_age_s: 25,
      traffic_age_s: 40
    },
    expected_winner: 'taxi_subway'
  },
  {
    id: 'act1_step2_budget_2000_run_optimal',
    act: 'Act 1',
    title: 'Step 2 · 예산 ₩2,000 제한 -> 달리기+지하철 역전 1순위 (24분)',
    description: '예산을 2,000원으로 낮추면 택시+지하철(₩8,500)이 BUDGET_EXCEEDED로 즉시 탈락하고, 450m를 180초에 뛰어 급행을 타는 달리기+지하철(1440s)이 1순위로 역전합니다.',
    params: {
      budget_krw: 2000,
      entry_arrival_s: 180,
      platform_arrival_s: 180,
      max_run_seconds: 180,
      max_cycle_seconds: 1200,
      own_bike: true,
      ddareungi_stock: 4,
      train_age_s: 12,
      ddareungi_age_s: 15,
      taxi_wait_age_s: 25,
      traffic_age_s: 40
    },
    expected_winner: 'run_subway'
  },
  {
    id: 'act2_one_second_boundary_181s',
    act: 'Act 2',
    title: 'Step 3 · 운명의 1초 경계 (180s -> 181s) -> 개인자전거 즉시 역전 (26분)',
    description: '역 입구 도착이 08:03:00(180s)에서 단 1초 늦은 08:03:01(181s)이 되면 계단(60s)+안전여유(30s)=271s > 270s로 08:04:30 급행을 놓쳐 다음 열차 대기(+360s)가 발생하고 개인자전거(1560s)에 1순위를 역전당합니다.',
    params: {
      budget_krw: 2000,
      entry_arrival_s: 181,
      platform_arrival_s: 181,
      max_run_seconds: 180,
      max_cycle_seconds: 1200,
      own_bike: true,
      ddareungi_stock: 4,
      train_age_s: 12,
      ddareungi_age_s: 15,
      taxi_wait_age_s: 25,
      traffic_age_s: 40
    },
    expected_winner: 'own_bike'
  },
  {
    id: 'act2_step4_no_own_bike_ddareungi',
    act: 'Act 2',
    title: 'Step 4 · 개인자전거 미보유 -> 서울 따릉이 1순위 (27분)',
    description: '달리기 불가(0s) 및 개인자전거 미보유(false) 상태에서는 대여소 재고가 확인된 서울 따릉이(1620s, ₩1,000)가 1순위가 됩니다.',
    params: {
      budget_krw: 2000,
      entry_arrival_s: 180,
      platform_arrival_s: 180,
      max_run_seconds: 0,
      max_cycle_seconds: 1200,
      own_bike: false,
      ddareungi_stock: 4,
      train_age_s: 12,
      ddareungi_age_s: 15,
      taxi_wait_age_s: 25,
      traffic_age_s: 40
    },
    expected_winner: 'ddareungi'
  },
  {
    id: 'act2_step5_empty_dock_walk_subway',
    act: 'Act 2',
    title: 'Step 5 · 따릉이 재고 0대 (EMPTY_DOCK) -> 도보+지하철 1순위 (30분)',
    description: '출발 대여소 따릉이 재고가 0대가 되면 DDAREUNGI_EMPTY_DOCK 게이트가 발동해 따릉이를 차단하고 도보+지하철(1800s)로 후퇴합니다.',
    params: {
      budget_krw: 2000,
      entry_arrival_s: 180,
      platform_arrival_s: 180,
      max_run_seconds: 0,
      max_cycle_seconds: 1200,
      own_bike: false,
      ddareungi_stock: 0,
      train_age_s: 12,
      ddareungi_age_s: 15,
      taxi_wait_age_s: 25,
      traffic_age_s: 40
    },
    expected_winner: 'walk_subway'
  },
  {
    id: 'act3_stale_train_61s_fail_closed',
    act: 'Act 3',
    title: 'Step 6 · 열차 데이터 61초 경과 (TTL 60s 초과) -> STALE_TRAIN_DATA Fail-Closed 차단',
    description: '열차 실시간 데이터 경과 시간이 60초에서 61초가 되는 순간, 지하철 의존 경로 3종(택시+지하철, 달리기+지하철, 도보+지하철)의 확정 추천을 전면 차단하고 비열차 안전 대안으로 전환합니다.',
    params: {
      budget_krw: 10000,
      entry_arrival_s: 180,
      platform_arrival_s: 180,
      max_run_seconds: 180,
      max_cycle_seconds: 1200,
      own_bike: true,
      ddareungi_stock: 4,
      train_age_s: 61,
      ddareungi_age_s: 15,
      taxi_wait_age_s: 25,
      traffic_age_s: 40
    },
    expected_winner: 'own_bike'
  }
]);
