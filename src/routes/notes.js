const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const bookId = req.query.book ? Number(req.query.book) : null;
  const chapter = req.query.chapter ? Number(req.query.chapter) : null;
  if (bookId && chapter) {
    res.json(db.prepare('SELECT * FROM notes WHERE book_id = ? AND chapter = ? ORDER BY verse').all(bookId, chapter));
  } else {
    res.json(db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all());
  }
});

router.put('/', (req, res) => {
  const db = getDb();
  const { book_id, chapter, body } = req.body;
  const verse = req.body.verse || 0; // 0 = chapter-level note
  if (!book_id || !chapter || !body || !body.trim()) {
    return res.status(400).json({ error: 'book_id, chapter, and non-empty body are required' });
  }
  db.prepare(
    `INSERT INTO notes (book_id, chapter, verse, body) VALUES (?, ?, ?, ?)
     ON CONFLICT(book_id, chapter, verse) DO UPDATE SET body = excluded.body, updated_at = datetime('now')`
  ).run(book_id, chapter, verse, body.trim());
  res.json(db.prepare('SELECT * FROM notes WHERE book_id = ? AND chapter = ? AND verse = ?').get(book_id, chapter, verse));
});

router.delete('/', (req, res) => {
  const db = getDb();
  const { book_id, chapter } = req.body;
  const verse = req.body.verse || 0;
  if (!book_id || !chapter) {
    return res.status(400).json({ error: 'book_id and chapter are required' });
  }
  db.prepare('DELETE FROM notes WHERE book_id = ? AND chapter = ? AND verse = ?').run(book_id, chapter, verse);
  res.status(204).end();
});

module.exports = router;
