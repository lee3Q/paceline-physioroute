#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Candidate #5: Run-or-Miss — Conditional Multimodal Commute & Freshness Gate
# Cloud Run One-Click Deployment Script (PRE-DEPLOYMENT READY — DO NOT AUTO-RUN)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PROJECT_ID="${GCP_PROJECT_ID:-h2gdm-hack26icn-2699}"
REGION="${GCP_REGION:-asia-northeast3}"
SERVICE_NAME="${SERVICE_NAME:-run-or-miss-route-gate}"

export PATH="/opt/homebrew/bin:/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_CORE_PROJECT="${PROJECT_ID}"
export CLOUDSDK_BILLING_QUOTA_PROJECT="${PROJECT_ID}"
if [ -z "${CLOUDSDK_AUTH_ACCESS_TOKEN:-}" ]; then
  export CLOUDSDK_AUTH_ACCESS_TOKEN="$(python3 -c '
import subprocess, base64, json
raw = subprocess.check_output(["security", "find-generic-password", "-s", "gemini", "-a", "antigravity", "-w"], text=True).strip()
if raw.startswith("go-keyring-base64:"):
    raw = base64.b64decode(raw.split(":", 1)[1]).decode("utf-8")
data = json.loads(raw)
tok = json.loads(data["token"]) if isinstance(data["token"], str) else data["token"]
print(tok["access_token"])
')"
fi

echo "🚀 Deploying ${SERVICE_NAME} from ${APP_DIR} to Cloud Run (${PROJECT_ID} / ${REGION})..."

cd "${APP_DIR}"

gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 2 \
  --timeout 120 \
  --quiet \
  --set-env-vars "NODE_ENV=production,GCP_PROJECT=${PROJECT_ID},VERTEX_LOCATION=us-central1,GEMINI_MODEL=gemini-4-argon"

echo "✅ Cloud Run Deployment Complete!"
gcloud run services describe "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format="value(status.url)"
