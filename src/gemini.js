import { execFileSync } from 'node:child_process';
import { SEED_ID, INVERSION_SEED_ID } from './engine.js';

const MAX_RESPONSE_BYTES = 65536;
const MAX_TEXT_BYTES = 32768;

let cachedKeychainToken = null;
let cachedKeychainAt = 0;

export class BriefingError extends Error {
  constructor(code, status = 502, detail = '') {
    super(detail || code);
    this.name = 'BriefingError';
    this.code = code;
    this.status = status;
  }
}

function readKeychainAccessToken() {
  const now = Date.now();
  if (cachedKeychainToken && now - cachedKeychainAt < 300_000) {
    return cachedKeychainToken;
  }
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', 'gemini', '-a', 'antigravity', '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    const payload = raw.startsWith('go-keyring-base64:')
      ? Buffer.from(raw.slice('go-keyring-base64:'.length), 'base64').toString('utf8')
      : raw;
    const obj = JSON.parse(payload);
    const token = obj?.token?.access_token || '';
    if (token) {
      cachedKeychainToken = token;
      cachedKeychainAt = now;
      return token;
    }
  } catch {}

  try {
    const gcloudToken = execFileSync('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (gcloudToken) {
      cachedKeychainToken = gcloudToken;
      cachedKeychainAt = now;
      return gcloudToken;
    }
  } catch {}

  return '';
}

export function checkAuthReady(env = process.env) {
  const rawKey = typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY.trim() : '';
  if (rawKey && rawKey !== 'ADC') return true;
  return Boolean(readKeychainAccessToken());
}

export async function resolveEndpointAndHeaders(key, model, env = process.env, fetchImpl = globalThis.fetch) {
  const normalizedKey = typeof key === 'string' ? key.trim() : '';
  if (!normalizedKey || normalizedKey === 'ADC' || normalizedKey.startsWith('ya29.')) {
    const project = (env.GOOGLE_CLOUD_PROJECT || 'h2gdm-hack26icn-2699').trim();
    let token = normalizedKey.startsWith('ya29.') ? normalizedKey : readKeychainAccessToken();
    if (!token && fetchImpl) {
      try {
        const metaRes = await fetchImpl(
          'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
          { headers: { 'Metadata-Flavor': 'Google' } }
        );
        if (metaRes.ok) {
          const metaJson = await metaRes.json();
          token = metaJson?.access_token || '';
        }
      } catch {}
    }
    if (!token) {
      throw new BriefingError('missing_adc_access_token', 503, 'Unable to resolve ADC/Keychain access token');
    }
    return {
      url: `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/global/publishers/google/models/${encodeURIComponent(model)}:generateContent`,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      authMode: 'vertex-adc-global',
      project
    };
  }

  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': normalizedKey
    },
    authMode: 'api-key',
    project: null
  };
}

async function readBoundedJson(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new BriefingError('provider_response_too_large', 502);
  }
  if (!response.body) {
    throw new BriefingError('provider_empty_response', 502);
  }
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new BriefingError('provider_response_too_large', 502);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BriefingError('provider_invalid_response', 502);
  }
}

const SYSTEM_INSTRUCTIONS = `당신은 'Run-or-Miss (조건부 다중수단 출근 & 데이터 신선도 Fail-Closed 게이트)'의 한국어 의사결정 브리핑 에이전트입니다.
제공된 JSON 컨텍스트(winner, eligibleRoutes, excludedRoutes, conditionalBoardingStatus, freshnessGateStatus)에만 근거해 각 항목을 1~2문장으로 간결·정확하게 작성하십시오.

규칙:
1. excludedRoutes에 있는 경로를 추천하지 마십시오.
2. freshnessGateStatus.eligible_for_fastest가 false(STALE_TRAIN_DATA, 60초 초과)이면 08:04:30 급행 확정 안내가 차단되었음을 명시하십시오.
3. conditionalBoardingStatus.boardable이 false(역 입구 181초 이상)이면 마감(180초) 초과로 +360초 대기 페널티가 발생해 대안 경로로 역전되었음을 설명하십시오.

순수 JSON 객체만 출력하십시오:
{"headline":"1순위 추천 경로(소요시간·비용·절약시간) 요약","conditionalAction":"구체적 행동 지침(450m 주파 시간, 08:03:00 입구 마감, 08:04:30 열차 또는 대안 경로)","whyNotOthers":"제외/역전된 주요 후보 사유코드(BUDGET_EXCEEDED, BOARDING_MARGIN_VIOLATED, STALE_TRAIN_DATA 등) 비교","epistemicSafetyNote":"데이터 신선도(TTL 60s/120s/300s) 및 24-시나리오 Fixture 검증 범위 고지","fallbackPlan":"열차 미탑승(181초+) 또는 데이터 만료 시 차선책"}`;

