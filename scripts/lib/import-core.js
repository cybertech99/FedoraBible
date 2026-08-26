// Shared transaction logic for importing a translation's verse text into the
// database, used by every format-specific importer script.
//
// bookEntries: [{ name, chapters: [{ chapter, verses: [{ verse, text }] }] }]
// `name` must match books.name exactly (e.g. "1 Samuel", "Song of Solomon").
const { getDb } = require('../../src/db');

function runImport({ code, name, language, year, isPublicDomain, sourceNote }, bookEntries) {
  const db = getDb();
  const dbBooks = db.prepare('SELECT id, name FROM books').all();
  const bookIdByName = new Map(dbBooks.map((b) => [b.name, b.id]));

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO translations (code, name, language, year, is_public_domain, source_note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         name = excluded.name, language = excluded.language, year = excluded.year,
         is_public_domain = excluded.is_public_domain, source_note = excluded.source_note`
    ).run(code, name, language || 'en', year, isPublicDomain ? 1 : 0, sourceNote || null);

    db.prepare('DELETE FROM verses WHERE translation_code = ?').run(code);

    const insertVerse = db.prepare(
      'INSERT INTO verses (translation_code, book_id, chapter, verse, text) VALUES (?, ?, ?, ?, ?)'
    );
    // A translation may cover more (LXX Psalms/Esther/Daniel) or fewer (TR=NT
    // only, WLC=OT only) chapters than whatever was imported first, so the
    // visible chapter range always grows to fit the richest translation.
    const updateChapters = db.prepare(
      'UPDATE books SET chapters = MAX(chapters, ?) WHERE id = ?'
    );

    let verseCount = 0;
    let bookCount = 0;
    for (const entry of bookEntries) {
      const bookId = bookIdByName.get(entry.name);
      if (!bookId) {
        throw new Error(`Unknown book "${entry.name}" — not in canonical books table`);
      }
      let maxChapter = 0;
      for (const ch of entry.chapters) {
        const chapterNum = Number(ch.chapter);
        if (ch.verses.length === 0) continue;
        maxChapter = Math.max(maxChapter, chapterNum);
        for (const v of ch.verses) {
          if (!v.text || !v.text.trim()) continue;
          insertVerse.run(code, bookId, chapterNum, Number(v.verse), v.text);
          verseCount++;
        }
      }
      if (maxChapter > 0) updateChapters.run(maxChapter, bookId);
      bookCount++;
    }

    db.exec('COMMIT');
    console.log(`Imported ${code}: ${bookCount} books, ${verseCount} verses.`);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

module.exports = { runImport, parseArgs };
