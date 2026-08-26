// Main-thread proxy for the in-browser SQLite data layer (localDb.worker.js).
// Exposes the exact same method surface as the REST half of api.js, so
// api.js can swap this in without any other frontend file knowing the
// difference. The Worker (and the WASM/OPFS machinery it loads) is only
// created on the first call, so desktop/Express-served sessions — which
// never fall back to this — pay nothing for it just by having this script
// on the page.
const LocalDb = (() => {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  function getWorker() {
    if (!worker) {
      worker = new Worker('js/localDb.worker.js', { type: 'module' });
      worker.onmessage = (ev) => {
        const { id, ok, result, error } = ev.data;
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        if (ok) p.resolve(result);
        else p.reject(new Error(error));
      };
      worker.onerror = (ev) => {
        const err = new Error(ev.message || 'Local database worker error');
        for (const p of pending.values()) p.reject(err);
        pending.clear();
      };
    }
    return worker;
  }

  function call(op, args) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      getWorker().postMessage({ id, op, args });
    });
  }

  return {
    getTranslations: () => call('getTranslations'),
    getBooks: () => call('getBooks'),
    getChapter: (translation, book, chapter) => call('getChapter', { translation, book, chapter }),
    search: (q, translation, testament, book) => call('search', { q, translation, testament, book }),
    getNotesForChapter: (book, chapter) => call('getNotesForChapter', { book, chapter }),
    getTabs: () => call('getTabs'),
    createTab: (fields) => call('createTab', fields),
    updateTab: (id, patch) => call('updateTab', { id, patch }),
    deleteTab: (id) => call('deleteTab', { id }),
    setHighlight: (book_id, chapter, verse, color) => call('setHighlight', { book_id, chapter, verse, color }),
    removeHighlight: (book_id, chapter, verse) => call('removeHighlight', { book_id, chapter, verse }),
    setNote: (book_id, chapter, verse, body) => call('setNote', { book_id, chapter, verse, body }),
    removeNote: (book_id, chapter, verse) => call('removeNote', { book_id, chapter, verse }),
    setBookmark: (book_id, chapter, verse, label) => call('setBookmark', { book_id, chapter, verse, label }),
    removeBookmark: (book_id, chapter, verse) => call('removeBookmark', { book_id, chapter, verse }),
    getStudy: (translation) => call('getStudy', { translation }),
    getProgress: () => call('getProgress'),
    resetProgress: () => call('resetProgress'),
  };
})();