export function buildGatedModelContext(evaluation) {
  return {
    seedId: SEED_ID,
    inversionSeedId: INVERSION_SEED_ID,
    status: evaluation.ok ? 'ELIGIBLE_FOUND' : 'NO_ELIGIBLE_ROUTE',
    winner: evaluation.recommendation
      ? {
          route: evaluation.recommendation.route,
          label: evaluation.recommendation.short_label,
          duration_seconds: evaluation.recommendation.duration_seconds,
          arrival_clock: evaluation.recommendation.arrival_clock,
          cost_krw: evaluation.recommendation.cost_krw,
          saved_seconds: evaluation.recommendation.saved_seconds
        }
      : null,
    eligibleRoutes: (evaluation.ranking || []).slice(0, 4).map((r) => ({
      rank: r.rank,
      route: r.route,
      label: r.short_label,
      duration_seconds: r.duration_seconds,
      cost_krw: r.cost_krw,
      saved_seconds: r.saved_seconds,
      boarding_status: r.boarding_status || 'N/A'
    })),
    excludedRoutes: (evaluation.excluded || []).map((e) => ({
      route: e.route,
      label: e.short_label,
      reason: e.reason,
      duration_seconds: e.duration_seconds,
      cost_krw: e.cost_krw
    })),
    conditionalBoardingStatus: {
      entry_arrival_s: evaluation.conditional_guidance?.entry_arrival_s,
      entry_cutoff_s: evaluation.conditional_guidance?.entry_cutoff_s,
      train_departure_s: evaluation.conditional_guidance?.train_departure_s,
      boardable: evaluation.conditional_guidance?.boardable,
      reason: evaluation.conditional_guidance?.reason,
      next_train_penalty_s: evaluation.conditional_guidance?.next_train_penalty_s,
      fallback_route: evaluation.conditional_guidance?.fallback_route
    },
    freshnessGateStatus: {
      train_age_s: evaluation.freshness_gate?.train_age_s,
      train_ttl_s: evaluation.freshness_gate?.train_ttl_s,
      status: evaluation.freshness_gate?.status,
      eligible_for_fastest: evaluation.freshness_gate?.eligible_for_fastest,
      reason: evaluation.freshness_gate?.reason
    }
  };
}

export function verifyAndSanitizeBriefing(parsed, evaluation) {
  const requiredKeys = [
    'headline',
    'conditionalAction',
    'whyNotOthers',
    'epistemicSafetyNote',
    'fallbackPlan'
  ];

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BriefingError('invalid_briefing_schema', 422, 'Model output must be a JSON object');
  }

  for (const key of requiredKeys) {
    if (typeof parsed[key] !== 'string' || parsed[key].trim().length < 4) {
      throw new BriefingError('invalid_briefing_schema', 422, `Missing or empty field: ${key}`);
    }
  }

  const winner = evaluation.recommendation;
  const trainFresh = evaluation.freshness_gate?.eligible_for_fastest;
  const boardable = evaluation.conditional_guidance?.boardable;

  let { headline, conditionalAction, whyNotOthers, epistemicSafetyNote, fallbackPlan } = parsed;

  // Post-Gate Enforcement 1: If train data is stale (> 60s), guarantee STALE_TRAIN_DATA warning is explicit
  if (!trainFresh && !epistemicSafetyNote.includes('STALE_TRAIN_DATA') && !epistemicSafetyNote.includes('60')) {
    epistemicSafetyNote = `[STALE_TRAIN_DATA 게이트 발동: 열차 데이터 ${evaluation.freshness_gate?.train_age_s}s > TTL 60s] ${epistemicSafetyNote}`;
  }

  // Post-Gate Enforcement 2: Ensure winner route duration/cost is accurately reflected in headline
  if (winner && !headline.includes(winner.short_label) && !headline.includes(winner.route)) {
    headline = `[1순위: ${winner.short_label} · ${Math.round(winner.duration_seconds / 60)}분(${winner.duration_seconds}초)] ${headline}`;
  }

  // Post-Gate Enforcement 3: If 1-second boundary missed (>= 181s), guarantee penalty is noted
  if (trainFresh && !boardable && !conditionalAction.includes('180') && !conditionalAction.includes('360')) {
    conditionalAction = `${conditionalAction} (역 입구 ${evaluation.conditional_guidance?.entry_arrival_s}s 도착으로 180s 마감 초과 -> +360s 대기 페널티 반영)`;
  }

  return {
    headline: headline.trim(),
    conditionalAction: conditionalAction.trim(),
    whyNotOthers: whyNotOthers.trim(),
    epistemicSafetyNote: epistemicSafetyNote.trim(),
    fallbackPlan: fallbackPlan.trim()
  };
}

