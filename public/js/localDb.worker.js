// Dedicated worker owning the in-browser SQLite database (WASM + OPFS).
//
// This is a from-scratch reimplementation of src/routes/*.js against
// @sqlite.org/sqlite-wasm instead of node:sqlite — same SQL, same table
// schema (data/schema.sql), same request/response shapes as the REST API in
// server.js, so localDb.js (the main-thread proxy) can stand in for a fetch()
// call anywhere Api.* is used. Used only when there's no reachable Express
// backend (see the fallback logic in api.js) — a statically hosted PWA.
//
// The OPFS SyncAccessHandle Pool VFS this relies on is worker-only (throws if
// used from the main thread), which is why this whole data layer lives here
// and talks to the page over postMessage rather than running inline.

import sqlite3InitModule from '../vendor/sqlite-wasm/index.mjs';

// A leading slash matters: the pool VFS keys its filename->handle map on
// whatever string is passed to importDb() verbatim, but SQLite's own xOpen
// normalizes the name it's given through `new URL(name, "file://localhost/")`
// first (which always yields a leading slash) before doing the same lookup.
// Without the slash here, importDb() and the constructor below end up using
// two different keys, silently opens a *second*, empty database instead of
// the imported one.
const DB_FILE = '/bible.sqlite3';
// Relative to this worker script's own URL, not site-root-absolute — a
// static deploy (e.g. GitHub Pages) can serve the app from a subpath.
const SEED_URL = '../data/bible.db';

let db = null;
let readyPromise = null;

function stripNiqqud(text) {
  return typeof text === 'string' ? text.replace(/[֑-ׇ]/g, '') : text;
}

async function init() {
  const sqlite3 = await sqlite3InitModule({});
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'fedorabible' });

  if (!poolUtil.getFileNames().includes(DB_FILE)) {
    const res = await fetch(SEED_URL);
    if (!res.ok) {
      throw new Error('Could not download the Bible database for offline use. Connect to the network once to finish setup.');
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    await poolUtil.importDb(DB_FILE, bytes);
  }

  db = new poolUtil.OpfsSAHPoolDb(DB_FILE);
  db.createFunction('strip_niqqud', (ctx, text) => stripNiqqud(text));
}

function ready() {
  if (!readyPromise) readyPromise = init();
  return readyPromise;
}

function all(sql, bind) {
  return db.selectObjects(sql, bind);
}
function get(sql, bind) {
  return db.selectObjects(sql, bind)[0] ?? null;
}
function run(sql, bind) {
  db.exec({ sql, bind });
}
function scalar(sql, bind) {
  return db.selectValue(sql, bind);
}

// --- translations.js ---
function getTranslations() {
  const rows = all('SELECT code, name, language, year, is_public_domain, source_note FROM translations ORDER BY code');
  const coverageRows = all(
    `SELECT DISTINCT v.translation_code AS code, b.id AS book_id, b.ordinal
     FROM verses v JOIN books b ON b.id = v.book_id
     ORDER BY b.ordinal`
  );
  const bookIdsByCode = new Map();
  for (const r of coverageRows) {
    if (!bookIdsByCode.has(r.code)) bookIdsByCode.set(r.code, []);
    bookIdsByCode.get(r.code).push(r.book_id);
  }
  for (const r of rows) {
    const bookIds = bookIdsByCode.get(r.code) || [];
    r.book_ids = bookIds;
    const ordinals = coverageRows.filter((c) => c.code === r.code).map((c) => c.ordinal);
    r.min_ordinal = ordinals.length ? Math.min(...ordinals) : 1;
    r.max_ordinal = ordinals.length ? Math.max(...ordinals) : 66;
    r.default_book_id = bookIds[0] || 1;
  }
  return rows;
}

// --- books.js ---
function getBooks() {
  return all('SELECT id, ordinal, name, abbrev, testament, chapters FROM books ORDER BY ordinal');
}

// --- verses.js ---
function findCoveredBook(translation, comparator, orderDir, ordinal) {
  return get(
    `SELECT b.id, b.ordinal FROM books b
     WHERE b.ordinal ${comparator} ? AND EXISTS (
       SELECT 1 FROM verses v WHERE v.translation_code = ? AND v.book_id = b.id
     )
     ORDER BY b.ordinal ${orderDir} LIMIT 1`,
    [ordinal, translation]
  );
}

function maxChapterFor(translation, bookId) {
  return get('SELECT MAX(chapter) AS m FROM verses WHERE translation_code = ? AND book_id = ?', [translation, bookId]).m;
}

