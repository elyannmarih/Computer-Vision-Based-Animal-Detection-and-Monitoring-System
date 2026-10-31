# Detectra frontend

A Next.js 16, React, TypeScript, Tailwind and Lucide interface for Detectra's animal detection. It runs the YOLO model picked in the sidebar (lizards, dogs, deer and more) on uploaded images and on a live RTSP camera, stores images and detections through FastAPI, and saves reviewer feedback. The local demo preview stays in the browser.

The browser only calls this app's `/api/detectra/*` routes; they call FastAPI from the server, validate every response and never forward raw backend errors, stream URLs or credentials. Set `API_BASE_URL` (server-only, see `.env.example`) when FastAPI isn't on `http://127.0.0.1:8000`; it must match the backend's `PUBLIC_API_URL` origin so saved camera frames can be shown.

## Run locally

```
npm ci
npm run dev
```

Open http://localhost:3000. Routes: `/`, `/upload`, `/results` (`?image=<id>` opens a saved result), `/camera`, `/how-to-use`.

## Validate

```
npm run lint
npx tsc --noEmit
npm run build
npx playwright install chromium webkit
npx playwright test
```

Tests start a deterministic backend contract fixture on port 8101 (uploads, saved results, live camera, detector models, feedback) and the production build on 3100. They never use the shared database. Run the build first. Coverage includes desktop Chromium, mobile Chromium and desktop WebKit.

See [INTEGRATION.md](INTEGRATION.md) for backend setup, private environment configuration, real-versus-local demo behavior, reviewer selection and remaining limitations.

