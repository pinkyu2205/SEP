// REPL driver for frontend-web (React + Vite admin/host portal).
// chromium-cli is not available in this environment, so this adapts the
// electron.md REPL pattern to a plain Playwright `chromium` page instead
// of `_electron` — same stdin-commands / stdout-output shape.
//
// Usage: node .claude/skills/run-frontend-web/driver.mjs
// (run from inside frontend-web/ — dev server must already be running)
import { chromium } from 'playwright';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SHOT_DIR = process.env.SCREENSHOT_DIR || path.resolve(process.cwd(), '.claude/skills/run-frontend-web/screenshots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let browser = null;
let page = null;
const consoleErrors = [];
const responses = []; // { url, status, headers }

const COMMANDS = {
  async launch() {
    if (browser) return console.log('already launched');
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    const context = await browser.newContext();
    page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message));
    page.on('response', async (res) => {
      responses.push({
        url: res.url(),
        status: res.status(),
        contentType: await res.headerValue('content-type').catch(() => null),
        contentLength: await res.headerValue('content-length').catch(() => null),
        contentDisposition: await res.headerValue('content-disposition').catch(() => null),
      });
      if (responses.length > 300) responses.shift();
    });
    console.log('launched.');
  },

  async nav(url) {
    if (!page) return console.log('ERROR: launch first');
    await page.goto(url.startsWith('http') ? url : `http://localhost:5173${url}`, { waitUntil: 'domcontentloaded' });
    console.log('nav →', page.url());
  },

  // App-specific helper: log in as an admin/host account through the real
  // login form (WebAuthContext posts to the real BE, no test-only bypass
  // exists). Waits for redirect to /admin or /host.
  async login(rest) {
    if (!page) return console.log('ERROR: launch first');
    const [username, password] = rest.split(/\s+/);
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[placeholder="Tên đăng nhập"]', username);
    await page.fill('input[placeholder="Mật khẩu"]', password);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL('**/admin**', { timeout: 15000 });
    } catch {
      try { await page.waitForURL('**/host**', { timeout: 5000 }); } catch { /* report below */ }
    }
    console.log('login →', page.url());
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f, fullPage: true });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.click(sel, { timeout: 10_000 }); console.log('click', sel, '→ OK'); }
    catch (e) { console.log('click', sel, '→ ERROR:', e.message.split('\n')[0]); }
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    try {
      await page.getByRole('button', { name: new RegExp(text, 'i') }).first().click({ timeout: 10_000 });
      console.log('click-text', JSON.stringify(text), '→ OK');
    } catch (e) { console.log('click-text', JSON.stringify(text), '→ ERROR:', e.message.split('\n')[0]); }
  },

  async fill(rest) {
    if (!page) return console.log('ERROR: launch first');
    const sp = rest.indexOf(' ');
    const sel = sp === -1 ? rest : rest.slice(0, sp);
    const value = sp === -1 ? '' : rest.slice(sp + 1);
    try { await page.fill(sel, value, { timeout: 10_000 }); console.log('fill', sel, '→ OK'); }
    catch (e) { console.log('fill', sel, '→ ERROR:', e.message.split('\n')[0]); }
  },

  async press(key) { if (page) await page.keyboard.press(key); },

  async 'wait-for'(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.waitForSelector(sel, { timeout: 10_000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  async 'wait-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.locator(`text=${text}`).first().waitFor({ timeout: 10_000 }); console.log('found text:', text); }
    catch { console.log('TIMEOUT text:', text); }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      (s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null,
    ));
  },

  async url() { console.log(page ? page.url() : '(not launched)'); },

  'console-errors'() {
    console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');
  },

  // net <url-substring> — dump recent responses whose URL contains the substring.
  // Use this instead of guessing from the UI whether an API call succeeded.
  net(substr) {
    const matches = responses.filter((r) => !substr || r.url.includes(substr));
    if (!matches.length) return console.log('(no matching responses yet)');
    for (const r of matches.slice(-10)) {
      console.log(`${r.status} ${r.url}`);
      if (r.contentType) console.log('  content-type:', r.contentType);
      if (r.contentDisposition) console.log('  content-disposition:', r.contentDisposition);
      if (r.contentLength) console.log('  content-length:', r.contentLength);
    }
  },

  // click/click-text resolve once the DOM click dispatches, not once whatever
  // async work it triggered (fetch, toast, window.open) finishes — `net` right
  // after a click routinely sees nothing yet. `sleep` before checking `net`.
  async sleep(ms) { await new Promise((r) => setTimeout(r, Number(ms) || 1000)); },

  async quit() { if (browser) await browser.close().catch(() => {}); browser = null; page = null; },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

// Plain process.stdin (unlike the _electron REPL pattern this is adapted
// from, there's no child process stealing stdin here, and the /dev/stdin
// fd trick doesn't resolve on native Windows Node anyway — ENOENT on C:\dev\stdin).
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'driver> ' });

// `rl.on('line', async ...)` does NOT serialize — readline fires 'line'
// synchronously per line, so piped/heredoc input (all lines available
// instantly) runs every command's async body concurrently and races
// (e.g. `login` executing before `launch`'s browser.launch() resolves).
// `for await (const line of rl)` pulls one line at a time and properly
// awaits the loop body before requesting the next — this is what makes
// piped-script usage (see SKILL.md) actually run in order.
console.log('frontend-web driver — "help" for commands, "launch" to start');
rl.prompt();
for await (const line of rl) {
  const trimmed = line.trim();
  const sp = trimmed.indexOf(' ');
  const cmd = sp === -1 ? trimmed : trimmed.slice(0, sp);
  const rest = sp === -1 ? '' : trimmed.slice(sp + 1);
  if (!cmd) { rl.prompt(); continue; }
  const fn = COMMANDS[cmd];
  if (!fn) { console.log('unknown:', cmd, '— try: help'); rl.prompt(); continue; }
  try { await fn(rest); } catch (e) { console.log('ERROR:', e.message); }
  if (cmd === 'quit') break;
  rl.prompt();
}
await COMMANDS.quit();
process.exit(0);
