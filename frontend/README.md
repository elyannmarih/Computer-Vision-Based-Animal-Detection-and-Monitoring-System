# Detectra frontend

A Next.js 16, React, TypeScript, Tailwind and Lucide prototype for on-demand lizard detection. FastAPI image upload and reviewer feedback are connected. The backend detector remains simulated (`stub-0.1`); Analyze image stores images/metadata, while the local demo stays in the browser. Real YOLO inference and camera capture are pending.

## Run locally

```
npm ci
npm run dev
```

Open http://localhost:3000. Routes: `/`, `/upload`, `/results`, `/camera`, `/how-to-use`.

## Validate

```
npm run lint
npx tsc --noEmit
npm run build
npx playwright install chromium webkit
npx playwright test
```

Tests start a deterministic backend contract fixture on port 8101 and the production build on 3100. They never use the shared database. Run the build first. Coverage includes desktop Chromium, mobile Chromium and desktop WebKit.

See [INTEGRATION.md](INTEGRATION.md) for backend setup, private environment configuration, real-versus-local demo behavior, reviewer selection and remaining limitations.

