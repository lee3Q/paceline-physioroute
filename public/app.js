
// Safe DOM ID Alias Bridge (syncs 5A HTML IDs with 5B JS IDs)
const _origGetById = document.getElementById.bind(document);
const _idAliases = {
  "buddyDialogue": "buddySpeech",
  "coachQuote": "buddySpeech",
  "etaFastValue": "fastTimeVal",
  "etaSafeValue": "safeTimeVal",
  "paceDisplay": "hudPace",
  "etaDisplay": "hudEta",
  "simPaceBadge": "hudPace",
  "simEtaBadge": "hudEta",
  "runnerSpeedBadge": "hudStatus",
  "coachTranscript": "voiceTranscriptBox",
  "redLightZone": "signalGroup"
};
document.getElementById = function(id) {
  return _origGetById(id) || (_idAliases[id] ? _origGetById(_idAliases[id]) : null);
};

// PACELINE Real-Time Running / Fatigue / Bus Reroute & Voice Coaching Engine
// Candidate #5: Conditional Route Freshness Gate

(function() {
  'use strict';

  // State Management
  const state = {
    selectedProfile: 'hybrid', // runner, cyclist, hybrid, safe
    currentPace: "4'30\"",
    currentSpeed: 13.3, // km/h
    etaFast: "19분 10초",
    etaSafe: "22분 40초",
    animating: false,
    currentAnimationId: null,
    speechActive: false
  };

  // Sound & Speech Synthesis
  function speak(text) {
    const transcriptEl = document.getElementById('voiceTranscriptBox') || document.getElementById('coachTranscript');
    if (transcriptEl) {
      transcriptEl.innerHTML = `<span class="speaking-wave">🔊</span> "${text}"`;
      transcriptEl.classList.remove('hidden');
      transcriptEl.classList.add('pulse-glow');
    }

    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // Stop prior speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.08;
    utterance.pitch = 1.0;

    // Pick Korean voice if available
    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find(v => v.lang.includes('ko') || v.lang.includes('KR'));
    if (koVoice) utterance.voice = koVoice;

    utterance.onend = () => {
      if (transcriptEl) transcriptEl.classList.remove('pulse-glow');
    };

    window.speechSynthesis.speak(utterance);
  }

  // Rolling Counter Helper
  function animateValue(elementId, startVal, endVal, duration, suffix = '') {
    const el = document.getElementById(elementId);
    if (!el) return;
    const startTime = performance.now();
    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * ease);
      el.textContent = current + suffix;
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    requestAnimationFrame(update);
  }

  // API Call Fallback
  async function evaluateRoute(options = {}) {
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });
      if (res.ok) return await res.json();
    } catch (e) {
      // offline/fallback
    }
    return {
      etaFast: "19분 10초",
      etaSafe: "22분 40초",
      savingSeconds: 210,
      confidence: 0.98
    };
  }

  // Minetti et al. (2002) Biomechanical Energy Cost Polynomial:
  // Cw(i) = 280.5*i^5 - 58.7*i^4 - 76.8*i^3 + 51.9*i^2 + 19.6*i + 2.5 (J/kg/m)
  function computeMinettiCw(gradientFraction) {
    const i = gradientFraction;
    const cw = 280.5 * Math.pow(i, 5)
             - 58.7 * Math.pow(i, 4)
             - 76.8 * Math.pow(i, 3)
             + 51.9 * Math.pow(i, 2)
             + 19.6 * i
             + 2.5;
    return Number(cw.toFixed(2));
  }

  // Highlight Route Card Helper (Route A vs Safe Route B)
  function highlightRouteCard(targetRoute) {
    const routeBSelectors = ['#routeCardB', '#safeRouteCard', '[data-route="B"]', '[data-route="safe"]', '.route-card.safe-route', '.route-card:nth-child(2)'];
    const routeASelectors = ['#routeCardA', '#fastRouteCard', '[data-route="A"]', '[data-route="fast"]', '.route-card.fast-route', '.route-card:nth-child(1)'];

    const findEl = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    };

    const routeA = findEl(routeASelectors);
    const routeB = findEl(routeBSelectors);

    if (targetRoute === 'B') {
      if (routeB) {
        routeB.classList.add('active-route', 'pulse-glow', 'fail-closed-safe');
        routeB.style.outline = '2px solid #f59e0b';
        routeB.style.boxShadow = '0 0 22px rgba(245, 158, 11, 0.45)';
      }
      if (routeA) {
        routeA.classList.remove('active-route', 'pulse-glow');
        routeA.style.opacity = '0.55';
        routeA.style.outline = 'none';
      }
    } else {
      if (routeA) {
        routeA.classList.add('active-route');
        routeA.style.opacity = '1';
      }
      if (routeB) {
        routeB.classList.remove('fail-closed-safe', 'pulse-glow');
        routeB.style.outline = '';
        routeB.style.boxShadow = '';
      }
    }
  }

  // Live Gemini Reasoning Trace & Minetti Cw(i) Updater
  function updateReasoningTrace(scenarioKey, customMeta = {}) {
    const step1El = document.getElementById('traceStep1');
    const step2El = document.getElementById('traceStep2');
    const step3El = document.getElementById('traceStep3');
    const minettiBadgeEl = document.getElementById('minettiMetricBadge');

    const traceConfigs = {
      normal: {
        gradient: 0.015,
        hr: 146,
        gpsAge: 1.2,
        step1: `[Step 1 · Biometrics & Minetti Cw(i)] Grade +1.5% → Cw(i) = ${computeMinettiCw(0.015)} J/kg/m | HR 146 bpm | Pace 4'30"/km`,
        step2: `[Step 2 · 61s Epistemic Gate & Signal Stochastics] Telemetry age 1.2s ≤ 60s (GATE: OPEN) | P(wait > 90s) = 0.82 | Transit cutoff = 180s`,
        step3: `[Step 3 · Gemini Conditional Synthesis] Optimal fast corridor active (ETA 19m 10s, saving 210s vs baseline).`,
        badge: `Minetti Cw(+1.5%) = ${computeMinettiCw(0.015)} J/kg/m · HR 146 bpm · P(wait>90s)=0.82 · Cutoff 180s`,
        flashStep2: false
      },
      fatigue: {
        gradient: 0.068,
        hr: 184,
        gpsAge: 1.8,
        step1: `[Step 1 · Biometrics & Minetti Cw(i)] Grade +6.8% uphill → Cw(i) = ${computeMinettiCw(0.068)} J/kg/m | HR 184 bpm (Lactate spike) | Pace collapsed to 6'25"/km`,
        step2: `[Step 2 · 61s Epistemic Gate & Signal Stochastics] Telemetry age 1.8s ≤ 60s (GATE: OPEN) | P(wait > 90s) = 0.82 | Bus #301 transit cutoff = 180s (3m 00s)`,
        step3: `[Step 3 · Gemini Conditional Synthesis] Reroute right at 60m → Catch Bus #301 within 180s cutoff. Recovers ETA to 08:26 AM.`,
        badge: `Minetti Cw(+6.8%) = ${computeMinettiCw(0.068)} J/kg/m · HR 184 bpm · P(wait>90s)=0.82 · Cutoff 180s`,
        flashStep2: false
      },
      signal: {
        gradient: 0.01,
        hr: 158,
        gpsAge: 1.1,
        step1: `[Step 1 · Biometrics & Minetti Cw(i)] Grade +1.0% flat → Cw(i) = ${computeMinettiCw(0.01)} J/kg/m | HR 158 bpm | Sprint speed 14.2 km/h`,
        step2: `[Step 2 · 61s Epistemic Gate & Signal Stochastics] Junction phase lock: P(wait > 90s) = 0.82 (110s red cycle) | Transit cutoff = 180s | Gate: OPEN (1.1s)`,
        step3: `[Step 3 · Gemini Conditional Synthesis] Bypass 110s red signal via 50m unsignalized crosswalk detour → Net gain -88s.`,
        badge: `Minetti Cw(+1.0%) = ${computeMinettiCw(0.01)} J/kg/m · HR 158 bpm · P(wait>90s)=0.82 · Cutoff 180s`,
        flashStep2: false
      },
      subway: {
        gradient: 0.02,
        hr: 152,
        gpsAge: 2.0,
        step1: `[Step 1 · Biometrics & Minetti Cw(i)] Grade +2.0% transfer ramp → Cw(i) = ${computeMinettiCw(0.02)} J/kg/m | HR 152 bpm | P(wait > 90s) = 0.82`,
        step2: `[Step 2 · 61s Epistemic Gate & Transit Cutoff] Line 3 Oksu–Yaksu delay (+540s) > 180s transit cutoff | Telemetry age 2.0s ≤ 60s (GATE: OPEN)`,
        step3: `[Step 3 · Gemini Conditional Synthesis] Prune Line 3 transfer → Force Line 6 Sindang direct Line 2 transfer (saves 9m 00s).`,
        badge: `Minetti Cw(+2.0%) = ${computeMinettiCw(0.02)} J/kg/m · HR 152 bpm · P(wait>90s)=0.82 · Cutoff 180s`,
        flashStep2: false
      },
      bike: {
        gradient: -0.114,
        hr: 138,
        gpsAge: 1.4,
        step1: `[Step 1 · Biometrics & Minetti Cw(i)] Grade -11.4% downhill → Cw(i) = ${computeMinettiCw(-0.114)} J/kg/m | HR 138 bpm | Downhill 38 km/h`,
        step2: `[Step 2 · 61s Epistemic Gate & Dock Cutoff] Telemetry age 1.4s ≤ 60s (GATE: OPEN) | P(wait > 90s) = 0.82 | Dock & transit cutoff = 180s (45s dock)`,
        step3: `[Step 3 · Gemini Conditional Synthesis] Geumho downhill aero glide → Exit 2 instant 45s bike dock → On-time arrival.`,
        badge: `Minetti Cw(-11.4%) = ${computeMinettiCw(-0.114)} J/kg/m · HR 138 bpm · P(wait>90s)=0.82 · Cutoff 180s`,
        flashStep2: false
      },
      stale_gate: {
        gradient: 0.042,
        hr: 176,
        gpsAge: 64,
        step1: `[Step 1 · Biometrics & Minetti Cw(i)] Last known Grade +4.2% → Cw(i) = ${computeMinettiCw(0.042)} J/kg/m | Last HR 176 bpm (UNVERIFIED)`,
        step2: `⚠️ [Step 2 · 61s EPISTEMIC GATE VIOLATION] gps_age_sec = 64s (> 60s limit) | P(wait > 90s) = 0.82 | Transit cutoff = 180s → GATE: BLOCKED`,
        step3: `[Step 3 · Fail-Closed Safety Lock] Aggressive sprint/jaywalk reroute ABORTED. Failing closed to Zero-Risk Safe Route B until fresh telemetry lock.`,
        badge: `⚠️ GATE BLOCKED (64s > 60s) · Cw(+4.2%) = ${computeMinettiCw(0.042)} J/kg/m · HR 176 bpm · P(wait>90s)=0.82 · Cutoff 180s`,
        flashStep2: true
      }
    };

    const cfg = traceConfigs[scenarioKey] || traceConfigs.normal;

    if (step1El) step1El.textContent = customMeta.step1 || cfg.step1;
    if (step2El) {
      step2El.textContent = customMeta.step2 || cfg.step2;
      if (cfg.flashStep2) {
        step2El.classList.add('status-red', 'blink', 'gate-warning-flash');
        step2El.style.backgroundColor = 'rgba(239, 68, 68, 0.22)';
        step2El.style.borderLeft = '4px solid #f59e0b';
        step2El.style.color = '#fef08a';
        step2El.style.padding = '6px 10px';
        step2El.style.borderRadius = '6px';
      } else {
        step2El.classList.remove('status-red', 'blink', 'gate-warning-flash');
        step2El.style.backgroundColor = '';
        step2El.style.borderLeft = '';
        step2El.style.color = '';
      }
    }
    if (step3El) step3El.textContent = customMeta.step3 || cfg.step3;
    if (minettiBadgeEl) {
      minettiBadgeEl.textContent = customMeta.badge || cfg.badge;
      minettiBadgeEl.dataset.cw = String(computeMinettiCw(cfg.gradient));
    }
  }

  // 1. Onboarding Chips & Preset Click Handler
  function initOnboarding() {
    const chips = document.querySelectorAll('.onboard-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', async (e) => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const presetType = chip.getAttribute('data-preset') || chip.dataset.type || 'runner';
        state.selectedProfile = presetType;

        const buddyDialogue = document.getElementById('buddyDialogue') || document.getElementById('coachQuote');
        const fastEtaEl = document.getElementById('etaFastValue');
        const safeEtaEl = document.getElementById('etaSafeValue');
        const runnerSpeedBadge = document.getElementById('runnerSpeedBadge');

        highlightRouteCard('A');

        if (presetType === 'runner') {
          if (buddyDialogue) buddyDialogue.textContent = "러너 모드 활성화! Strava 연동 페이스 4'30\"/km 기준, 고도각 5% 미만 평지 최우선 루트를 탐색합니다.";
          if (runnerSpeedBadge) runnerSpeedBadge.textContent = "Strava 러닝 4'30\"/km";
          if (fastEtaEl) fastEtaEl.textContent = "19분 10초";
          if (safeEtaEl) safeEtaEl.textContent = "22분 40초";
          updateReasoningTrace('normal');
          speak("러너 모드 활성화! 최적 페이스 4분 30초 기준으로 경로를 최적화합니다.");
        } else if (presetType === 'bike' || presetType === 'cyclist') {
          if (buddyDialogue) buddyDialogue.textContent = "따릉이 & 로드바이크 모드! 금호동 내리막(-11.4%) 38km/h 활주 및 최단 거치소(45초) 우선 배정!";
          if (runnerSpeedBadge) runnerSpeedBadge.textContent = "내 자전거 38km/h";
          if (fastEtaEl) fastEtaEl.textContent = "12분 20초";
          if (safeEtaEl) safeEtaEl.textContent = "15분 50초";
          updateReasoningTrace('bike');
          speak("자전거 모드 활성화! 다운힐 38킬로미터 활주 경로와 정류장 45초 컷 거치대를 안내합니다.");
        } else if (presetType === 'hybrid') {
          if (buddyDialogue) buddyDialogue.textContent = "하이브리드 모드! 달리기 + 버스 환승 + 무신호 횡단보도 실시간 최적 조합 가동 중.";
          if (runnerSpeedBadge) runnerSpeedBadge.textContent = "복합 환승 최적화";
          if (fastEtaEl) fastEtaEl.textContent = "17분 45초";
          if (safeEtaEl) safeEtaEl.textContent = "21분 10초";
          updateReasoningTrace('normal', {
            step1: `[Step 1 · Hybrid Biometrics & Minetti Cw(i)] Grade +1.8% → Cw(i) = ${computeMinettiCw(0.018)} J/kg/m | HR 151 bpm | Multi-modal Run+Transit`,
            badge: `Minetti Cw(+1.8%) = ${computeMinettiCw(0.018)} J/kg/m · HR 151 bpm · P(wait>90s)=0.82 · Cutoff 180s`
          });
          speak("하이브리드 모드! 뛰다가 버스나 지하철 환승 기회가 생기면 즉시 알립니다.");
        } else {
          if (buddyDialogue) buddyDialogue.textContent = "안전 우선 모드! 경사도 완만, 보행 신호 여유, 밝은 대로변 루트 안내.";
          if (fastEtaEl) fastEtaEl.textContent = "23분 10초";
          if (safeEtaEl) safeEtaEl.textContent = "25분 00초";
          highlightRouteCard('B');
          updateReasoningTrace('normal', {
            step1: `[Step 1 · Safe Mode & Minetti Cw(i)] Flat Grade +0.5% → Cw(i) = ${computeMinettiCw(0.005)} J/kg/m | HR 128 bpm | Zero-risk arterial`,
            badge: `Minetti Cw(+0.5%) = ${computeMinettiCw(0.005)} J/kg/m · HR 128 bpm · P(wait>90s)=0.82 · Cutoff 180s`
          });
        }

        // Trigger lightweight API update
        evaluateRoute({ preset: presetType });
      });
    });

    const demoPresetBtn = document.getElementById('btnDemoPreset');
    if (demoPresetBtn) {
      demoPresetBtn.addEventListener('click', () => {
        const firstChip = document.querySelector('.onboard-chip[data-preset="hybrid"]') || document.querySelector('.onboard-chip');
        if (firstChip) firstChip.click();
      });
    }
  }

  // Animation Utilities
  function cancelCurrentAnimation() {
    if (state.currentAnimationId) {
      cancelAnimationFrame(state.currentAnimationId);
      state.currentAnimationId = null;
    }
    state.animating = false;
  }

  function resetSimVisuals() {
    cancelCurrentAnimation();
    const runner = document.getElementById('runnerAvatar');
    const bus = document.getElementById('busAvatar');
    const sweat = document.getElementById('sweatEffect');
    const pathBus = document.getElementById('pathBusReroute');
    const pathCross = document.getElementById('pathCrosswalkDetour');
    const redLightZone = document.getElementById('redLightZone');
    const etaBadge = document.getElementById('simEtaBadge');
    const paceBadge = document.getElementById('simPaceBadge');
    const runnerSpeedBadge = document.getElementById('runnerSpeedBadge');

    if (runner) {
      runner.style.transform = 'translate(0px, 0px) rotate(0deg)';
      runner.style.opacity = '1';
    }
    if (bus) {
      bus.style.opacity = '0';
      bus.style.transform = 'translate(0px, 0px)';
    }
    if (sweat) sweat.style.display = 'none';
    if (pathBus) {
      pathBus.style.opacity = '0';
      pathBus.style.strokeDashoffset = '1000';
    }
    if (pathCross) {
      pathCross.style.opacity = '0';
      pathCross.style.strokeDashoffset = '1000';
    }
    if (redLightZone) redLightZone.style.opacity = '0';
    if (etaBadge) {
      etaBadge.textContent = '08:24 도착 예정 (정상)';
      etaBadge.className = 'eta-badge status-green';
    }
    if (paceBadge) {
      paceBadge.textContent = '페이스: 4\'30" /km';
      paceBadge.className = 'pace-badge';
    }
    if (runnerSpeedBadge && runnerSpeedBadge.textContent.includes('BLOCKED')) {
      runnerSpeedBadge.textContent = 'GATE: OPEN (1.2s FRESH)';
      runnerSpeedBadge.classList.remove('status-red', 'blink');
    }
    highlightRouteCard('A');
    updateReasoningTrace('normal');
  }

  // 🔥 DEMO ANIMATION 1: playTiredBusRerouteAnimation()
  // Phase 1 (0.0~2.0s): Normal 4'30" pace, runner moves forward along direct path
  // Phase 2 (2.0~4.0s): Fatigue kicks in! Pace drops to 6'25", sweat drops, ETA flashes 08:31 late!
  // Phase 3 (4.0s~): Voice coaching + Green right-turn route to bus stop, bus arrives in 3 min, ETA recovers to 08:26 safe!
  window.playTiredBusRerouteAnimation = function() {
    resetSimVisuals();
    updateReasoningTrace('fatigue');
    evaluateRoute({ scenario: 'fatigue', gradient: 0.068, hr_bpm: 184, gps_age_sec: 1.8 });
    state.animating = true;

    const runner = document.getElementById('runnerAvatar');
    const bus = document.getElementById('busAvatar');
    const sweat = document.getElementById('sweatEffect');
    const pathBus = document.getElementById('pathBusReroute');
    const etaBadge = document.getElementById('simEtaBadge') || document.getElementById('etaDisplay');
    const paceBadge = document.getElementById('simPaceBadge') || document.getElementById('paceDisplay');
    const simProgressBar = document.getElementById('simProgress');

    const totalDuration = 9000; // 9 seconds total demonstration
    const startTime = performance.now();
    let voicedPhase3 = false;

    function step(now) {
      if (!state.animating) return;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);
      if (simProgressBar) simProgressBar.style.width = `${progress * 100}%`;

      // PHASE 1: 0.0s ~ 2.0s (Normal Sprint)
      if (elapsed < 2000) {
        const p = elapsed / 2000;
        const x = p * 120;
        const y = 0;
        if (runner) runner.style.transform = `translate(${x}px, ${y}px) rotate(0deg)`;
        if (paceBadge) {
          paceBadge.textContent = '페이스: 4\'30" /km (목표 유지)';
          paceBadge.className = 'pace-badge status-green';
        }
        if (etaBadge) {
          etaBadge.textContent = '08:24 도착 예정 (정상)';
          etaBadge.className = 'eta-badge status-green';
        }
      }
      // PHASE 2: 2.0s ~ 4.0s (Fatigue & Pace Collapse)
      else if (elapsed >= 2000 && elapsed < 4000) {
        const p = (elapsed - 2000) / 2000;
        // decelerating motion
        const decelX = 120 + Math.pow(p, 0.5) * 60; // slower forward movement
        if (runner) runner.style.transform = `translate(${decelX}px, 0px) rotate(5deg)`;

        if (sweat) {
          sweat.style.display = 'block';
          sweat.style.left = `${decelX + 10}px`;
          sweat.style.top = '-20px';
          sweat.innerHTML = '💦 <span class="badge-fatigue">페이스 저하 감지! (+1\'55")</span>';
        }

        // Live Pace Drop
        if (p < 0.5) {
          if (paceBadge) paceBadge.textContent = '페이스: 5\'40" /km (경사도 오르막)';
        } else {
          if (paceBadge) {
            paceBadge.textContent = '페이스: 6\'25" /km 🚨 급락!';
            paceBadge.className = 'pace-badge status-red blink';
          }
          if (etaBadge) {
            etaBadge.textContent = '08:31 도착 예정 (🚨 지각 위험 +7분!)';
            etaBadge.className = 'eta-badge status-red blink';
          }
        }
      }
      // PHASE 3: 4.0s ~ 9.0s (Voice Guidance + Dynamic Right Turn & Bus Reroute)
      else {
        if (!voicedPhase3) {
          voicedPhase3 = true;
          speak("현재 페이스가 6분 25초로 떨어졌습니다! 이 페이스면 늦어요, 더 뛰어야 해요! 만약 더 뛰기 힘드시다면, 바로 앞 교차로에서 우회전해서 버스를 타는 것도 좋습니다. 버스가 딱 3분 뒤에 옵니다!");
          if (pathBus) {
            pathBus.style.opacity = '1';
            pathBus.style.strokeDashoffset = '0';
            pathBus.classList.add('glow-path');
          }
        }

        const p = (elapsed - 4000) / 5000; // 0 to 1
        // Turn right at intersection (X=180), move down to Bus stop (X=240, Y=100)
        let curX = 180 + p * 60;
        let curY = p * 100;
        let rot = 45; // turning angle

        if (p > 0.6) {
          // Arrived at bus stop, waiting for bus
          curX = 240;
          curY = 100;
          rot = 0;
        }

        if (runner) runner.style.transform = `translate(${curX}px, ${curY}px) rotate(${rot}deg)`;

        // Bus Approaching Animation
        if (bus) {
          bus.style.opacity = '1';
          const busX = 100 + p * 140;
          const busY = 100;
          bus.style.transform = `translate(${busX}px, ${busY}px)`;
        }

        if (sweat) sweat.style.display = 'none';

        if (p > 0.5) {
          if (paceBadge) {
            paceBadge.textContent = '🚌 301번 버스 탑승 대기 (3분 뒤 도착)';
            paceBadge.className = 'pace-badge status-cyan';
          }
          if (etaBadge) {
            etaBadge.textContent = '08:26 AM (✅ 세이프! 버스 환승 성공)';
            etaBadge.className = 'eta-badge status-green pulse';
          }
        }
      }

      if (progress < 1) {
        state.currentAnimationId = requestAnimationFrame(step);
      } else {
        state.animating = false;
      }
    }

    state.currentAnimationId = requestAnimationFrame(step);
  };

  // 🔥 DEMO ANIMATION 2: Crosswalk 110s Red Light Detour
  window.playCrosswalkDetourAnimation = function() {
    resetSimVisuals();
    updateReasoningTrace('signal');
    evaluateRoute({ scenario: 'signal', p_wait_gt_90s: 0.82, gps_age_sec: 1.1 });
    state.animating = true;

    const runner = document.getElementById('runnerAvatar');
    const pathCross = document.getElementById('pathCrosswalkDetour');
    const redLightZone = document.getElementById('redLightZone');
    const etaBadge = document.getElementById('simEtaBadge') || document.getElementById('etaDisplay');
    const paceBadge = document.getElementById('simPaceBadge') || document.getElementById('paceDisplay');

    if (redLightZone) {
      redLightZone.style.opacity = '1';
      redLightZone.classList.add('pulse-red');
    }

    speak("사거리 신호 대기 110초! 직진 대기 대신 우측 50미터 무신호 횡단보도로 돌아 뛰세요. 88초 더 빠릅니다!");

    const duration = 6000;
    const startTime = performance.now();

    function step(now) {
      if (!state.animating) return;
      const elapsed = now - startTime;
      const p = Math.min(elapsed / duration, 1);

      if (pathCross) {
        pathCross.style.opacity = '1';
        pathCross.style.strokeDashoffset = `${1000 - p * 1000}`;
      }

      // Detour arc trajectory
      const arcX = p * 280;
      const arcY = Math.sin(p * Math.PI) * 55;
      if (runner) runner.style.transform = `translate(${arcX}px, ${arcY}px) rotate(${arcY * 0.4}deg)`;

      if (paceBadge) paceBadge.textContent = '⚡ 무신호 횡단로 우회 질주 중 (속도 14.2km/h)';
      if (etaBadge) {
        etaBadge.textContent = '신호 대기 스킵 완료 (⚡ -88초 단축!)';
        etaBadge.className = 'eta-badge status-green';
      }

      if (p < 1) {
        state.currentAnimationId = requestAnimationFrame(step);
      } else {
        state.animating = false;
      }
    }
    state.currentAnimationId = requestAnimationFrame(step);
  };

  // 🔥 DEMO ANIMATION 3: Subway Delay Reroute
  window.playSubwayRerouteAnimation = function() {
    resetSimVisuals();
    updateReasoningTrace('subway');
    evaluateRoute({ scenario: 'subway', transit_cutoff_sec: 180, gps_age_sec: 2.0 });
    const etaBadge = document.getElementById('simEtaBadge') || document.getElementById('etaDisplay');
    const paceBadge = document.getElementById('simPaceBadge') || document.getElementById('paceDisplay');

    speak("3호선 옥수-약수 구간 신호 고장 환승 지연 감지! 6호선-3호선-2호선 대신, 6호선에서 신당역 2호선 직결 환승으로 루트를 전환합니다.");

    if (paceBadge) {
      paceBadge.textContent = '🚇 지하철 환승 루트 능동 스위칭';
      paceBadge.className = 'pace-badge status-cyan';
    }
    if (etaBadge) {
      etaBadge.textContent = '신당역 직결 환승으로 9분 손실 방어 완료 (✅ 정시 도착)';
      etaBadge.className = 'eta-badge status-green';
    }
  };

  // 🔥 DEMO ANIMATION 4: Downhill Bike Sprint (-11.4% gradient)
  window.playBikeSprintAnimation = function() {
    resetSimVisuals();
    updateReasoningTrace('bike');
    evaluateRoute({ scenario: 'bike', gradient: -0.114, gps_age_sec: 1.4 });
    state.animating = true;

    const runner = document.getElementById('runnerAvatar');
    const etaBadge = document.getElementById('simEtaBadge') || document.getElementById('etaDisplay');
    const paceBadge = document.getElementById('simPaceBadge') || document.getElementById('paceDisplay');

    speak("금호동 고개 내리막 구간 진입! 경사도 마이너스 11.4퍼센트. 시속 38킬로미터로 다운힐 활주 후 금호역 2번 출구 45초 컷 거치대로 진입합니다.");

    const duration = 4500;
    const startTime = performance.now();

    function step(now) {
      if (!state.animating) return;
      const elapsed = now - startTime;
      const p = Math.min(elapsed / duration, 1);

      // Fast downhill swoosh
      const x = p * 320;
      const y = Math.pow(p, 1.8) * 80;
      if (runner) runner.style.transform = `translate(${x}px, ${y}px) rotate(15deg)`;

      if (paceBadge) {
        const curSpd = Math.round(18 + p * 20);
        paceBadge.textContent = `🚴 다운힐 속도: ${curSpd} km/h (경사도 -11.4%)`;
        paceBadge.className = 'pace-badge status-orange';
      }

      if (p > 0.8 && etaBadge) {
        etaBadge.textContent = '금호역 따릉이 45초 즉시 거치 완료! (목적지 도보 30m)';
        etaBadge.className = 'eta-badge status-green';
      }

      if (p < 1) {
        state.currentAnimationId = requestAnimationFrame(step);
      } else {
        state.animating = false;
      }
    }
    state.currentAnimationId = requestAnimationFrame(step);
  };

  // 🔥 DEMO SCENARIO D: 61s Fail-Closed Epistemic Telemetry Gate
  window.playStaleGateSimulation = async function() {
    cancelCurrentAnimation();
    const staleMsg = "⚠️ [61s Epistemic Gate Triggered] GPS & Heart-Rate telemetry is 64s stale (>60s limit). Blocking aggressive jaywalk/sprint rerouting and failing closed to Safe Route B until fresh lock is restored.";

    // Update Reasoning Trace & flash #traceStep2 in warning red/amber
    updateReasoningTrace('stale_gate');

    // Switch HUD into FAIL-CLOSED SAFETY LOCK
    const etaBadge = document.getElementById('simEtaBadge') || document.getElementById('etaDisplay');
    const paceBadge = document.getElementById('simPaceBadge') || document.getElementById('paceDisplay');
    const runnerSpeedBadge = document.getElementById('runnerSpeedBadge');
    const coachTranscriptEl = _origGetById('coachTranscript') || document.getElementById('coachTranscript');
    const coachQuoteEl = _origGetById('coachQuote') || document.getElementById('coachQuote');
    const buddyDialogueEl = _origGetById('buddyDialogue') || document.getElementById('buddyDialogue');

    if (paceBadge) {
      paceBadge.textContent = 'GATE: BLOCKED — 64s STALE TELEMETRY';
      paceBadge.className = 'pace-badge status-red blink';
    }
    if (etaBadge) {
      etaBadge.textContent = '🔒 FAIL-CLOSED SAFETY LOCK → Safe Route B (22분 40초)';
      etaBadge.className = 'eta-badge status-orange pulse';
    }
    if (runnerSpeedBadge) {
      runnerSpeedBadge.textContent = 'GATE: BLOCKED — 64s STALE TELEMETRY';
      runnerSpeedBadge.classList.add('status-red', 'blink');
    }

    // Speak and explicitly set #coachTranscript & #coachQuote
    speak(staleMsg);
    if (coachTranscriptEl) {
      coachTranscriptEl.textContent = staleMsg;
      coachTranscriptEl.classList.remove('hidden');
      coachTranscriptEl.classList.add('pulse-glow');
    }
    if (coachQuoteEl) coachQuoteEl.textContent = staleMsg;
    if (buddyDialogueEl) buddyDialogueEl.textContent = staleMsg;

    // Highlight Route B (Safest Zero-Risk Route)
    highlightRouteCard('B');

    // Call POST /api/evaluate with gps_age_sec: 64 (> 60s threshold)
    await evaluateRoute({
      scenario: 'stale_gate',
      gps_age_sec: 64,
      hr_age_sec: 64,
      threshold_sec: 60,
      fail_closed: true
    });
  };

  // Unified Scenario Dispatcher: window.triggerScenario(name)
  window.triggerScenario = function(scenarioName) {
    const key = String(scenarioName || 'normal').toLowerCase();
    if (key === 'stale_gate' || key === 'stale' || key === 'gate') {
      return window.playStaleGateSimulation();
    } else if (key === 'fatigue' || key === 'tired' || key === 'bus') {
      return window.playTiredBusRerouteAnimation();
    } else if (key === 'signal' || key === 'crosswalk') {
      return window.playCrosswalkDetourAnimation();
    } else if (key === 'subway') {
      return window.playSubwayRerouteAnimation();
    } else if (key === 'bike' || key === 'cyclist') {
      return window.playBikeSprintAnimation();
    } else {
      resetSimVisuals();
      return evaluateRoute({ scenario: 'normal', gps_age_sec: 1.2 });
    }
  };

  // Attach button triggers
  function initSimulationTriggers() {
    const btnTired = document.getElementById('btnSimTiredBus') || document.getElementById('btnSendToAndroid');
    if (btnTired) {
      btnTired.addEventListener('click', (e) => {
        e.preventDefault();
        window.triggerScenario('fatigue');
      });
    }

    const btnCrosswalk = document.getElementById('btnSimCrosswalk');
    if (btnCrosswalk) {
      btnCrosswalk.addEventListener('click', (e) => {
        e.preventDefault();
        window.triggerScenario('signal');
      });
    }

    const btnSubway = document.getElementById('btnSimSubway');
    if (btnSubway) {
      btnSubway.addEventListener('click', (e) => {
        e.preventDefault();
        window.triggerScenario('subway');
      });
    }

    const btnBike = document.getElementById('btnSimBike');
    if (btnBike) {
      btnBike.addEventListener('click', (e) => {
        e.preventDefault();
        window.triggerScenario('bike');
      });
    }

    const btnStaleGate = document.getElementById('btnSimStaleGate');
    if (btnStaleGate) {
      btnStaleGate.addEventListener('click', (e) => {
        e.preventDefault();
        window.triggerScenario('stale_gate');
      });
    }

    const btnReset = document.getElementById('btnSimReset');
    if (btnReset) {
      btnReset.addEventListener('click', (e) => {
        e.preventDefault();
        window.triggerScenario('normal');
      });
    }

    // Highlight active situation button
    const sitBtns = document.querySelectorAll('.situation-btn');
    sitBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sitBtns.forEach(b => b.classList.remove('active-sim'));
        btn.classList.add('active-sim');
      });
    });

    // Scene 2 User Action Choice Buttons (Accept Reroute vs Keep Current)
    const btnAccept = document.getElementById('btnAcceptReroute');
    const btnKeep = document.getElementById('btnKeepCurrent');
    const stateTag = document.getElementById('scenarioStateTag');

    if (btnAccept) {
      btnAccept.addEventListener('click', () => {
        if (stateTag) {
          stateTag.textContent = '우회 경로 적용됨';
          stateTag.style.background = 'rgba(16, 185, 129, 0.22)';
          stateTag.style.color = '#6ee7b7';
        }
        speak('추천 우회 경로로 안내를 변경했습니다. 정시 도착이 가능합니다.');
      });
    }

    if (btnKeep) {
      btnKeep.addEventListener('click', () => {
        if (stateTag) {
          stateTag.textContent = '기존 경로 유지';
          stateTag.style.background = 'rgba(56, 189, 248, 0.2)';
          stateTag.style.color = '#7dd3fc';
        }
        speak('현재 경로를 그대로 유지합니다. 안전에 유의해 이동하세요.');
      });
    }
  }

  // Scene Switcher (Scene 1: Pre-departure Plan <-> Scene 2: In-Navigation Live HUD)
  window.switchScene = function(targetScene, routeChoice = 'A') {
    const scenePlan = document.getElementById('scenePlan');
    const sceneNav = document.getElementById('sceneNav');
    const tabPlan = document.getElementById('tabScenePlan');
    const tabNav = document.getElementById('tabSceneNav');

    if (targetScene === 'nav') {
      if (scenePlan) scenePlan.classList.remove('active');
      if (sceneNav) sceneNav.classList.add('active');
      if (tabPlan) tabPlan.classList.remove('active');
      if (tabNav) tabNav.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (routeChoice === 'B') {
        const etaBadge = document.getElementById('simEtaBadge');
        const paceBadge = document.getElementById('simPaceBadge');
        if (etaBadge) etaBadge.textContent = '08:27 도착 예정 (평지 안전 경로)';
        if (paceBadge) paceBadge.textContent = '페이스: 5\'20" /km (편안한 걸음)';
        speak('평지 안전 경로 B로 안내를 시작합니다. 오르막 없이 편안하게 이동하세요.');
      } else {
        resetSimVisuals();
        speak('추천 경로 A로 실시간 안내를 시작합니다. 이동 중 체력이나 신호등 상황이 바뀌면 바로 알려드릴게요.');
      }
    } else {
      cancelCurrentAnimation();
      if (sceneNav) sceneNav.classList.remove('active');
      if (scenePlan) scenePlan.classList.add('active');
      if (tabNav) tabNav.classList.remove('active');
      if (tabPlan) tabPlan.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  function initSceneNavigation() {
    const tabPlan = document.getElementById('tabScenePlan');
    const tabNav = document.getElementById('tabSceneNav');
    const btnBack = document.getElementById('btnBackToPlan');
    const startBtns = document.querySelectorAll('.start-nav-btn');

    if (tabPlan) tabPlan.addEventListener('click', () => window.switchScene('plan'));
    if (tabNav) tabNav.addEventListener('click', () => window.switchScene('nav', 'A'));
    if (btnBack) btnBack.addEventListener('click', () => window.switchScene('plan'));

    startBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const routeChoice = btn.getAttribute('data-start-route') || 'A';
        highlightRouteCard(routeChoice);
        window.switchScene('nav', routeChoice);
      });
    });
  }

  // DOMContentLoaded Bootstrapper
  document.addEventListener('DOMContentLoaded', () => {
    initOnboarding();
    initSceneNavigation();
    initSimulationTriggers();
    updateReasoningTrace('normal');
    if (window.location.hash === '#nav' || window.location.search.includes('scene=nav')) {
      window.switchScene('nav', 'A');
    }
    console.log('[PACELINE UX Engine] Scene-based navigation initialized.');
  });

})();
