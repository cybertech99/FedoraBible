const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// Nearest book (by canonical order) that actually has text for this
// translation — used so prev/next never walks off the edge of a
// partial-coverage translation (e.g. Greek NT, Hebrew OT).
function findCoveredBook(db, translation, comparator, orderDir) {
  return db.prepare(
    `SELECT b.id, b.ordinal FROM books b
     WHERE b.ordinal ${comparator} ? AND EXISTS (
       SELECT 1 FROM verses v WHERE v.translation_code = ? AND v.book_id = b.id
     )
     ORDER BY b.ordinal ${orderDir} LIMIT 1`
  );
}

function maxChapterFor(db, translation, bookId) {
  return db.prepare(
    'SELECT MAX(chapter) AS m FROM verses WHERE translation_code = ? AND book_id = ?'
  ).get(translation, bookId).m;
}

router.get('/', (req, res) => {
  const db = getDb();
  const translation = req.query.translation;
  const bookId = Number(req.query.book);
  const chapter = Number(req.query.chapter);

  if (!translation || !bookId || !chapter) {
    return res.status(400).json({ error: 'translation, book, and chapter are required' });
  }

  const book = db.prepare('SELECT id, ordinal, name, abbrev FROM books WHERE id = ?').get(bookId);
  if (!book) return res.status(404).json({ error: 'Unknown book' });

  const verses = db.prepare(
    `SELECT v.verse, v.text, h.color AS highlight_color, n.id AS note_id, bm.id AS bookmark_id
     FROM verses v
     LEFT JOIN highlights h ON h.book_id = v.book_id AND h.chapter = v.chapter AND h.verse = v.verse
     LEFT JOIN notes n ON n.book_id = v.book_id AND n.chapter = v.chapter AND n.verse = v.verse
     LEFT JOIN bookmarks bm ON bm.book_id = v.book_id AND bm.chapter = v.chapter AND bm.verse = v.verse
     WHERE v.translation_code = ? AND v.book_id = ? AND v.chapter = ?
     ORDER BY v.verse`
  ).all(translation, bookId, chapter);

  if (verses.length === 0) return res.status(404).json({ error: 'No verses found for that reference/translation' });

  const chapterNote = db.prepare(
    'SELECT id, body FROM notes WHERE book_id = ? AND chapter = ? AND verse = 0'
  ).get(bookId, chapter);
  const chapterBookmark = db.prepare(
    'SELECT id, label FROM bookmarks WHERE book_id = ? AND chapter = ? AND verse = 0'
  ).get(bookId, chapter);

  // Opening a chapter counts as having read it (single-user local app).
  db.prepare('INSERT OR IGNORE INTO read_chapters (book_id, chapter) VALUES (?, ?)').run(bookId, chapter);

  // The chapter count this translation actually has for this book (may be
  // less than the canonical max — e.g. KJV's 150 Psalms vs. the LXX's 151).
  const chaptersHere = maxChapterFor(db, translation, bookId);

  let prev = null;
  let next = null;
  if (chapter > 1) {
    prev = { book: book.id, chapter: chapter - 1 };
  } else {
    const prevBook = findCoveredBook(db, translation, '<', 'DESC').get(book.ordinal, translation);
    if (prevBook) prev = { book: prevBook.id, chapter: maxChapterFor(db, translation, prevBook.id) };
  }
  if (chapter < chaptersHere) {
    next = { book: book.id, chapter: chapter + 1 };
  } else {
    const nextBook = findCoveredBook(db, translation, '>', 'ASC').get(book.ordinal, translation);
    if (nextBook) next = { book: nextBook.id, chapter: 1 };
  }

  res.json({
    book: { id: book.id, name: book.name, abbrev: book.abbrev, chapters: chaptersHere },
    chapter,
    translation,
    verses,
    chapterNote: chapterNote || null,
    chapterBookmark: chapterBookmark || null,
    prev,
    next,
  });
});

module.exports = router;
