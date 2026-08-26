const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  res.json(db.prepare(
    `SELECT bm.*, b.name AS book_name, b.abbrev
     FROM bookmarks bm JOIN books b ON b.id = bm.book_id
     ORDER BY bm.created_at DESC`
  ).all());
});

router.put('/', (req, res) => {
  const db = getDb();
  const { book_id, chapter } = req.body;
  const verse = req.body.verse || 0; // 0 = whole chapter
  const label = (req.body.label || '').trim() || null;
  if (!book_id || !chapter) {
    return res.status(400).json({ error: 'book_id and chapter are required' });
  }
  db.prepare(
    `INSERT INTO bookmarks (book_id, chapter, verse, label) VALUES (?, ?, ?, ?)
     ON CONFLICT(book_id, chapter, verse) DO UPDATE SET label = excluded.label`
  ).run(book_id, chapter, verse, label);
  res.json(db.prepare('SELECT * FROM bookmarks WHERE book_id = ? AND chapter = ? AND verse = ?').get(book_id, chapter, verse));
});

router.delete('/', (req, res) => {
  const db = getDb();
  const { book_id, chapter } = req.body;
  const verse = req.body.verse || 0;
  if (!book_id || !chapter) {
    return res.status(400).json({ error: 'book_id and chapter are required' });
  }
  db.prepare('DELETE FROM bookmarks WHERE book_id = ? AND chapter = ? AND verse = ?').run(book_id, chapter, verse);
  res.status(204).end();
});

module.exports = router;
