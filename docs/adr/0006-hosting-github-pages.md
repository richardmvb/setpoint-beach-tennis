# ADR 0006: Stay on GitHub Pages for now

- Status: Accepted
- Date: 2026-11-13

## Context

The plan lists hosting as a decision to make before Phase 4, because it decides real security headers, per-PR preview deploys, the base href and the 404 fallback. The app is deployed to GitHub Pages under `/setpoint-beach-tennis/`, built with `--base-href` and with `404.html` copied from `index.html` for the route fallback. The alternatives are Cloudflare Pages and Netlify.

## Decision

Stay on GitHub Pages until the branding and custom-domain step. At that point, re-evaluate Cloudflare Pages (real headers, preview deploys, no base path) together with the new domain.

## Consequences

- The Content-Security-Policy stays a `<meta>` tag in `src/index.html`. `frame-ancestors`, `report-uri` and HSTS cannot be set that way. This is an accepted, recorded limitation in `docs/security.md`.
- No preview deploys per PR. CI (unit, SQL, pgTAP, e2e) is the gate instead.
- The router must work with both a base path (`/setpoint-beach-tennis/`) and a root path (`/`), read from `document.baseURI` and never hardcoded, so a later move needs no routing change. The `404.html` fallback copy stays in the deploy workflow.
- The re-evaluation is triggered by the branding decision or by a need that headers or previews would meet, whichever comes first.
