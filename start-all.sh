#!/usr/bin/env bash
# HARNESS: starts every AG2-Angular server on its harness ports (never 3000/8000).
#   8241 AG2 agent (backend/main.py, FastAPI + AGUIStream; the doc shows none: FINDINGS.md #1)
#   8240 Copilot Runtime (frontend/server.ts; doc: 8200), with the Authentication guide's
#        hooked runtime under /auth (frontend/auth-runtime.ts)
#   4240 ng serve (doc: 4200)
#   8242 the Components and surfaces page's TanStack runtime (frontend/components-runtime.mts; doc: server.ts on 8200).
#        The doc has you `export OPENAI_API_KEY` in its terminal: loaded from backend/.env here.
# Key: backend/.env (OPENAI_API_KEY; see backend/.env.example).
cd "$(dirname "$0")"
mkdir -p logs
# Logs the recorder appends to during a take (doc snippets that don't compile / import).
: > logs/doc-typecheck.log
: > logs/subagents-import.log

(cd backend && uv run python main.py > ../logs/backend-8241.log 2>&1) &
echo "waiting for the AG2 backend on :8241 ..."
for _ in $(seq 1 90); do
  curl -sf http://localhost:8241/health > /dev/null 2>&1 && break
  sleep 2
done

cd frontend
(npx tsx server.ts > ../logs/runtime-8240.log 2>&1) &
(set -a; . ../backend/.env; set +a; npx tsx components-runtime.mts > ../logs/components-runtime-8242.log 2>&1) &
(npm start > ../logs/angular-4240.log 2>&1) &
wait
