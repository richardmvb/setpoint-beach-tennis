# ADR 0002: Transloco for runtime pt-BR and en

- Status: Accepted
- Date: 2026-11-11

## Context

The app is in pt-BR and will add en. The site is served from GitHub Pages under a single base-href. Angular's built-in i18n (`@angular/localize`) produces one build per locale, so a language switch would need a separate URL and deployment per language.

## Decision

Use Transloco. Translations load at runtime, so one build serves both languages and the user switches language in the app. The setup (pt-BR only, key naming convention, translations scoped per feature) is in place before the Phase 4 extractions, so components are written with keys from the start.

## Consequences

- One deployment, runtime language switch, language preference stored through `core/storage`.
- Slightly larger runtime cost than compiled i18n. Measured in Phase 7 against the bundle budgets.
- Key checks (missing and unused keys) run in CI through `transloco-keys-manager`; the raw-text template check stays a small custom script.
