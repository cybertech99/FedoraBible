// Bootstrap + app-level chrome (theme, toast).
const App = (() => {
  const THEMES = ['light', 'sepia', 'dark'];
  const THEME_NAMES = { light: 'Parchment', sepia: 'Manuscript', dark: 'Ink' };

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('fb-theme', theme);
  }

  function cycleTheme() {
    const cur = document.documentElement.dataset.theme || 'light';
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    applyTheme(next);
    toast(THEME_NAMES[next]);
  }

  // Whether clicking a verse opens the notes/highlight popover (the
  // long-standing default) or does nothing at all — a global app preference
  // (localStorage), not per-tab, since having it vary pane-to-pane would
  // make clicking unpredictable. Off is meant for mobile: an accidental tap
  // while scrolling/reading shouldn't pop anything up. The plain :hover glow
  // on a verse (see app.css) is unrelated to this and always stays on —
  // this only governs the click action.
  let versePopupEnabled = true;
  function isVersePopupEnabled() {
    return versePopupEnabled;
  }
  function applyVersePopupSetting(enabled) {
    versePopupEnabled = enabled;
    localStorage.setItem('fb-verse-popup', enabled ? '1' : '0');
    document.getElementById('verse-popup-btn').classList.toggle('on', enabled);
  }
  function toggleVersePopup() {
    applyVersePopupSetting(!versePopupEnabled);
    toast(versePopupEnabled ? 'Verse click: notes & highlight popup' : 'Verse click: disabled');
  }

  // Tiny toast utility, used app-wide.
  let toastTimer = null;
  window.toast = function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  };

  // Lets the packaged .exe shut itself down once no browser window has this
  // page open — see server.js. Harmless no-op against a plain dev server.
  function startLifecycleSignals() {
    const ping = () => fetch('api/heartbeat', { method: 'POST' }).catch(() => {});
    ping();
    setInterval(ping, 5000);
    // A visibility change (tab backgrounded/foregrounded) is one of the few
    // moments a throttled background tab is guaranteed to actually run JS —
    // an extra ping right then keeps the server's "still open" clock fresh.
    document.addEventListener('visibilitychange', ping);
    window.addEventListener('pagehide', () => {
      navigator.sendBeacon('api/closing');
    });
  }

  // Makes the app installable and (after one successful visit) usable fully
  // offline. Registering this is harmless when Express is serving the page
  // too — the service worker never intercepts /api/* (see sw.js), so the
  // desktop app's live REST calls are unaffected. Relative path, not
  // site-root-absolute: a static deploy (e.g. GitHub Pages) can serve this
  // from a subpath, and a relative registration scopes correctly to it.
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  async function boot() {
    applyTheme(localStorage.getItem('fb-theme') || 'light');
    document.getElementById('theme-btn').addEventListener('click', cycleTheme);
    applyVersePopupSetting(localStorage.getItem('fb-verse-popup') !== '0');
    document.getElementById('verse-popup-btn').addEventListener('click', toggleVersePopup);
    startLifecycleSignals();
    registerServiceWorker();

    try {
      const [translations, books] = await Promise.all([Api.getTranslations(), Api.getBooks()]);
      State.translations = translations;
      State.books = books;
      Drawer.init();
      await Tabs.init();
    } catch (err) {
      document.getElementById('panes').innerHTML =
        `<p style="padding:2em;font-family:var(--font-ui)">Failed to start: ${err.message}. Did you run <code>npm run setup</code>?</p>`;
      console.error(err);
    }
  }

  boot();

  return { cycleTheme, isVersePopupEnabled, toggleVersePopup };
})();
