/**
 * Shared paths, ports and URLs for the CI/CD pipeline.
 *
 * Everything under ci/ imports from here rather than rebuilding paths, so a
 * moved folder or a changed port is a one-line edit.
 *
 * Three services. Angular has no server route to host the Copilot Runtime the
 * way a Next app does, so the runtime is its own Node process
 * (frontend/server.ts) sitting between `ng serve` and the AG2 backend.
 * `npm run dev` in frontend/ starts the first two together via concurrently;
 * the backend is started separately.
 *
 * The port numbers are this repo's, not the other Angular repos': the AG2
 * backend already owns 8400, so the runtime moved to 8401 and `ng serve` to
 * 4204. That is what lets this stack run beside the Agno, Mastra and MsPy ones
 * without either having to move.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..', '..');
export const CI_DIR = path.join(ROOT_DIR, 'ci');
export const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
export const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
export const RECORDER_DIR = path.join(ROOT_DIR, 'autorecorder');
export const VIDEOS_DIR = path.join(RECORDER_DIR, 'videos');
export const AUDIO_DIR = path.join(RECORDER_DIR, 'audio');
export const LOGS_DIR = path.join(VIDEOS_DIR, 'logs');

export const isWindows = process.platform === 'win32';

/**
 * Prefix for CI artifact names. Matches the recorded video filenames
 * (`AG2-angular-01-Quickstart.webm`, from `videoPrefix` in
 * `autorecorder/config/project.config.ts`) so a downloaded folder and the clips
 * inside it read as the same thing. Both halves of the integration are in the
 * name on purpose: an Angular clip and its React twin land in the same folder.
 */
export const PROJECT_SLUG = 'AG2-angular';

/**
 * `backend/main.py` passes `port=8400` to uvicorn as a literal — there is no
 * env var to read — so this is a constant here too rather than a default that
 * pretends to be overridable.
 */
export const BACKEND_PORT = 8400;
export const RUNTIME_PORT = Number(process.env.PORT || 8401);
export const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 4204);

/**
 * Unlike the Python-backed siblings, this backend declares a real liveness
 * route: `@app.get("/health")` in backend/main.py. The AG-UI stream itself is
 * mounted at `POST /agent` and is no use as a probe.
 *
 * The recorder probes `/openapi.json` instead (see `backendHealthPath` in
 * autorecorder/config/project.config.ts, and the browser-side
 * frontend/src/app/components/backend-health.ts). Both are plain GETs served by
 * the same FastAPI app, so either proves the same thing; this one is preferred
 * here because it exists deliberately for the purpose.
 */
export const BACKEND_HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/health`;

/**
 * The runtime's own health path, and the one endpoint that proves the runtime
 * reached the backend — which is why it doubles as the warm target below.
 */
export const RUNTIME_HEALTH_URL = `http://127.0.0.1:${RUNTIME_PORT}/api/copilotkit/info`;

// `localhost`, not 127.0.0.1, and not interchangeably. Angular 22 serves
// through Vite, which binds the name `localhost` — on the CI runner that
// resolves to ::1, so a poll at 127.0.0.1 is refused for the full timeout
// while the dev server sits there having already printed its URL. The
// recorder's frontendUrl uses the same name, so both reach the same server.
export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

/**
 * Hit once before the first prompt of a run.
 *
 * The browser posts across origins to the runtime, and the first request there
 * pays for the runtime's connection to the AG2 process. /info is a real GET
 * endpoint that exercises exactly that path, so a run that would have failed on
 * a dead backend fails here instead of inside a recording.
 */
export const RUNTIME_WARM_URL = RUNTIME_HEALTH_URL;
