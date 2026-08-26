const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT code, name, language, year, is_public_domain, source_note FROM translations ORDER BY code'
  ).all();

  // Coverage lets the frontend hide books a translation doesn't have (a Greek
  // NT-only or Hebrew OT-only text) and snap to a sensible book when needed.
  const coverageRows = db.prepare(
    `SELECT DISTINCT v.translation_code AS code, b.id AS book_id, b.ordinal
     FROM verses v JOIN books b ON b.id = v.book_id
     ORDER BY b.ordinal`
  ).all();
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

  res.json(rows);
});

module.exports = router;
