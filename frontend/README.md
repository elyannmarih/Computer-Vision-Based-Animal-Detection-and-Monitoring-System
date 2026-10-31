# Detectra frontend

A Next.js 16, React, TypeScript, Tailwind and Lucide interface for lizard detection, backed by the FastAPI server in `../backend`. Uploaded images and camera frames are analyzed and saved there; verification feedback isn't saved yet (it needs sign-in for trusted persons).

## Run locally

Start the backend first (see `../backend/README.md`), then:

```
npm ci
npm run dev
```

Open http://localhost:3000. Routes: `/`, `/upload`, `/results?image=<image id>`, `/camera`, `/how-to-use`.

The API address defaults to `http://127.0.0.1:8000`; set `NEXT_PUBLIC_API_URL` (e.g. in `.env.local`) to use another. The backend's `CORS_ORIGINS` must include this app's origin. API calls live in `src/lib/detection-service.ts`.

## Validate

```
npm run lint
npx tsc --noEmit
npm run build
npx playwright install chromium webkit
npx playwright test
```

Tests run against the production build on port 3100. Run the build first. They cover desktop Chromium, mobile Chromium and desktop WebKit with deterministic image fixtures, and mock the API (`mockApi` in the spec), so they need no backend, database or camera. Build without `NEXT_PUBLIC_API_URL` so the app calls the default address the mocks intercept.

