# PACELINE — Biometric & Micro-Obstacle Urban Navigation Engine

**PACELINE** is a dual-surface urban mobility engine (**Web Pre-Trip Strategy Planner + Android Companion Live Voice Coach**) powered by **Gemini 4 Argon (`thinking_level="high"`)** and a deterministic **61-Second Epistemic Freshness Gate**.

## Why Existing Maps Fail Commuters
Standard navigation apps assume every human walks at a static `4.0 km/h` and ignore micro-obstacles. PACELINE synthesizes:
1. **Personal Biomechanics (Strava / Wearable Sync)**: Descending a `-11.4%` incline at `38 km/h` on a personal bike (`+45s` station lock-up) and running a 15-minute walk segment in **5 minutes** (`4'30"/km` pace).
2. **Dynamic Transit Topology & Micro-Obstacle Bypass**: Switching from `Line 6 ➔ Line 3 ➔ Line 2` to `Line 6 ➔ Line 2 Direct` during a live transfer delay, and bypassing a **110-second 4-way intersection red light** by veering 50m right to an unsignalized crosswalk (`-88s` saved).
3. **Live Pace-Drop Bailout Coaching**: Detecting when uphill fatigue drops a runner's pace from `4'30"/km` to `6'25"/km` and immediately coaching via earbud audio: *"At this pace you will miss your cutoff—push harder now, or turn right at the next corner to catch the bus arriving in 3 minutes."*
4. **61-Second Deterministic Freshness Gate**: Fails closed (`HTTP 422 STALE_TELEMETRY_HALT`) whenever signal or transit telemetry exceeds `60s` TTL.

## Quick Start
```bash
npm install
PORT=8085 node src/server.js
```
