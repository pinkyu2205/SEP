---
name: run-frontend-web
description: Build, run, and drive the frontend-web admin/host portal (React + Vite). Use when asked to start the web app, take a screenshot of it, log in as admin, click through the onboarding/draft-contract flow, or verify a UI change actually renders/works.
---

`frontend-web` is a React 19 + Vite SPA (admin/host portal for the SLMS
system). It has no dedicated component test suite — "does it work" means
actually rendering it. `chromium-cli` is not available in this
environment, so drive it via the Playwright REPL at
`.claude/skills/run-frontend-web/driver.mjs` (adapted from the
`_electron` REPL pattern in the run-skill-generator's electron example,
but launching a plain `chromium` page instead).

All paths below are relative to `frontend-web/`.

**This app needs the real backend.** Almost every page beyond the login
screen calls the real Spring Boot API at `http://localhost:8080`
(`C:\sep490\backup\Sub-leasing-managemant-system`, separate repo — see
root `SESSION-CONTEXT.md`). Start it first:
```bash
cd /c/sep490/backup/Sub-leasing-managemant-system && set -a && source .env && set +a && ./mvnw.cmd spring-boot:run &
timeout 60 bash -c 'until curl -sf -o /dev/null -w "%{http_code}" http://localhost:8080/actuator/health | grep -q 403; do sleep 2; done'
```
Login only falls back to a mock demo account (`admin`/`123456`) if the
backend call itself throws (network error) — a real 401 from a live
backend does NOT fall back. Seeded real accounts: `admin01`/`123456`,
`manager01`/`123456` (see root `SESSION-CONTEXT.md` §3).

## Prerequisites

