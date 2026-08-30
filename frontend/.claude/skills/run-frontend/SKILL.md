---
name: run-frontend
description: Build, launch, and screenshot the RoundSync frontend (Next.js) to verify UI changes actually render. Use when asked to run, start, screenshot, or visually verify the frontend/web app/landing page/dashboard.
---

The RoundSync frontend is a Next.js app, normally served via Docker
(`docker-compose.yml`'s `frontend` service, port 3000). It has no
interactive test framework installed, so it's driven with a small
Playwright script instead of `chromium-cli` (not available in this
environment). All commands below are relative to `frontend/` unless
noted otherwise.

## Prerequisites

- Docker Desktop running (the project's normal way to build/serve this app).
- `playwright` is already a devDependency of this package (added for
  this skill). Its browser binary is a separate, ~115MB download —
  one-time per machine:

```bash
cd frontend
npx playwright@1.62.1 install chromium
```

## Build + launch (from repo root, not frontend/)

```bash
docker-compose up -d --build frontend
```

Then wait for it to actually serve, don't just sleep:

```bash
timeout 30 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'
```

Note: the landing page (logged-out state) only needs the `frontend`
container. Testing an actual signed-in flow (dashboard, onboarding,
settings) also needs `api` — `docker-compose up -d --build` (no
service name) starts the full stack.

## Run (agent path) — the driver

`.claude/skills/run-frontend/driver.mjs` navigates to a path, waits
for a selector, screenshots, and reports any browser console errors.

```bash
cd frontend
MSYS_NO_PATHCONV=1 node .claude/skills/run-frontend/driver.mjs / .claude/skills/run-frontend/screenshots/landing.png "text=Sign In With Steam"
```

Args: `<path> <output-png> [wait-for-selector]` (selector defaults to
`body`). Output goes under `.claude/skills/run-frontend/screenshots/`
(gitignored) — **actually open the resulting PNG and look at it**;
`CONSOLE_ERRORS_COUNT: 0` only proves nothing threw, not that the
layout is right.

To point the driver at a different frontend instance (e.g. one
started with `npm run dev` on a different port), set `FRONTEND_URL`.

## Human path

```bash
docker-compose up -d --build frontend
# visit http://localhost:3000 in a real browser
docker-compose stop frontend
```

## Headed by default, AND left open long enough to actually watch

All three Playwright scripts here (`driver.mjs`, `mock-home.mjs`,
`test-interactions.mjs`) launch **headed** (a visible browser window) by
default, and now also pause for `WATCH_SECONDS` (default 15s) before closing
— the user wants to watch verification happen live, not just get a
screenshot after the fact, and a headed window that closes 1-2 seconds
after opening is functionally the same as headless (found 2026-08-27: the
first version of this fix launched headed but closed almost immediately,
and the user couldn't actually see anything happen in that window before
it vanished). Set `HEADLESS=true` to opt back into headless for a
constrained environment (CI, a container with no real display) — this also
skips the watch-pause automatically. Set `WATCH_SECONDS` to a different
value for a longer/shorter look. Don't hardcode `chromium.launch()` with no
options, or an immediate `browser.close()` right after the screenshot, in
any new script added to this skill — both silently break this expectation.

## Gotchas

- **`chromium-cli` is not installed in this environment.** Don't
  assume it's there — use the Playwright driver above instead.
- **Git Bash on Windows silently mangles a bare `/` CLI argument into
  a Windows path** (MSYS path conversion turns it into something like
  `C:/Program Files/Git/`) before Node ever sees it — this makes the
  driver navigate to garbage and every `waitForSelector` call times
  out with no useful error explaining why. Symptom: the exact same
  Playwright logic works when the path is hardcoded in a `-e` script,
  but fails when passed as a real CLI arg. Fix: prefix the command
  with `MSYS_NO_PATHCONV=1` (already in the command above) — verified
  by comparing `process.argv` with and without it.
- **Code changes require a full rebuild, not just a restart.**
  `docker-compose up -d --build frontend` — plain `restart` or
  `up -d` without `--build` serves the old, cached image.
- **`docker-compose run --rm` under a `timeout` wrapper can leave an
  orphaned container** if the process is a long-running server (SIGTERM
  from `timeout` can race the `--rm` cleanup). Check
  `docker ps -a --filter name=roundsync-frontend-run` and
  `docker rm -f` any leftovers.

## Troubleshooting

- `chromium-cli: command not found` → expected, use the driver instead.
- `page.waitForSelector: Timeout ... exceeded` with no other error,
  and `page.goto` didn't throw → check for the Git Bash path-mangling
  gotcha above before assuming the app itself is broken.
- `curl: (7) Failed to connect` when polling port 3000 → the container
  is still building; increase the poll timeout rather than assuming
  it's dead.
