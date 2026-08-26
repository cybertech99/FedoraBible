const path = require('node:path');
const fs = require('node:fs');
const { isSea } = require('node:sea');
const express = require('express');
const { DB_PATH } = require('./src/db');
const { getAppRoot } = require('./src/appRoot');

// The packaged .exe runs with no console window (see scripts/lib/pe-subsystem.js),
// so console.log has nothing to write to — everything goes to a log file
// instead, and fatal errors additionally pop a native message box so they're
// actually seen rather than silently vanishing into a file nobody checks.
const LOG_PATH = path.join(getAppRoot(), 'FedoraBible.log');

function log(message) {
  if (isSea()) {
    try {
      fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${message}\n`);
    } catch { /* best-effort logging only */ }
  } else {
    console.log(message);
  }
}

function showErrorDialog(message) {
  try {
    const { execFileSync } = require('node:child_process');
    const script =
      "Add-Type -AssemblyName PresentationFramework;" +
      `[System.Windows.MessageBox]::Show(${JSON.stringify(message)}, 'FedoraBible', 'OK', 'Error') | Out-Null`;
    execFileSync('powershell', ['-NoProfile', '-Command', script], { windowsHide: true });
  } catch { /* if PowerShell itself is unavailable, the log file is the fallback */ }
}

function fatalError(message) {
  log(`FATAL: ${message}`);
  if (isSea()) {
    showErrorDialog(`${message}\n\nSee FedoraBible.log for details.`);
  } else {
    console.error(message);
  }
  process.exit(1);
}

if (isSea()) {
  process.on('uncaughtException', (err) => fatalError(`FedoraBible crashed: ${err.stack || err.message}`));
}

if (!fs.existsSync(DB_PATH)) {
  fatalError(
    isSea()
      ? `Database not found at ${DB_PATH}.\nThis .exe expects a "data" folder with bible.db next to it.`
      : `Database not found at ${DB_PATH}.\nRun "npm run setup" first (creates the schema and imports KJV).`
  );
} else {
  const app = express();
  app.use(express.json());

  app.use('/api/translations', require('./src/routes/translations'));
  app.use('/api/books', require('./src/routes/books'));
  app.use('/api/verses', require('./src/routes/verses'));
  app.use('/api/search', require('./src/routes/search'));
  app.use('/api/tabs', require('./src/routes/tabs'));
  app.use('/api/highlights', require('./src/routes/highlights'));
  app.use('/api/notes', require('./src/routes/notes'));
  app.use('/api/bookmarks', require('./src/routes/bookmarks'));
  app.use('/api/study', require('./src/routes/study'));
  app.use('/api/progress', require('./src/routes/progress'));

  // The browser has no reliable "I was just closed" signal, so the page
  // pings this while open (setInterval) and fires a beacon on pagehide.
  // A pagehide beacon alone can't tell a real close from a refresh/navigate,
  // so it just starts a short grace timer — a resumed heartbeat within that
  // window (the reload finishing) cancels it. A heartbeat that goes stale
  // with no pagehide at all (browser crashed, force-quit, network drop)
  // still eventually shuts things down via the timeout below.
  let lastHeartbeat = Date.now();
  let closingSince = null;
  let heartbeatCount = 0;
  app.post('/api/heartbeat', (req, res) => {
    lastHeartbeat = Date.now();
    closingSince = null;
    heartbeatCount++;
    if (heartbeatCount === 1) log('First heartbeat received from the page.');
    res.status(204).end();
  });
  app.post('/api/closing', (req, res) => {
    closingSince = Date.now();
    log('Received a closing signal from the page (pagehide).');
    res.status(204).end();
  });

  app.use(express.static(path.join(getAppRoot(), 'public')));

  app.use((err, req, res, next) => {
    log(`Request error: ${err.stack || err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  });

  if (isSea()) {
    // Generous on purpose: browsers heavily throttle setInterval in a
    // backgrounded/unfocused tab (Chrome can slow a 5s heartbeat down to
    // roughly once a minute), so a short timeout here would shut down a
    // window the user just isn't currently looking at. This is only a
    // fallback for pagehide never firing at all (crash, force-quit, network
    // drop) — the fast path for an actual close is the pagehide beacon below.
    const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;
    const CLOSE_GRACE_MS = 3000;
    setInterval(() => {
      try {
        const now = Date.now();
        const heartbeatStale = now - lastHeartbeat > HEARTBEAT_TIMEOUT_MS;
        const closeConfirmed = closingSince !== null && now - closingSince > CLOSE_GRACE_MS;
        if (heartbeatStale || closeConfirmed) {
          log('No browser window connected — shutting down.');
          process.exit(0);
        }
      } catch (e) {
        log(`SHUTDOWN-TICK ERROR: ${e.stack || e.message}`);
      }
    }, 2000).unref();
  }

  // A Chromium browser launched with --app=<url> opens a plain window with
  // no address bar, tabs, or bookmarks bar — the closest thing to a "real
  // app" a local web server can offer. Falls back to a normal browser tab
  // (via `start`) if neither Edge nor Chrome can be found.
  function findAppModeBrowser() {
    const candidates = [
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      process.env['ProgramFiles'] && path.join(process.env['ProgramFiles'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      process.env['LOCALAPPDATA'] && path.join(process.env['LOCALAPPDATA'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      process.env['ProgramFiles'] && path.join(process.env['ProgramFiles'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env['LOCALAPPDATA'] && path.join(process.env['LOCALAPPDATA'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ].filter(Boolean);
    return candidates.find((p) => fs.existsSync(p)) || null;
  }

  // Preferred shutdown trigger: hold the actual OS process handle for the
  // browser we launched and react to it exiting. This is what was asked
  // for — it replaces guessing from HTTP pings (which a throttled/backgrounded
  // tab can delay or drop) with the OS just telling us directly, the instant
  // it happens, with no polling and no timing window to get wrong. A fresh
  // --user-data-dir means the process we spawn is the one true "browser
  // process" for this session (Chromium's per-profile singleton) — it stays
  // alive exactly as long as any window on that profile is open, so its
  // exit reliably means "the last window closed."
  function openBrowser(url) {
    const browser = findAppModeBrowser();
    if (browser) {
      const profileDir = path.join(getAppRoot(), '.browser-profile');
      const child = require('node:child_process').spawn(browser, [
        `--app=${url}`,
        `--user-data-dir=${profileDir}`,
        '--window-size=1280,860',
        // Quiet down everything that isn't our page — a fresh profile
        // otherwise shows first-run prompts, and a purpose-built app window
        // has no use for extensions, sync, or Chrome's own update UI, whose
        // popups would otherwise look like something wrong with the app.
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-component-update',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-session-crashed-bubble',
        '--disable-client-side-phishing-detection',
        '--disable-features=Translate',
      ], { stdio: 'ignore' });
      child.on('exit', (code) => {
        log(`Browser process exited (code ${code}) — shutting down.`);
        process.exit(0);
      });
      child.on('error', (err) => {
        log(`Could not launch the browser: ${err.message}`);
      });
    } else {
      // No trackable process handle in this fallback (the default browser
      // may already be running, in which case `start` just messages it and
      // exits immediately) — the heartbeat/pagehide mechanism above is what
      // covers shutdown in this case.
      require('node:child_process').exec(`start "" "${url}"`, (err) => {
        if (err) log(`Could not open a browser: ${err.message}`);
      });
    }
  }

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    log(`FedoraBible running at ${url}`);
    // ?mode=desktop tells api.js this is the packaged app talking to its own
    // local Express server, so it should stick to the REST API only — never
    // fall back to (or pre-seed) the in-browser WASM-SQLite copy that a
    // phone/PWA visit would use. See public/js/api.js.
    if (isSea()) openBrowser(`${url}/?mode=desktop`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      fatalError(
        `Port ${PORT} is already in use — is FedoraBible already running?\n` +
        'Close the other window, or set a different port: PORT=3001 (before launching).'
      );
    } else {
      fatalError(`Failed to start: ${err.message}`);
    }
  });
}
