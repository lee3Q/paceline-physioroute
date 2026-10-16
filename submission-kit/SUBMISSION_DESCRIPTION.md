# PhysioRoute: Run-or-Miss — Conditional Multimodal Commute Chief-of-Staff & Tactical Voice Bailout Gate

> **One-Line Tagline**: Like asking your sharpest personal chief-of-staff (*"Hey, I have to get there—what's the fastest way and what's the safest way?"*), **PhysioRoute (`Run-or-Miss`)** fuses **personal Strava physiology + shared bikes + unstructured street/festival/sidewalk hazards + live transit delays** via `gemini-4-argon`—and triggers a **live tactical voice bailout (`"Stop running, switch to a taxi 80m ahead!"`)** the moment your real-time running pace drops.

---

## 1. The Core Problem: Why Neither Map Apps Nor Standard LLMs Can Solve Real-World Commutes

Imagine asking a hyper-competent human subordinate the night before or 40 minutes before a high-stakes meeting:
> *"I need to be at Gangnam/Euljiro by 09:00 sharp. Give me **two exact options**: ① **The Absolute Fastest Way (Time-Attack)** and ② **The Safest Zero-Risk Way (P99 Guaranteed)**—factoring in my actual Strava running pace, steep-hill bike speed, shared bikes (Ttareungi), road surface condition, ongoing sidewalk construction, and street festivals blocking pedestrian paths."*

Today, **no map app and no standalone LLM can answer this**:

1. **Why Legacy Map Apps (Google / Naver / Kakao) Fail**:
   - **Blind to Unstructured Real-World Friction**: Map routing graphs do not ingest unstructured city notices like *"autumn street festival blocking the east sidewalk"*, *"sidewalk repaving construction forcing single-file walking"*, or *"wet cobblestone surface unsafe for downhill cycling."*
   - **Blind to Personal Physiology**: Maps assume everyone walks at a flat 4.0 km/h. In reality, descending our steep origin hill to the Line 6 station takes **15 minutes on foot**, **5 minutes running** (at your personal Strava Grade-Adjusted Pace), or **5 minutes by Bike-and-Lock** (**38 km/h steep downhill descent** + 45s locking at the station rack) or shared Ttareungi.
   - **Silent on Tail-Risk & Stale Data**: Maps show a single average ETA and still tell you to sprint even when subway GPS feeds are >60 seconds stale.

2. **Why Standard LLMs Fail**:
   - A standard LLM can read a text notice about a street festival or construction zone, but it **cannot compute multi-line transit graph topology (`Line 6→3→2` vs `Line 6→2`), grade-adjusted biomechanics, or P99 arrival risk envelopes**.

---

## 2. Our Solution: `gemini-4-argon` Chief-of-Staff + Live Tactical Voice Bailout

**PhysioRoute: Run-or-Miss** bridges deterministic transit/biomechanical physics with **`gemini-4-argon` (`thinking_level="high"`, 1M Context)** across four interlocking capabilities:

### ① Dual Executive Briefing: ⚡ Fastest (Time-Attack) vs. 🛡️ Safest (P99 Zero-Risk)
- Synthesizes **Strava / Apple Health / Garmin physiology**, **steep-hill 38 km/h Bike-and-Lock kinematics**, **shared bike (Ttareungi) dock availability**, and **unstructured sidewalk construction / festival blockage alerts** into two crystal-clear briefings:
  - **⚡ Option A — Fastest Time-Attack**: e.g., `Bike-and-Lock (38 km/h downhill, 5 min)` or `Strava Run (5 min)` to catch the 08:18 Line 6 train → `Line 6 → Line 3 → Line 2` (Expected 37 min).
  - **🛡️ Option B — Safest P99 Guaranteed**: When Line 3 transfer crowds or sidewalk construction spike P99 tail risk, automatically flips to `Line 6 → Line 2 (Sindang single transfer)` so your 99th-percentile arrival still beats 09:00.