export async function generateCommuteBriefing(
  evaluation,
  { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 45000 } = {}
) {
  const model = (env.GEMINI_MODEL || 'gemini-4-argon').trim();
  const rawKey = typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY.trim() : 'ADC';
  const target = await resolveEndpointAndHeaders(rawKey, model, env, fetchImpl);
  const gatedContext = buildGatedModelContext(evaluation);

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let envelope;
  try {
    const response = await fetchImpl(target.url, {
      method: 'POST',
      headers: target.headers,
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTIONS }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: JSON.stringify(gatedContext) }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: 'HIGH' }
        }
      })
    });

    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403].includes(response.status)) {
        throw new BriefingError('provider_unauthorized', 502, `HTTP ${response.status}`);
      }
      if (response.status === 404) {
        throw new BriefingError('provider_model_not_found', 502, `Model ${model} not found`);
      }
      if (response.status === 429) {
        throw new BriefingError('provider_rate_limited', 429, 'Rate limit exceeded');
      }
      throw new BriefingError('provider_http_error', 502, `HTTP ${response.status}`);
    }

    envelope = await readBoundedJson(response);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new BriefingError('provider_timeout', 504, 'Gemini request timed out');
    }
    if (error instanceof BriefingError) throw error;
    throw new BriefingError('provider_network_error', 502, error?.message || 'Network failure');
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - startedAt;
  const candidateEnvelope = envelope?.candidates?.[0];
  const rawParts = candidateEnvelope?.content?.parts;
  const parts = Array.isArray(rawParts) ? rawParts.filter((p) => !p?.thought) : [];
  if (!parts.length || parts.some((p) => typeof p?.text !== 'string')) {
    throw new BriefingError('provider_empty_response', 502, 'No non-thought text parts returned');
  }

  const rawText = parts.map((p) => p.text).join('').trim();
  if (!rawText || Buffer.byteLength(rawText) > MAX_TEXT_BYTES) {
    throw new BriefingError('provider_response_too_large', 502);
  }

  const cleanedText = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    throw new BriefingError('invalid_model_json', 422, 'Failed to parse JSON from model response');
  }

  const briefing = verifyAndSanitizeBriefing(parsed, evaluation);
  const thoughtsTokenCount = envelope?.usageMetadata?.thoughtsTokenCount ?? 0;

  return {
    briefing,
    provenance: {
      provider: 'Google Gemini',
      authMode: target.authMode,
      model,
      thinkingLevel: 'HIGH',
      thoughtsTokenCount,
      candidatesTokenCount: envelope?.usageMetadata?.candidatesTokenCount ?? null,
      promptTokenCount: envelope?.usageMetadata?.promptTokenCount ?? null,
      totalTokenCount: envelope?.usageMetadata?.totalTokenCount ?? null,
      latencyMs,
      gateEnforced: true,
      postGateVerified: true,
      seedId: SEED_ID,
      inversionSeedId: INVERSION_SEED_ID
    }
  };
}
