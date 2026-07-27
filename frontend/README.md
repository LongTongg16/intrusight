# IntruSight frontend

This directory contains the React and Vite dashboard. See the
[root README](../README.md) for architecture, full setup, security, deployment,
and team attribution.

## Local development

```bash
cp .env.example .env
npm ci
npm run dev
```

`VITE_API_BASE` defaults to `http://localhost:8000` in the example file. The
development server runs at `http://localhost:5173`.

## Validation

```bash
npm run lint
npm run build
```

The browser uses bearer tokens for authenticated API requests. Frontend route
guards are a usability feature only; the FastAPI service enforces authorization.
