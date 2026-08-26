const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

const VALID_COLORS = new Set(['yellow', 'green', 'blue', 'pink', 'orange']);

router.get('/', (req, res) => {
  const db = getDb();
  const bookId = req.query.book ? Number(req.query.book) : null;
  const chapter = req.query.chapter ? Number(req.query.chapter) : null;
  if (bookId && chapter) {
    res.json(db.prepare('SELECT * FROM highlights WHERE book_id = ? AND chapter = ?').all(bookId, chapter));
  } else {
    res.json(db.prepare('SELECT * FROM highlights ORDER BY created_at DESC').all());
  }
});

router.put('/', (req, res) => {
  const db = getDb();
  const { book_id, chapter, verse, color } = req.body;
  if (!book_id || !chapter || !verse) {
    return res.status(400).json({ error: 'book_id, chapter, verse are required' });
  }
  const c = VALID_COLORS.has(color) ? color : 'yellow';
  db.prepare(
    `INSERT INTO highlights (book_id, chapter, verse, color) VALUES (?, ?, ?, ?)
     ON CONFLICT(book_id, chapter, verse) DO UPDATE SET color = excluded.color`
  ).run(book_id, chapter, verse, c);
  res.json(db.prepare('SELECT * FROM highlights WHERE book_id = ? AND chapter = ? AND verse = ?').get(book_id, chapter, verse));
});

router.delete('/', (req, res) => {
  const db = getDb();
  const { book_id, chapter, verse } = req.body;
  if (!book_id || !chapter || !verse) {
    return res.status(400).json({ error: 'book_id, chapter, verse are required' });
  }
  db.prepare('DELETE FROM highlights WHERE book_id = ? AND chapter = ? AND verse = ?').run(book_id, chapter, verse);
  res.status(204).end();
});

module.exports = router;
