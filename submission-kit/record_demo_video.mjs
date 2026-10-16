import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const require = createRequire('/Users/sanggyulee/.local/lib/node_modules/omniroute/package.json');
const { chromium } = require('playwright');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_URL = process.env.PACELINE_URL || 'http://localhost:8085';
const ROOT_OUTPUT_DIR = '/Users/sanggyulee/H/01_프로젝트/hackathon-20261016';
const TEMP_VIDEO_DIR = path.join(ROOT_OUTPUT_DIR, '.temp_demo_recordings');
const FINAL_WEBM_PATH = path.join(ROOT_OUTPUT_DIR, 'paceline_demo_recording.webm');
const FINAL_MP4_PATH = path.join(ROOT_OUTPUT_DIR, 'paceline_demo_recording.mp4');

// Utility delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function recordDemo() {
  console.log('🚀 [PACELINE Video Producer] Starting automated demo video recording...');
  console.log(`🌐 Target URL: ${TARGET_URL}`);
  console.log(`📁 Video Output Directory: ${ROOT_OUTPUT_DIR}`);

  if (!fs.existsSync(TEMP_VIDEO_DIR)) {
    fs.mkdirSync(TEMP_VIDEO_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1920,1080'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: TEMP_VIDEO_DIR,
      size: { width: 1920, height: 1080 }
    },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();

  try {
    console.log('⏳ Navigating to PACELINE web application...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('✅ Page loaded.');
    await sleep(2000);

    // 1. Initial Hero Section View
    console.log('📍 Phase 1: Hero & Real-time Context Onboarding');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(1500);

    // Click Onboarding Chips sequentially
    console.log('👉 Selecting Q1: 위치·지형 연동 허용');
    const chipLoc = page.locator('button[data-q="loc"][data-val="allow"]').first();
    if (await chipLoc.isVisible()) {
      await chipLoc.click();
      await sleep(1500);
    }

    console.log('👉 Selecting Q2: 내 자전거 보유 (언덕 38km/h + 거치 45초)');
    const chipBike = page.locator('button[data-q="bike"][data-val="mybike"]').first();
    if (await chipBike.isVisible()) {
      await chipBike.click();
      await sleep(1500);
    }

    console.log('👉 Selecting Q3: Strava 1초 연동 (4\'30"/km)');
    const chipRun = page.locator('button[data-q="run"][data-val="strava"]').first();
    if (await chipRun.isVisible()) {
      await chipRun.click();
      await sleep(2000);
    }

    // 2. Dual Strategy Cards Comparison (Fastest 19m10s vs Safest 22m40s)
    console.log('📍 Phase 2: Dual Strategy Comparison (Fastest vs Safest)');
    await page.evaluate(() => {
      const grid = document.getElementById('mainStudioGrid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await sleep(2000);

    console.log('👉 Highlighting Safest Route (22m 40s Zero-Risk)');
    const cardSafest = page.locator('#cardSafest');
    if (await cardSafest.isVisible()) {
      await cardSafest.click();
      await sleep(3000);
    }

    console.log('👉 Highlighting Fastest Route (19m 10s Time-Attack)');
    const cardFastest = page.locator('#cardFastest');
    if (await cardFastest.isVisible()) {
      await cardFastest.click();
      await sleep(2500);
    }

    // 3. Android Companion Dispatch
    console.log('👉 Clicking [선택한 전략을 Android 앱으로 보내 실시간 네비 시작]');
    const btnSend = page.locator('#btnSendToAndroid');
    if (await btnSend.isVisible()) {
      await btnSend.click();
      await sleep(2000);
    }

    // 4. Android Simulation 1: Tired Runner & Bus Reroute (Highlight!)
    console.log('📍 Phase 3: Live Pace-Drop Fatigue & Bus Reroute Simulation');
    const btnSimTired = page.locator('#btnSimTiredBus');
    if (await btnSimTired.isVisible()) {
      await btnSimTired.scrollIntoViewIfNeeded();
      await btnSimTired.click();
      console.log('🏃 Runner fatigue triggered (4\'30" -> 6\'25" -> Right Turn -> Bus in 3m)...');
      // Wait for complete 9-second animation cycle + 1 second stabilization
      await sleep(10500);
    }

    // 5. Android Simulation 2: Crosswalk 110s Red Light Detour
    console.log('📍 Phase 4: Crosswalk 110s Red Light Detour Simulation');
    const btnSimCrosswalk = page.locator('#btnSimCrosswalk');
    if (await btnSimCrosswalk.isVisible()) {
      await btnSimCrosswalk.click();
      console.log('🚦 Crosswalk detour triggered (-88s saved by 50m detour)...');
      // Wait for 6-second animation cycle + 1 second stabilization
      await sleep(7500);
    }

    // 6. Android Simulation 3: Downhill 38km/h Bike Sprint
    console.log('📍 Phase 5: Downhill 38km/h Bike Sprint & Station Lock');
    const btnSimBike = page.locator('#btnSimBike');
    if (await btnSimBike.isVisible()) {
      await btnSimBike.click();
      console.log('🚴 Downhill 38km/h bike sprint running...');
      await sleep(5500);
    }

    // Final showcase hold
    console.log('🏁 Holding final frame for clean video ending...');
    await sleep(2000);

  } catch (err) {
    console.error('❌ Error during demo recording:', err);
  } finally {
    // Save video
    const videoObj = page.video();
    await context.close();
    await browser.close();

    if (videoObj) {
      const rawVideoPath = await videoObj.path();
      console.log(`📹 Raw video recorded at: ${rawVideoPath}`);

      if (fs.existsSync(rawVideoPath)) {
        // Copy to standard final webm path
        fs.copyFileSync(rawVideoPath, FINAL_WEBM_PATH);
        console.log(`✅ Final WebM saved: ${FINAL_WEBM_PATH} (${(fs.statSync(FINAL_WEBM_PATH).size / 1024 / 1024).toFixed(2)} MB)`);

        // Convert to high-compatibility MP4 using ffmpeg
        try {
          console.log('🔄 Converting WebM to high-compatibility MP4 (H.264 / AAC)...');
          execSync(
            `ffmpeg -y -i "${FINAL_WEBM_PATH}" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -r 30 "${FINAL_MP4_PATH}"`,
            { stdio: 'inherit' }
          );
          console.log(`🎉 Final MP4 saved: ${FINAL_MP4_PATH} (${(fs.statSync(FINAL_MP4_PATH).size / 1024 / 1024).toFixed(2)} MB)`);
        } catch (ffmpegErr) {
          console.warn('⚠️ ffmpeg conversion warning:', ffmpegErr.message);
        }
      }
    }

    // Clean temp dir
    try {
      fs.rmSync(TEMP_VIDEO_DIR, { recursive: true, force: true });
    } catch (_) {}

    console.log('🎯 [PACELINE Video Producer] Recording workflow finished successfully!');
  }
}

recordDemo();
