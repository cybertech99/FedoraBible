const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const books = db.prepare(
    `SELECT b.id, b.ordinal, b.name, b.abbrev, b.testament, b.chapters,
            COUNT(r.chapter) AS read
     FROM books b
     LEFT JOIN read_chapters r ON r.book_id = b.id
     GROUP BY b.id
     ORDER BY b.ordinal`
  ).all();

  const sum = (rows, key) => rows.reduce((a, r) => a + r[key], 0);
  const ot = books.filter((b) => b.testament === 'OT');
  const nt = books.filter((b) => b.testament === 'NT');

  res.json({
    total: { chapters: sum(books, 'chapters'), read: sum(books, 'read') },
    ot: { chapters: sum(ot, 'chapters'), read: sum(ot, 'read') },
    nt: { chapters: sum(nt, 'chapters'), read: sum(nt, 'read') },
    books,
  });
});

// Reset all reading progress.
router.delete('/', (req, res) => {
  getDb().exec('DELETE FROM read_chapters');
  res.status(204).end();
});

module.exports = router;
