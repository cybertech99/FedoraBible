// Data-access facade for FedoraBible. Talks to the Express REST API when one
// is reachable (desktop app / packaged .exe, unchanged from before); falls
// back to the in-browser WASM-SQLite data layer (localDb.js) otherwise — the
// case for a statically hosted / fully offline PWA build with no server
// behind it. Every other frontend file calls through this object and never
// needs to know which backend answered.
const Api = (() => {
  async function req(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  const restApi = {
    getTranslations: () => req('GET', 'api/translations'),
    getBooks: () => req('GET', 'api/books'),
    getChapter: (translation, book, chapter) =>
      req('GET', `api/verses?translation=${encodeURIComponent(translation)}&book=${book}&chapter=${chapter}`),
    search: (q, translation, testament, book) => {
      const params = new URLSearchParams({ q, translation });
      if (testament) params.set('testament', testament);
      if (book) params.set('book', book);
      return req('GET', `api/search?${params.toString()}`);
    },
    getNotesForChapter: (book, chapter) => req('GET', `api/notes?book=${book}&chapter=${chapter}`),
    getTabs: () => req('GET', 'api/tabs'),
    createTab: (fields) => req('POST', 'api/tabs', fields),
    updateTab: (id, patch) => req('PUT', `api/tabs/${id}`, patch),
    deleteTab: (id) => req('DELETE', `api/tabs/${id}`),
    setHighlight: (book_id, chapter, verse, color) =>
      req('PUT', 'api/highlights', { book_id, chapter, verse, color }),
    removeHighlight: (book_id, chapter, verse) =>
      req('DELETE', 'api/highlights', { book_id, chapter, verse }),
    setNote: (book_id, chapter, verse, body) =>
      req('PUT', 'api/notes', { book_id, chapter, verse, body }),
    removeNote: (book_id, chapter, verse) =>
      req('DELETE', 'api/notes', { book_id, chapter, verse }),
    setBookmark: (book_id, chapter, verse, label) =>
      req('PUT', 'api/bookmarks', { book_id, chapter, verse, label }),
    removeBookmark: (book_id, chapter, verse) =>
      req('DELETE', 'api/bookmarks', { book_id, chapter, verse }),
    getStudy: (translation) => req('GET', `api/study?translation=${encodeURIComponent(translation || 'KJV')}`),
    getProgress: () => req('GET', 'api/progress'),
    resetProgress: () => req('DELETE', 'api/progress'),
  };

  // The packaged desktop app opens its own local Express server with this
  // marker (see server.js) — it has node:sqlite right there and no offline
  // use case, so it talks to REST only, exactly as before this file grew a
  // PWA fallback. Everything else (a phone, any other browser tab pointed
  // at this same server, a statically hosted build) is treated as needing
  // to work offline: it tries REST per call — fine, and fast, while a
  // server happens to be reachable — but falls back to LocalDb (WASM SQLite
  // + OPFS, defined in localDb.js) the moment a call fails, e.g. no network
  // at all. Committing to one backend for the whole session (the earlier
  // design here) was the bug: a phone on the same WiFi as the desktop app
  // would find REST reachable, never seed LocalDb, and then have nothing to
  // fall back to once it actually went offline.
  const IS_DESKTOP_APP = new URLSearchParams(location.search).get('mode') === 'desktop';

  if (!IS_DESKTOP_APP) {
    // Fire-and-forget: keeps the in-browser copy warm so it's ready by the
    // time a call actually needs to fall back to it. A failure here (no
    // network at all on a first-ever visit) is harmless — it just means
    // offline use isn't available yet until one visit succeeds.
    LocalDb.getTranslations().catch(() => {});
  }

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out')), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });
  }

  const methodNames = [
    'getTranslations', 'getBooks', 'getChapter', 'search', 'getNotesForChapter',
    'getTabs', 'createTab', 'updateTab', 'deleteTab',
    'setHighlight', 'removeHighlight', 'setNote', 'removeNote',
    'setBookmark', 'removeBookmark', 'getStudy', 'getProgress', 'resetProgress',
  ];
  const facade = {};
  for (const name of methodNames) {
    facade[name] = IS_DESKTOP_APP
      ? (...args) => restApi[name](...args)
      : async (...args) => {
        try {
          return await withTimeout(restApi[name](...args), 3000);
        } catch {
          return LocalDb[name](...args);
        }
      };
  }
  return facade;
})();