### ② 🚦 Zero-Stop Crosswalk Red-Light Bypass & Momentum Preservation (사거리 적색 신호 110초 대기 vs 우측 무신호 횡단보도 무정차 우회 -88초 순단축)
- **No Navigation App in the World Calculates Crosswalk Signal Wait + Running/Cycling Momentum Loss**: When you hit a major 4-way intersection red light while running or riding downhill, standing still for **110 seconds** destroys both your ETA and your physical momentum (heart rate / cadence / kinetic energy).
- **Dynamic L-Turn / Unsignalized Crosswalk Bypass**: Instead of telling you to stop and wait at the red light, `PhysioRoute` calculates that turning right to run an extra **+50m (+22s)** across an **unsignalized crosswalk (신호등 없는 횡단보도)** or switching to an L-Turn corridor saves **-88 seconds net** while keeping your running/cycling cadence unbroken—delivering the turn instruction live into your earbuds:
  > 🔊 *"🚦 Red light ahead (110s wait). Don't stop and lose momentum—turn right now and take the unsignalized crosswalk 50m ahead (+22s run, net -88s faster)!"*

### ③ 🎧 Live Pace-Drop Detection & Tactical Voice Bailout (실시간 러닝 페이스 저하 감지 & 즉시 택시 환승 음성 코칭)
- What happens if you choose **Run Mode (`4'30"/km` target pace)** to catch the 08:18 train, but halfway down the route your live GPS/watch telemetry shows your pace dropping to **`5'50"/km`** due to sidewalk construction congestion or fatigue?
- Legacy apps just silently push your ETA back by 12 minutes after you've already missed the train.
- **PhysioRoute's Live Pace-Drop Engine** detects the exact second your current pace makes the target train **physically unreachable (`PLAN_INFEASIBLE`)** and fires an immediate **Tactical Voice Bailout (Web Speech API / Audio Coach)**:
  > 🔊 *"⚠️ Alert: Your running pace dropped to 5:50/km near the construction zone. Catching the 08:18 Line 6 train is now mathematically impossible. Stop running—hail the taxi 80 meters ahead at the main intersection right now to guarantee your 09:00 arrival!"*

### ④ 🛑 61-Second Stale-Telemetry Fail-Closed Gate
- Continuously monitors the age (`telemetry_age_sec`) of real-time subway arrival feeds.
- The instant telemetry age exceeds **60 seconds** (e.g., `68s`), the gate trips to **`FAIL-CLOSED HOLD` (`STALE_TRAIN_DATA`)**, locking out high-exertion commands (`RUN` / `38 km/h BIKE`) so you never risk a dangerous downhill sprint for a phantom train.

---

## 3. Why `gemini-4-argon` is Essential

| `gemini-4-argon` Capability | How PhysioRoute: Run-or-Miss Uses It |
| :--- | :--- |
| **`thinking_level="high"` Deep Reasoning** | Simultaneously weighs unstructured sidewalk/festival hazards, personal Strava fatigue cost, P99 transfer variance, and live pace-drop bailout thresholds. |
| **Multimodal & Unstructured Context Fusion** | Fuses structured GTFS/subway telemetry and Strava JSON profiles with unstructured municipal construction alerts, festival notices, and road-surface conditions. |
| **Real-Time Voice & Structured JSON Output** | Emits zero-latency structured JSON (`fastest_route`, `safest_route`, `pace_drop_bailout`, `voice_coaching_script`) that drives both the visual cockpit and live TTS voice intervention. |

---

## 4. Technical Architecture & Verification

- **Stack**: Node.js 20 ES Module Server (`src/server.js`, `src/engine.js`) + Python deterministic verification suite (`route_mvp/`).
- **Verification**: 100% pass rate across `node --test test/engine.test.js` and `pytest route_mvp/tests/test_mvp.py`.
- **Cloud Run Ready**: Pre-packaged `Dockerfile` (`PORT=8080`) and `submission-kit/deploy_cloudrun.sh`.
