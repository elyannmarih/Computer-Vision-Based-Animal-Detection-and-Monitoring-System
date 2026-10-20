# Detectra frontend

A Next.js 16, React, TypeScript, Tailwind and Lucide prototype for on-demand lizard detection. Backend integration is pending. All detection results and camera demonstrations are explicitly simulated; images and feedback are not stored remotely.

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

Tests run against the production build on port 3100. Run the build first. They cover desktop Chromium, mobile Chromium and desktop WebKit with deterministic image fixtures and no backend dependency.