Node.js (already required by the project). No OS packages needed —
Playwright's bundled Chromium runs headless out of the box on this
Windows/Git-Bash host (no `xvfb` here; that's a Linux-only concern).

## Setup

The driver's Playwright dependency is isolated in this skill directory
(NOT added to `frontend-web/package.json` — it's agent tooling, not an
app dependency):

```bash
cd .claude/skills/run-frontend-web
npm install                # installs playwright into this dir's own node_modules
npx playwright install chromium   # skips the download if already cached
```

## Run (agent path)

1. Start the Vite dev server (background) and wait for it to actually serve:
   ```bash
   npm run dev &
   timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
   ```
2. Pipe a command script into the driver. **`tmux` is not installed in
   this environment**, so drive it with a heredoc instead of
   `send-keys`/`capture-pane` (see Gotchas — this is why the driver
   uses `for await (const line of rl)` rather than the usual
   `rl.on('line', ...)`, which would otherwise run every piped command
   concurrently and race):
   ```bash
   node .claude/skills/run-frontend-web/driver.mjs <<'EOF'
   launch
   login admin01 123456
   nav /admin/onboarding
   wait-text Đón khách — Hợp đồng nháp
   ss 01-list
   console-errors
   quit
   EOF
   ```
   If `tmux` IS available in your environment, it works too — same
   commands via `send-keys`, poll for the `driver> ` prompt with
   `capture-pane` instead of a fixed sleep.

Screenshots land in `.claude/skills/run-frontend-web/screenshots/`
(override with `SCREENSHOT_DIR`). **Always open and look at the
screenshot** — a blank or login-redirected page means something upstream
(usually: backend not running, or login failed) silently broke the rest
of the script.

### Commands

| command | what it does |
|---|---|
| `launch` | launch headless Chromium, open a page |
| `login <user> <pass>` | fill+submit the real login form, wait for `/admin` or `/host` redirect |
| `nav <path-or-url>` | goto; bare paths resolve against `http://localhost:5173` |
| `wait-for <css-sel>` | wait up to 10s for a selector |
| `wait-text <text>` | wait up to 10s for visible text |
| `click <css-sel>` | Playwright `.click()` |
| `click-text <text>` | click a `button`/link whose accessible name matches (regex, case-insensitive) |
| `fill <css-sel> <value>` | fill an input (goes through React's controlled-input pipeline — not `eval el.value=`) |
| `press <key>` | keyboard press (e.g. `Enter`, `Escape`) |
| `ss [name]` | full-page screenshot |
| `eval <js>` | `page.evaluate`, prints JSON |
| `text [css-sel]` | print `innerText` (body if no selector) |
| `url` | print current page URL |
| `console-errors` | print accumulated `console.error`/pageerror since `launch` |
| `net <url-substring>` | print status + content-type/-disposition/-length for the last matching network responses — use this instead of guessing from the screenshot whether an API call actually succeeded |
| `sleep <ms>` | pause — needed after a click that triggers async work (fetch, `window.open`) before `net`/`console-errors` will show anything (see Gotchas) |
| `quit` | close browser |

## Run (human path)

```bash
npm run dev   # → http://localhost:5173, Ctrl-C to stop
```
Useless for an agent (no window to see) — this is for a human with a browser.

## Test

No component/e2e test suite configured. The closest thing is the
type-checker, which the `build` script also runs:
```bash
npx tsc --noEmit
```

---

## Gotchas

- **Piped/heredoc input races if you use `rl.on('line', async ...)`.**
  readline fires `'line'` synchronously per buffered line; with all
  lines available at once (heredoc, not a human typing), the async
  listener for command 2 starts before command 1's promise resolves —
  e.g. `login` ran and failed with "launch first" while `launch`'s
  `chromium.launch()` was still pending. Fixed by driving the REPL loop
  with `for await (const line of rl)` instead, which properly awaits
  each command before pulling the next line. If you extend this driver,
  keep that loop shape.
- **The `/dev/stdin` fd trick from the `_electron` REPL example doesn't
  work here.** This is native Windows Node (via Git Bash), not WSL/Linux
  — `fs.openSync('/dev/stdin', 'r')` resolves to `C:\dev\stdin` and
  throws `ENOENT`. Not needed anyway since there's no child process
  (like Electron) stealing stdin — plain `process.stdin` works fine.
- **`click-text` (and any click that triggers async work) returns before
  that work finishes.** The "File HĐ" button's `onClick` fires an
  `axios` blob fetch and `window.open()`s a new tab — `click-text`
  itself resolves the instant the DOM click dispatches, not once the
  fetch completes. Checking `net` immediately after shows nothing;
  `sleep 1500`-`2000` first.
- **`window.open()`-ing a `.docx` blob opens a tab that never
  "finishes loading."** The browser treats it as a download, not a
  renderable page — `newPage.screenshot()` on that tab times out
  waiting for fonts/paint that will never happen. This matches the
  BE spec's own description ("browser có thể download hoặc hỏi mở
  Word"). Don't try to screenshot the new tab; verify via `net
  document/download` on the *original* page instead — the fetch runs
  there, not in the new tab.
- **Login has a silent demo-account fallback.** `WebAuthContext.login`
  only falls back to the hardcoded demo accounts
  (`admin`/`123456`, `hoangge`/`mysecretpassword`) when the backend
  `POST /api/v1/auth/login` call *throws* (network error / backend
  down). A backend that's up but rejects real credentials (wrong
  password, wrong role) does NOT fall back — you get the real error.
  If `login` in the driver redirects somewhere unexpected, check the
  backend is actually running before assuming a form bug.
- **`tmux` is not installed in this environment.** Every example above
  uses direct heredoc piping instead. If a future environment has
  `tmux`, the usual `send-keys`/`capture-pane` pattern works unchanged
  against the same driver — just wrap the same commands.

## Troubleshooting

- **`ECONNREFUSED` on `login`, or `wait-text` times out on every page
  after login:** the Spring Boot backend isn't running on `:8080`. Start
  it (see intro) — `curl -o /dev/null -w '%{http_code}' http://localhost:8080/actuator/health`
  should print `403` (reachable, just needs auth), not `000`.
- **`EADDRINUSE` on `npm run dev`:** a previous dev server is still
  running. `curl -sf http://localhost:5173` first — if it already
  answers, skip starting a new one and just point the driver at it.
- **`net <substring>` prints "(no matching responses yet)" right after
  a click:** you didn't `sleep` — see Gotchas.
