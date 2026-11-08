# PostHog Error Tracking

> ⚠️ **Needs your attention**
> - In GitHub repository Settings → Secrets and variables → Actions, create the Actions secret `POSTHOG_CLI_API_KEY`.
> - In the same GitHub Actions settings, create repository variables `POSTHOG_CLI_PROJECT_ID` and `POSTHOG_CLI_HOST`.
> - Trigger the next main-branch deployment and confirm that its build uploads a symbol set and deploys successfully.

## What you still need to do

1. In GitHub repository Settings → Secrets and variables → Actions, add the PostHog personal API key as the Actions secret `POSTHOG_CLI_API_KEY`. The local `.env` already contains the configured upload credential; do not use the public browser project token as the CI secret.
2. In the same GitHub Actions settings, add repository variables named exactly `POSTHOG_CLI_PROJECT_ID` and `POSTHOG_CLI_HOST`. Use project ID `703485` for `POSTHOG_CLI_PROJECT_ID` and the configured PostHog host for `POSTHOG_CLI_HOST`.
3. Run the next main-branch deployment. The workflow builds inline and deploys `dist/setpoint/browser` to GitHub Pages; confirm the run uploads its source maps and still deploys successfully.

## What is now configured

Uncaught browser errors reach PostHog through the SDK's `capture_exceptions: true` browser exception listeners. Angular framework-caught errors are handled by the single custom `ErrorHandler`, which unwraps Zone.js and HTTP errors and sends them through `captureException()`. The implementation is carried by:

- `src/app/app.component.ts`
- `src/app/core/posthog-error-handler.ts`
- `src/main.ts`

The app already had PostHog installed and initialized; error tracking is now enabled without adding duplicate global listeners.

Source-map upload is wired in these files:

- `angular.json`
- `package.json`
- `package-lock.json`
- `scripts/upload-posthog-sourcemaps.cjs`

The exact production build command is `npm run build`. Its `postbuild` step processes `dist/setpoint/browser`, injects chunk IDs, uploads matching source maps, and removes maps from the deployable artifact. Every production build is configured to upload once its upload variables are present where the build runs. The CLI is installed locally in the project, so no global installation is required.

The GitHub Actions wiring is in:

- `.github/workflows/deploy.yml`

It passes `POSTHOG_CLI_API_KEY` from a GitHub Actions secret and `POSTHOG_CLI_PROJECT_ID` plus `POSTHOG_CLI_HOST` from Actions variables to the existing build step. Local builds already had all three values and uploaded successfully; CI uploads begin once the named GitHub settings are present.

## Verification

The verification build command was `npm run build`, and it passed. PostHog created release `setpoint-angular@24c159cba776cd539d6a9954828c63bb63a90da3`, found 6 source-map pairs, and uploaded 5 new symbol-set chunks. All 6 emitted JavaScript bundles contained chunk IDs, and no `.map` files remained in `dist/setpoint/browser` after cleanup.

To verify in PostHog, trigger an error and inspect [Error Tracking](https://us.posthog.com/project/703485/error_tracking). Uploaded symbol sets appear at [Error Tracking configuration](https://us.posthog.com/project/703485/error_tracking/configuration). The next CI deployment should provide the first production symbol set from the GitHub workflow after the required Actions secret and variables are added.

Release linking was not wired in this run, so local runs, tests, and pull-request builds do not receive a release ID from this setup.
