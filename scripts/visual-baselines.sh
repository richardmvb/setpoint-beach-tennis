#!/usr/bin/env bash
# Runs the visual baselines (e2e/visual.spec.ts) in the same Playwright image CI uses, so the pixels match.
#   npm run e2e:visual          compare against e2e/__screenshots__
#   npm run e2e:visual:update   rewrite them (only for a change that is meant to be visual; name it in the PR)
# The dev server runs on the host; the container shares the host network and runs only the browser.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('@playwright/test/package.json').version")
image="mcr.microsoft.com/playwright:v${version}-noble"
port=4200

started=
if ! curl -fs "http://localhost:${port}" >/dev/null 2>&1; then
  npx ng serve --port "$port" >/tmp/visual-ng-serve.log 2>&1 &
  started=$!
  trap '[ -z "$started" ] || kill "$started" 2>/dev/null || true' EXIT
  for _ in $(seq 1 180); do
    curl -fs "http://localhost:${port}" >/dev/null 2>&1 && break
    kill -0 "$started" 2>/dev/null || { cat /tmp/visual-ng-serve.log; echo "ng serve exited" >&2; exit 1; }
    sleep 1
  done
  curl -fs "http://localhost:${port}" >/dev/null 2>&1 || { echo "ng serve did not start in 180 s" >&2; exit 1; }
fi

docker run --rm --network host --ipc=host --user "$(id -u):$(id -g)" \
  -v "$PWD":/work -w /work -e E2E_VISUAL=1 -e HOME=/tmp \
  "$image" npx playwright test --project visual "$@"
