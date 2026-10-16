import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEED_ID,
  INVERSION_SEED_ID,
  COMMUTE_DEFAULTS,
  UNRESOLVED_DATA_POLICY,
  DEMO_PRESETS,
  evaluateCommute,
  evaluateBoardingCheck,
  evaluateConstraintInversion,
  evaluateDataEvidence
} from './engine.js';
import {
  BriefingError,
  checkAuthReady,
  generateCommuteBriefing
} from './gemini.js';
import { handlePhysioApiRequest } from './livePhysioService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(body);
}

async function readJsonBody(req, maxBytes = 32768) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > maxBytes) {
      const err = new Error('Request body too large');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    const err = new Error('INVALID_JSON');
    err.status = 400;
    throw err;
  }
}

function parseBool(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const s = String(val).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function parseNum(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeEvalParams(raw = {}) {
  const out = {};

  if (raw.budget_krw !== undefined || raw.budgetKrw !== undefined) {
    out.budget_krw = parseNum(raw.budget_krw ?? raw.budgetKrw, COMMUTE_DEFAULTS.budget_krw);
  }
  if (raw.entry_arrival_s !== undefined || raw.entryArrivalS !== undefined) {
    out.entry_arrival_s = parseNum(
      raw.entry_arrival_s ?? raw.entryArrivalS,
      COMMUTE_DEFAULTS.entry_arrival_s
    );
  }
  if (raw.platform_arrival_s !== undefined || raw.platformArrivalS !== undefined) {
    out.platform_arrival_s = parseNum(
      raw.platform_arrival_s ?? raw.platformArrivalS,
      COMMUTE_DEFAULTS.platform_arrival_s
    );
  }
  if (raw.max_run_seconds !== undefined || raw.maxRunSeconds !== undefined) {
    out.max_run_seconds = parseNum(
      raw.max_run_seconds ?? raw.maxRunSeconds,
      COMMUTE_DEFAULTS.max_run_seconds
    );
  }
  if (raw.max_cycle_seconds !== undefined || raw.maxCycleSeconds !== undefined) {
    out.max_cycle_seconds = parseNum(
      raw.max_cycle_seconds ?? raw.maxCycleSeconds,
      COMMUTE_DEFAULTS.max_cycle_seconds
    );
  }
  if (raw.own_bike !== undefined || raw.ownBike !== undefined) {
    out.own_bike = parseBool(raw.own_bike ?? raw.ownBike, COMMUTE_DEFAULTS.own_bike);
  }
  if (raw.run_allowed !== undefined || raw.runAllowed !== undefined) {
    out.run_allowed = parseBool(raw.run_allowed ?? raw.runAllowed, true);
  }
  if (raw.ddareungi_stock !== undefined || raw.ddareungiStock !== undefined) {
    out.ddareungi_stock = parseNum(
      raw.ddareungi_stock ?? raw.ddareungiStock,
      COMMUTE_DEFAULTS.ddareungi_stock
    );
  }
  if (raw.ddareungi_return_ok !== undefined || raw.ddareungiReturnOk !== undefined) {
    out.ddareungi_return_ok = parseBool(
      raw.ddareungi_return_ok ?? raw.ddareungiReturnOk,
      COMMUTE_DEFAULTS.ddareungi_return_ok
    );
  }
  if (raw.train_age_s !== undefined || raw.trainAgeS !== undefined) {
    out.train_age_s = parseNum(raw.train_age_s ?? raw.trainAgeS, COMMUTE_DEFAULTS.train_age_s);
  }
  if (raw.ddareungi_age_s !== undefined || raw.ddareungiAgeS !== undefined) {
    out.ddareungi_age_s = parseNum(
      raw.ddareungi_age_s ?? raw.ddareungiAgeS,
      COMMUTE_DEFAULTS.ddareungi_age_s
    );
  }
  if (raw.taxi_wait_age_s !== undefined || raw.taxiWaitAgeS !== undefined) {
    out.taxi_wait_age_s = parseNum(
      raw.taxi_wait_age_s ?? raw.taxiWaitAgeS,
      COMMUTE_DEFAULTS.taxi_wait_age_s
    );
  }
  if (
    raw.traffic_age_s !== undefined ||
    raw.trafficAgeS !== undefined ||
    raw.road_traffic_age_s !== undefined ||
    raw.roadTrafficAgeS !== undefined
  ) {
    out.traffic_age_s = parseNum(
      raw.traffic_age_s ?? raw.trafficAgeS ?? raw.road_traffic_age_s ?? raw.roadTrafficAgeS,
      COMMUTE_DEFAULTS.traffic_age_s
    );
  }
  if (raw.taxi_wait_p95_s !== undefined || raw.taxiWaitP95S !== undefined) {
    out.taxi_wait_p95_s = parseNum(
      raw.taxi_wait_p95_s ?? raw.taxiWaitP95S,
      COMMUTE_DEFAULTS.taxi_wait_p95_s
    );
  }
  if (raw.taxi_sample_count_30d !== undefined || raw.taxiSampleCount30d !== undefined) {
    out.taxi_sample_count_30d = parseNum(
      raw.taxi_sample_count_30d ?? raw.taxiSampleCount30d,
      COMMUTE_DEFAULTS.taxi_sample_count_30d
    );
  }
  if (raw.taxi_wait_policy !== undefined || raw.taxiWaitPolicy !== undefined) {
    out.taxi_wait_policy = String(raw.taxi_wait_policy ?? raw.taxiWaitPolicy);
  }
  if (raw.traffic_ttl_policy !== undefined || raw.trafficTtlPolicy !== undefined) {
    out.traffic_ttl_policy = String(raw.traffic_ttl_policy ?? raw.trafficTtlPolicy);
  }
  if (raw.exclude_walk !== undefined || raw.excludeWalk !== undefined) {
    out.exclude_walk = parseBool(raw.exclude_walk ?? raw.excludeWalk, false);
  }
  if (raw.strict_boarding_exclusion !== undefined || raw.strictBoardingExclusion !== undefined) {
    out.strict_boarding_exclusion = parseBool(
      raw.strict_boarding_exclusion ?? raw.strictBoardingExclusion,
      false
    );
  }
  if (raw.train_missing !== undefined) out.train_missing = parseBool(raw.train_missing, false);
  if (raw.ddareungi_missing !== undefined) {
    out.ddareungi_missing = parseBool(raw.ddareungi_missing, false);
  }
  if (raw.taxi_wait_missing !== undefined) {
    out.taxi_wait_missing = parseBool(raw.taxi_wait_missing, false);
  }
  if (raw.traffic_missing !== undefined) out.traffic_missing = parseBool(raw.traffic_missing, false);

  return out;
}

export function createApp({
  env = process.env,
  fetchImpl = globalThis.fetch,
  generateBriefing = generateCommuteBriefing
} = {}) {
  const configuredPort = Number(env.PORT) || 8085;
  const configuredModel = (env.GEMINI_MODEL || 'gemini-4-argon').trim();

  return async function requestHandler(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    try {
      // 1. GET /api/health
      if (pathname === '/api/health' && req.method === 'GET') {
        sendJson(res, 200, {
          ok: true,
          service: 'run-or-miss-conditional-commute-gate',
          candidate: 5,
          port: configuredPort,
          seedId: SEED_ID,
          inversionSeedId: INVERSION_SEED_ID,
          model: configuredModel,
          thinkingLevel: 'HIGH',
          authReady: checkAuthReady(env)
        });
        return;
      }

      // 2. GET /api/presets
      if (pathname === '/api/presets' && req.method === 'GET') {
        sendJson(res, 200, {
          ok: true,
          seedId: SEED_ID,
          inversionSeedId: INVERSION_SEED_ID,
          defaults: COMMUTE_DEFAULTS,
          presets: DEMO_PRESETS,
          unresolved_data_policy: UNRESOLVED_DATA_POLICY,
          fixture_24_summary: {
            fixture_name: 'seoul_mvp_value.json',
            total_scenarios: 24,
            constraint_violations: 0,
            saved_180s_or_more_count: 14,
            target_min_saved_180s_count: 6,
            modes_saving_180s_plus: ['taxi_subway', 'run_subway', 'own_bike', 'ddareungi'],
            verification_scope: 'fixture_verified_only_not_field_trial'
          }
        });
        return;
      }

      // 3. POST / GET /api/evaluate
      if (pathname === '/api/evaluate' && (req.method === 'POST' || req.method === 'GET')) {
        const rawInput =
          req.method === 'POST'
            ? await readJsonBody(req)
            : Object.fromEntries(parsedUrl.searchParams.entries());

        // Optional direct sub-checks if caller requests boarding_check or constraint_inversion
        if (rawInput.mode === 'boarding_check') {
          sendJson(res, 200, evaluateBoardingCheck(rawInput));
          return;
        }
        if (rawInput.mode === 'constraint_inversion') {
          sendJson(res, 200, evaluateConstraintInversion(rawInput));
          return;
        }

        const params = normalizeEvalParams(rawInput);
        const evaluation = evaluateCommute(params);

        if (!evaluation.ok) {
          sendJson(res, 503, evaluation);
          return;
        }
        sendJson(res, 200, evaluation);
        return;
      }

      // 4. POST /api/briefing
      if (pathname === '/api/briefing' && req.method === 'POST') {
        const rawInput = await readJsonBody(req);
        const params = normalizeEvalParams(rawInput.params || rawInput);
        const evaluation = evaluateCommute(params);

        const result = await generateBriefing(evaluation, { env, fetchImpl });

        sendJson(res, 200, {
          ok: true,
          ...result.briefing,
          briefing: result.briefing,
          provenance: result.provenance,
          evaluation
        });
        return;
      }

      // 4.5. /api/physio/* endpoints (Strava GAP, 3D DEM, Live Navigation & Coaching)
      if (pathname.startsWith('/api/physio/')) {
        const handled = await handlePhysioApiRequest({
          req,
          res,
          pathname,
          parsedUrl,
          readJsonBody,
          sendJson,
          env,
          fetchImpl
        });
        if (handled) return;
      }

      // 5. Static files from public/
      if (req.method === 'GET' || req.method === 'HEAD') {
        const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const resolved = path.resolve(PUBLIC_DIR, relPath);
        if (resolved.startsWith(PUBLIC_DIR) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          const ext = path.extname(resolved).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          res.writeHead(200, {
            'content-type': contentType,
            'cache-control': 'no-store'
          });
          if (req.method === 'HEAD') {
            res.end();
          } else {
            fs.createReadStream(resolved).pipe(res);
          }
          return;
        }
      }

      sendJson(res, 404, { error: 'NOT_FOUND', path: pathname });
    } catch (error) {
      if (error instanceof BriefingError) {
        sendJson(res, error.status || 502, {
          ok: false,
          error: error.code,
          message: error.message
        });
        return;
      }
      const status = Number(error?.status) || 500;
      sendJson(res, status, {
        ok: false,
        error: error?.message || 'INTERNAL_SERVER_ERROR'
      });
    }
  };
}

export function startServer({
  port = Number(process.env.PORT) || 8085,
  host = '0.0.0.0',
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const handler = createApp({ env, fetchImpl });
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve(server);
    });
  });
}

// Run directly when invoked via `node src/server.js`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8085;
  const host = process.env.HOST || '0.0.0.0';
  startServer({ port, host })
    .then((srv) => {
      const addr = srv.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      console.log(
        `[Run-or-Miss Candidate 05] Listening on http://${host}:${actualPort} (seed=${SEED_ID}, model=${process.env.GEMINI_MODEL || 'gemini-4-argon'})`
      );
    })
    .catch((err) => {
      console.error('[Run-or-Miss Candidate 05] Failed to start server:', err);
      process.exit(1);
    });
}