function getChapter({ translation, book, chapter }) {
  const bookId = Number(book);
  chapter = Number(chapter);
  if (!translation || !bookId || !chapter) {
    throw new Error('translation, book, and chapter are required');
  }

  const bookRow = get('SELECT id, ordinal, name, abbrev FROM books WHERE id = ?', [bookId]);
  if (!bookRow) throw new Error('Unknown book');

  const verses = all(
    `SELECT v.verse, v.text, h.color AS highlight_color, n.id AS note_id, bm.id AS bookmark_id
     FROM verses v
     LEFT JOIN highlights h ON h.book_id = v.book_id AND h.chapter = v.chapter AND h.verse = v.verse
     LEFT JOIN notes n ON n.book_id = v.book_id AND n.chapter = v.chapter AND n.verse = v.verse
     LEFT JOIN bookmarks bm ON bm.book_id = v.book_id AND bm.chapter = v.chapter AND bm.verse = v.verse
     WHERE v.translation_code = ? AND v.book_id = ? AND v.chapter = ?
     ORDER BY v.verse`,
    [translation, bookId, chapter]
  );
  if (verses.length === 0) throw new Error('No verses found for that reference/translation');

  const chapterNote = get('SELECT id, body FROM notes WHERE book_id = ? AND chapter = ? AND verse = 0', [bookId, chapter]);
  const chapterBookmark = get('SELECT id, label FROM bookmarks WHERE book_id = ? AND chapter = ? AND verse = 0', [bookId, chapter]);

  run('INSERT OR IGNORE INTO read_chapters (book_id, chapter) VALUES (?, ?)', [bookId, chapter]);

  const chaptersHere = maxChapterFor(translation, bookId);

  let prev = null;
  let next = null;
  if (chapter > 1) {
    prev = { book: bookRow.id, chapter: chapter - 1 };
  } else {
    const prevBook = findCoveredBook(translation, '<', 'DESC', bookRow.ordinal);
    if (prevBook) prev = { book: prevBook.id, chapter: maxChapterFor(translation, prevBook.id) };
  }
  if (chapter < chaptersHere) {
    next = { book: bookRow.id, chapter: chapter + 1 };
  } else {
    const nextBook = findCoveredBook(translation, '>', 'ASC', bookRow.ordinal);
    if (nextBook) next = { book: nextBook.id, chapter: 1 };
  }

  return {
    book: { id: bookRow.id, name: bookRow.name, abbrev: bookRow.abbrev, chapters: chaptersHere },
    chapter,
    translation,
    verses,
    chapterNote: chapterNote || null,
    chapterBookmark: chapterBookmark || null,
    prev,
    next,
  };
}

