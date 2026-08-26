const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// Each term becomes either a quoted FTS5 phrase (exact word) or, if the user
// wrote a trailing "*", an unquoted prefix query (FTS5 only supports wildcard
// as a suffix on a bareword token — "lov*" matches love/loves/loved/loving,
// but a leading/mid-word "*" has no FTS5 equivalent and is dropped along with
// the rest of that term). Punctuation besides the wildcard is stripped so it
// can't be parsed as query syntax.
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

router.get('/', (req, res) => {
  const db = getDb();
  const q = (req.query.q || '').trim();
  const translation = req.query.translation || 'KJV';
  const bookId = req.query.book ? Number(req.query.book) : null;
  const testament = req.query.testament || null;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  if (!q) return res.json({ query: q, total: 0, results: [] });

  const ftsQuery = toFtsQuery(q);
  if (!ftsQuery) return res.json({ query: q, total: 0, results: [] });

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
    total = db.prepare(
      `SELECT COUNT(*) AS n FROM verses_fts
       JOIN verses v ON v.id = verses_fts.rowid
       JOIN books b ON b.id = v.book_id
       WHERE ${where}`
    ).get(...params).n;
  } catch {
    return res.status(400).json({ error: 'Invalid search query' });
  }

  const results = db.prepare(
    `SELECT b.id AS book_id, b.name AS book_name, b.abbrev, v.chapter, v.verse, v.text,
            bm25(verses_fts) AS rank
     FROM verses_fts
     JOIN verses v ON v.id = verses_fts.rowid
     JOIN books b ON b.id = v.book_id
     WHERE ${where}
     ORDER BY bm25(verses_fts)
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ query: q, total, results });
});

module.exports = router;
