// Aggregate feed for the study drawer: every highlight, note, and bookmark,
// joined with verse text from a base translation so the lists are readable
// without a lookup per row.
const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const translation = req.query.translation || 'KJV';

  const highlights = db.prepare(
    `SELECT h.book_id, h.chapter, h.verse, h.color, h.created_at,
            b.name AS book_name, b.abbrev, v.text
     FROM highlights h
     JOIN books b ON b.id = h.book_id
     LEFT JOIN verses v ON v.book_id = h.book_id AND v.chapter = h.chapter
       AND v.verse = h.verse AND v.translation_code = ?
     ORDER BY b.ordinal, h.chapter, h.verse`
  ).all(translation);

  const notes = db.prepare(
    `SELECT n.book_id, n.chapter, n.verse, n.body, n.updated_at,
            b.name AS book_name, b.abbrev, v.text
     FROM notes n
     JOIN books b ON b.id = n.book_id
     LEFT JOIN verses v ON v.book_id = n.book_id AND v.chapter = n.chapter
       AND v.verse = n.verse AND v.translation_code = ?
     ORDER BY n.updated_at DESC`
  ).all(translation);

  const bookmarks = db.prepare(
    `SELECT bm.book_id, bm.chapter, bm.verse, bm.label, bm.created_at,
            b.name AS book_name, b.abbrev, v.text
     FROM bookmarks bm
     JOIN books b ON b.id = bm.book_id
     LEFT JOIN verses v ON v.book_id = bm.book_id AND v.chapter = bm.chapter
       AND v.verse = bm.verse AND v.translation_code = ?
     ORDER BY bm.created_at DESC`
  ).all(translation);

  res.json({ highlights, notes, bookmarks });
});

module.exports = router;