// --- search.js ---
function toFtsQuery(raw) {
  const terms = raw.trim().split(/\s+/).filter(Boolean);
  const parts = [];
  for (const term of terms) {
    const starIdx = term.indexOf('*');
    const isPrefix = starIdx !== -1;
    const stem = isPrefix ? term.slice(0, starIdx) : term;
    const cleaned = stem.replace(/[^\p{L}\p{N}']/gu, '');
    if (!cleaned) continue;
    parts.push(isPrefix ? `${cleaned}*` : `"${cleaned.replace(/"/g, '""')}"`);
  }
  return parts.join(' ');
}

function search({ q, translation, testament, book }) {
  q = (q || '').trim();
  translation = translation || 'KJV';
  const bookId = book ? Number(book) : null;
  const limit = 50;
  const offset = 0;

  if (!q) return { query: q, total: 0, results: [] };
  const ftsQuery = toFtsQuery(q);
  if (!ftsQuery) return { query: q, total: 0, results: [] };

  const params = [ftsQuery, translation];
  let where = 'verses_fts.text MATCH ? AND v.translation_code = ?';
  if (bookId) {
    where += ' AND v.book_id = ?';
    params.push(bookId);
  }
  if (testament === 'OT' || testament === 'NT') {
    where += ' AND b.testament = ?';
    params.push(testament);
  }

  let total = 0;
  try {
    total = get(
      `SELECT COUNT(*) AS n FROM verses_fts
       JOIN verses v ON v.id = verses_fts.rowid
       JOIN books b ON b.id = v.book_id
       WHERE ${where}`,
      params
    ).n;
  } catch {
    throw new Error('Invalid search query');
  }

  const results = all(
    `SELECT b.id AS book_id, b.name AS book_name, b.abbrev, v.chapter, v.verse, v.text,
            bm25(verses_fts) AS rank
     FROM verses_fts
     JOIN verses v ON v.id = verses_fts.rowid
     JOIN books b ON b.id = v.book_id
     WHERE ${where}
     ORDER BY bm25(verses_fts)
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { query: q, total, results };
}

// --- notes.js ---
function getNotesForChapter({ book, chapter }) {
  return all('SELECT * FROM notes WHERE book_id = ? AND chapter = ? ORDER BY verse', [book, chapter]);
}

function setNote({ book_id, chapter, verse, body }) {
  verse = verse || 0;
  if (!book_id || !chapter || !body || !body.trim()) {
    throw new Error('book_id, chapter, and non-empty body are required');
  }
  run(
    `INSERT INTO notes (book_id, chapter, verse, body) VALUES (?, ?, ?, ?)
     ON CONFLICT(book_id, chapter, verse) DO UPDATE SET body = excluded.body, updated_at = datetime('now')`,
    [book_id, chapter, verse, body.trim()]
  );
  return get('SELECT * FROM notes WHERE book_id = ? AND chapter = ? AND verse = ?', [book_id, chapter, verse]);
}

function removeNote({ book_id, chapter, verse }) {
  verse = verse || 0;
  if (!book_id || !chapter) throw new Error('book_id and chapter are required');
  run('DELETE FROM notes WHERE book_id = ? AND chapter = ? AND verse = ?', [book_id, chapter, verse]);
  return null;
}

// --- tabs.js ---
const VALID_FONT_FAMILIES = new Set([
  'serif-literata', 'serif-georgia', 'serif-palatino', 'serif-times', 'serif-garamond', 'sans-system', 'mono',
  'greek-gentium', 'hebrew-noto', 'coptic-noto', 'syriac-estrangela', 'syriac-serto', 'arabic-naskh',
]);
const VALID_VIEW_MODES = new Set(['verses', 'flow']);
const VALID_COLUMN_MODES = new Set(['single', 'dual']);
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 36;
function clampFontSize(size) {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

function getTabs() {
  return all('SELECT * FROM tabs ORDER BY position');
}

function createTab(body) {
  const { translation_code, book_id, chapter } = body;
  if (!translation_code || !book_id || !chapter) {
    throw new Error('translation_code, book_id, chapter are required');
  }
  const font_family = VALID_FONT_FAMILIES.has(body.font_family) ? body.font_family : 'serif-literata';
  const font_size = body.font_size ? clampFontSize(Number(body.font_size)) : 18;
  const view_mode = VALID_VIEW_MODES.has(body.view_mode) ? body.view_mode : 'verses';
  const column_mode = VALID_COLUMN_MODES.has(body.column_mode) ? body.column_mode : 'single';

  const maxPos = get('SELECT COALESCE(MAX(position), -1) AS m FROM tabs').m;
  run('UPDATE tabs SET is_active = 0');
  run(
    `INSERT INTO tabs (position, translation_code, book_id, chapter, is_active, font_family, font_size, view_mode, column_mode)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [maxPos + 1, translation_code, book_id, chapter, font_family, font_size, view_mode, column_mode]
  );
  const id = scalar('SELECT last_insert_rowid()');
  return get('SELECT * FROM tabs WHERE id = ?', [id]);
}

function updateTab({ id, patch }) {
  id = Number(id);
  const existing = get('SELECT * FROM tabs WHERE id = ?', [id]);
  if (!existing) throw new Error('Tab not found');

  const body = patch || {};
  const translation_code = body.translation_code ?? existing.translation_code;
  const book_id = body.book_id ?? existing.book_id;
  const chapter = body.chapter ?? existing.chapter;
  const position = body.position ?? existing.position;
  const font_family = body.font_family
    ? (VALID_FONT_FAMILIES.has(body.font_family) ? body.font_family : existing.font_family)
    : existing.font_family;
  const font_size = body.font_size ? clampFontSize(Number(body.font_size)) : existing.font_size;
  const view_mode = VALID_VIEW_MODES.has(body.view_mode) ? body.view_mode : existing.view_mode;
  const column_mode = VALID_COLUMN_MODES.has(body.column_mode) ? body.column_mode : existing.column_mode;
  const linked = body.linked !== undefined ? (body.linked ? 1 : 0) : existing.linked;

  if (body.is_active) run('UPDATE tabs SET is_active = 0');
  const is_active = body.is_active ? 1 : existing.is_active;

  run(
    `UPDATE tabs SET translation_code = ?, book_id = ?, chapter = ?, position = ?,
       is_active = ?, font_family = ?, font_size = ?, view_mode = ?, column_mode = ?, linked = ?,
       updated_at = datetime('now') WHERE id = ?`,
    [translation_code, book_id, chapter, position, is_active, font_family, font_size, view_mode, column_mode, linked, id]
  );
  return get('SELECT * FROM tabs WHERE id = ?', [id]);
}

function deleteTab({ id }) {
  run('DELETE FROM tabs WHERE id = ?', [Number(id)]);
  return null;
}

// --- highlights.js ---
const VALID_COLORS = new Set(['yellow', 'green', 'blue', 'pink', 'orange']);

function setHighlight({ book_id, chapter, verse, color }) {
  if (!book_id || !chapter || !verse) throw new Error('book_id, chapter, verse are required');
  const c = VALID_COLORS.has(color) ? color : 'yellow';
  run(
    `INSERT INTO highlights (book_id, chapter, verse, color) VALUES (?, ?, ?, ?)
     ON CONFLICT(book_id, chapter, verse) DO UPDATE SET color = excluded.color`,
    [book_id, chapter, verse, c]
  );
  return get('SELECT * FROM highlights WHERE book_id = ? AND chapter = ? AND verse = ?', [book_id, chapter, verse]);
}

function removeHighlight({ book_id, chapter, verse }) {
  if (!book_id || !chapter || !verse) throw new Error('book_id, chapter, verse are required');
  run('DELETE FROM highlights WHERE book_id = ? AND chapter = ? AND verse = ?', [book_id, chapter, verse]);
  return null;
}

// --- bookmarks.js ---
function setBookmark({ book_id, chapter, verse, label }) {
  verse = verse || 0;
  label = (label || '').trim() || null;
  if (!book_id || !chapter) throw new Error('book_id and chapter are required');
  run(
    `INSERT INTO bookmarks (book_id, chapter, verse, label) VALUES (?, ?, ?, ?)
     ON CONFLICT(book_id, chapter, verse) DO UPDATE SET label = excluded.label`,
    [book_id, chapter, verse, label]
  );
  return get('SELECT * FROM bookmarks WHERE book_id = ? AND chapter = ? AND verse = ?', [book_id, chapter, verse]);
}

function removeBookmark({ book_id, chapter, verse }) {
  verse = verse || 0;
  if (!book_id || !chapter) throw new Error('book_id and chapter are required');
  run('DELETE FROM bookmarks WHERE book_id = ? AND chapter = ? AND verse = ?', [book_id, chapter, verse]);
  return null;
}

// --- study.js ---
function getStudy({ translation }) {
  translation = translation || 'KJV';
  const highlights = all(
    `SELECT h.book_id, h.chapter, h.verse, h.color, h.created_at,
            b.name AS book_name, b.abbrev, v.text
     FROM highlights h
     JOIN books b ON b.id = h.book_id
     LEFT JOIN verses v ON v.book_id = h.book_id AND v.chapter = h.chapter
       AND v.verse = h.verse AND v.translation_code = ?
     ORDER BY b.ordinal, h.chapter, h.verse`,
    [translation]
  );
  const notes = all(
    `SELECT n.book_id, n.chapter, n.verse, n.body, n.updated_at,
            b.name AS book_name, b.abbrev, v.text
     FROM notes n
     JOIN books b ON b.id = n.book_id
     LEFT JOIN verses v ON v.book_id = n.book_id AND v.chapter = n.chapter
       AND v.verse = n.verse AND v.translation_code = ?
     ORDER BY n.updated_at DESC`,
    [translation]
  );
  const bookmarks = all(
    `SELECT bm.book_id, bm.chapter, bm.verse, bm.label, bm.created_at,
            b.name AS book_name, b.abbrev, v.text
     FROM bookmarks bm
     JOIN books b ON b.id = bm.book_id
     LEFT JOIN verses v ON v.book_id = bm.book_id AND v.chapter = bm.chapter
       AND v.verse = bm.verse AND v.translation_code = ?
     ORDER BY bm.created_at DESC`,
    [translation]
  );
  return { highlights, notes, bookmarks };
}

// --- progress.js ---
function getProgress() {
  const books = all(
    `SELECT b.id, b.ordinal, b.name, b.abbrev, b.testament, b.chapters,
            COUNT(r.chapter) AS read
     FROM books b
     LEFT JOIN read_chapters r ON r.book_id = b.id
     GROUP BY b.id
     ORDER BY b.ordinal`
  );
  const sum = (rows, key) => rows.reduce((a, r) => a + r[key], 0);
  const ot = books.filter((b) => b.testament === 'OT');
  const nt = books.filter((b) => b.testament === 'NT');
  return {
    total: { chapters: sum(books, 'chapters'), read: sum(books, 'read') },
    ot: { chapters: sum(ot, 'chapters'), read: sum(ot, 'read') },
    nt: { chapters: sum(nt, 'chapters'), read: sum(nt, 'read') },
    books,
  };
}

function resetProgress() {
  run('DELETE FROM read_chapters');
  return null;
}

const ops = {
  getTranslations, getBooks, getChapter, search, getNotesForChapter,
  getTabs, createTab, updateTab, deleteTab,
  setHighlight, removeHighlight, setNote, removeNote,
  setBookmark, removeBookmark, getStudy, getProgress, resetProgress,
};

self.onmessage = async (ev) => {
  const { id, op, args } = ev.data;
  try {
    await ready();
    const fn = ops[op];
    if (!fn) throw new Error(`Unknown local-db operation: ${op}`);
    const result = fn(args);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};
