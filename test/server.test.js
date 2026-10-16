import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  SEED_ID,
  INVERSION_SEED_ID,
  evaluateBoardingCheck,
  evaluateConstraintInversion,
  evaluateDataEvidence,
  evaluateCommute
} from '../src/engine.js';
import { createApp } from '../src/server.js';
import { verifyAndSanitizeBriefing } from '../src/gemini.js';

async function withTestServer(options, fn) {
  const app = createApp(options);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('1. Canonical Seed Boarding Check: 180s (BOARDABLE) vs 181s (1-Second Boundary MISSED)', () => {
  const ok180 = evaluateBoardingCheck({
    platform_arrival_s: 180,
    train_departure_s: 240,
    boarding_margin_s: 60,
    baseline_arrival_s: 1200,
    candidate_arrival_s: 960
  });
  assert.equal(ok180.boardable, true);
  assert.equal(ok180.saving_s, 240);

  const missed181 = evaluateBoardingCheck({
    platform_arrival_s: 181,
    train_departure_s: 240,
    boarding_margin_s: 60,
    baseline_arrival_s: 1200,
    candidate_arrival_s: 960
  });
  assert.equal(missed181.boardable, false);
  assert.equal(missed181.saving_s, 0);
  assert.equal(missed181.reason, 'BOARDING_MARGIN_VIOLATED');
  assert.equal(missed181.next_train_penalty_s, 360);
});

test('2. 5-Step Cascading Multimodal Ranking Inversion (seed_f1602f353109)', () => {
  // Step 1: Full budget 10,000 -> taxi_subway (1320s, 8500 KRW, saved 480s)
  const step1 = evaluateCommute({
    budget_krw: 10000,
    max_run_seconds: 180,
    max_cycle_seconds: 1200,
    own_bike: true,
    ddareungi_stock: 4
  });
  assert.equal(step1.route, 'taxi_subway');
  assert.equal(step1.duration_seconds, 1320);
  assert.equal(step1.cost_krw, 8500);
  assert.equal(step1.saved_seconds, 480);

  // Step 2: Lower budget to 2,000 -> taxi_subway excluded (BUDGET_EXCEEDED), run_subway wins (1440s)
  const step2 = evaluateCommute({
    budget_krw: 2000,
    max_run_seconds: 180,
    max_cycle_seconds: 1200,
    own_bike: true,
    ddareungi_stock: 4
  });
  assert.equal(step2.route, 'run_subway');
  assert.equal(step2.duration_seconds, 1440);
  assert.equal(step2.cost_krw, 1550);
  assert.equal(step2.saved_seconds, 360);
  assert.ok(step2.excluded.some((e) => e.route === 'taxi_subway' && e.reason === 'BUDGET_EXCEEDED'));

  // Step 3: Lower max_run_seconds to 0 -> run_subway excluded (RUN_LIMIT_EXCEEDED), own_bike wins (1560s)
  const step3 = evaluateCommute({
    budget_krw: 2000,
    max_run_seconds: 0,
    max_cycle_seconds: 1200,
    own_bike: true,
    ddareungi_stock: 4
  });
  assert.equal(step3.route, 'own_bike');
  assert.equal(step3.duration_seconds, 1560);
  assert.equal(step3.cost_krw, 0);
  assert.equal(step3.saved_seconds, 240);
  assert.ok(step3.excluded.some((e) => e.route === 'run_subway' && e.reason === 'RUN_LIMIT_EXCEEDED'));

  // Step 4: Set own_bike to false -> own_bike excluded (OWN_BIKE_UNAVAILABLE), ddareungi wins (1620s)
  const step4 = evaluateCommute({
    budget_krw: 2000,
    max_run_seconds: 0,
    max_cycle_seconds: 1200,
    own_bike: false,
    ddareungi_stock: 4
  });
  assert.equal(step4.route, 'ddareungi');
  assert.equal(step4.duration_seconds, 1620);
  assert.equal(step4.cost_krw, 1000);
  assert.equal(step4.saved_seconds, 180);
  assert.ok(step4.excluded.some((e) => e.route === 'own_bike' && e.reason === 'OWN_BIKE_UNAVAILABLE'));

  // Step 5: Set ddareungi_stock to 0 -> ddareungi excluded (DDAREUNGI_EMPTY_DOCK), walk_subway wins (1800s)
  const step5 = evaluateCommute({
    budget_krw: 2000,
    max_run_seconds: 0,
    max_cycle_seconds: 1200,
    own_bike: false,
    ddareungi_stock: 0
  });
  assert.equal(step5.route, 'walk_subway');
  assert.equal(step5.duration_seconds, 1800);
  assert.equal(step5.cost_krw, 1550);
  assert.equal(step5.saved_seconds, 0);
  assert.ok(
    step5.excluded.some((e) => e.route === 'ddareungi' && e.reason === 'DDAREUNGI_EMPTY_DOCK')
  );
});

test('3. 1-Second Commute Boundary (180s vs 181s) flips Rank #1 from run_subway to own_bike/ddareungi', () => {
  const at180 = evaluateCommute({
    budget_krw: 2000,
    entry_arrival_s: 180,
    max_run_seconds: 180,
    max_cycle_seconds: 1200,
    own_bike: true,
    ddareungi_stock: 4
  });
  assert.equal(at180.route, 'run_subway');
  assert.equal(at180.conditional_guidance.boardable, true);
  assert.equal(at180.duration_seconds, 1440);

  const at181 = evaluateCommute({
    budget_krw: 2000,
    entry_arrival_s: 181,
    max_run_seconds: 180,
    max_cycle_seconds: 1200,
    own_bike: true,
    ddareungi_stock: 4
  });
  assert.equal(at181.conditional_guidance.boardable, false);
  assert.equal(at181.conditional_guidance.reason, 'BOARDING_MARGIN_VIOLATED');
  assert.equal(at181.route, 'own_bike');
  assert.equal(at181.duration_seconds, 1560);
  assert.equal(at181.ranking[1].route, 'ddareungi');
  assert.equal(at181.ranking[1].duration_seconds, 1620);
});

test('4. Data Freshness Gate: 60s (FRESH) vs 61s (STALE_TRAIN_DATA Fail-Closed)', () => {
  const fresh60 = evaluateDataEvidence({ train_age_s: 60 });
  assert.equal(fresh60.status, 'FRESH');
  assert.equal(fresh60.eligible_for_fastest, true);
  assert.equal(fresh60.reason, null);

  const stale61 = evaluateDataEvidence({ train_age_s: 61 });
  assert.equal(stale61.status, 'STALE_TRAIN_DATA');
  assert.equal(stale61.eligible_for_fastest, false);
  assert.equal(stale61.reason, 'STALE_TRAIN_DATA');

  const commuteAt61 = evaluateCommute({
    budget_krw: 10000,
    train_age_s: 61,
    own_bike: true,
    ddareungi_stock: 4
  });
  // Train-dependent routes (taxi_subway, run_subway, walk_subway) are all blocked by STALE_TRAIN_DATA
  for (const trainRoute of ['taxi_subway', 'run_subway', 'walk_subway']) {
    assert.ok(
      commuteAt61.excluded.some((e) => e.route === trainRoute && e.reason === 'STALE_TRAIN_DATA'),
      `Expected ${trainRoute} to be excluded with STALE_TRAIN_DATA`
    );
  }
  assert.equal(commuteAt61.route, 'own_bike');
  assert.equal(commuteAt61.saved_seconds, null);
  assert.match(commuteAt61.epistemicComparison.failClosedGateOutput, /STALE_TRAIN_DATA FAIL-CLOSED/);
});

test('5. Constraint-Aware Ranking Inversion (seed_c04d407ebfaf)', () => {
  const result = evaluateConstraintInversion({
    daily_limit_minutes: 10,
    candidates: [
      { id: 'A', daily_minutes: 15, evidence_level: 'HIGH', evidence_rank: 1 },
      { id: 'B', daily_minutes: 10, evidence_level: 'MODERATE', evidence_rank: 2 }
    ]
  });
  assert.deepEqual(result.ranking, [{ id: 'B', rank: 1 }]);
  assert.equal(result.excluded[0].id, 'A');
  assert.equal(result.excluded[0].reason, 'DAILY_LIMIT_EXCEEDED');
});

test('6. HTTP API Endpoints (/api/health, /api/evaluate, 503 NO_ELIGIBLE_ROUTE, /api/presets, /api/briefing)', async () => {
  const mockGenerateBriefing = async (evaluation) => {
    const raw = {
      headline: `1순위 ${evaluation.recommendation?.short_label || '대안'} 추천 (${evaluation.duration_seconds}초)`,
      conditionalAction: '450m를 180초 안에 달려 08:03:00까지 역 입구에 진입하십시오.',
      whyNotOthers: '예산 한도 또는 데이터 신선도 게이트에 의해 타 후보가 제외되었습니다.',
      epistemicSafetyNote: '열차 TTL 60초 및 플랫폼 여유 30초 검증 완료.',
      fallbackPlan: '1초 지연 시 개인자전거(1560초) 또는 따릉이(1620초)로 즉시 전환하십시오.'
    };
    return {
      briefing: verifyAndSanitizeBriefing(raw, evaluation),
      provenance: {
        provider: 'Google Gemini',
        model: 'gemini-4-argon',
        thinkingLevel: 'HIGH',
        thoughtsTokenCount: 256,
        latencyMs: 42,
        gateEnforced: true,
        postGateVerified: true,
        seedId: SEED_ID,
        inversionSeedId: INVERSION_SEED_ID
      }
    };
  };

  await withTestServer({ generateBriefing: mockGenerateBriefing }, async (baseUrl) => {
    // GET /api/health
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.ok, true);
    assert.equal(health.candidate, 5);
    assert.equal(health.seedId, 'seed_f1602f353109');
    assert.equal(health.inversionSeedId, 'seed_c04d407ebfaf');
    assert.equal(health.model, 'gemini-4-argon');
    assert.equal(health.thinkingLevel, 'HIGH');

    // POST /api/evaluate (normal)
    const evalRes = await fetch(`${baseUrl}/api/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ budget_krw: 2000, platform_arrival_s: 180 })
    });
    assert.equal(evalRes.status, 200);
    const evalJson = await evalRes.json();
    assert.equal(evalJson.route, 'run_subway');
    assert.equal(evalJson.duration_seconds, 1440);

    // POST /api/evaluate (503 NO_ELIGIBLE_ROUTE when all routes excluded)
    const noRouteRes = await fetch(`${baseUrl}/api/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        budget_krw: 0,
        own_bike: false,
        ddareungi_stock: 0,
        train_age_s: 61,
        exclude_walk: true
      })
    });
    assert.equal(noRouteRes.status, 503);
    const noRouteJson = await noRouteRes.json();
    assert.equal(noRouteJson.error, 'NO_ELIGIBLE_ROUTE');

    // GET /api/presets
    const presetsRes = await fetch(`${baseUrl}/api/presets`);
    assert.equal(presetsRes.status, 200);
    const presetsJson = await presetsRes.json();
    assert.equal(presetsJson.presets.length, 6);
    assert.equal(presetsJson.fixture_24_summary.total_scenarios, 24);

    // POST /api/briefing
    const briefRes = await fetch(`${baseUrl}/api/briefing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ budget_krw: 2000, platform_arrival_s: 180, train_age_s: 61 })
    });
    assert.equal(briefRes.status, 200);
    const briefJson = await briefRes.json();
    assert.equal(briefJson.ok, true);
    assert.equal(briefJson.provenance.model, 'gemini-4-argon');
    assert.equal(briefJson.provenance.thinkingLevel, 'HIGH');
    assert.equal(briefJson.provenance.gateEnforced, true);
    assert.match(briefJson.briefing.epistemicSafetyNote, /STALE_TRAIN_DATA|60/);
  });
});
