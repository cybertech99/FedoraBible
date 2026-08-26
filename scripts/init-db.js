// Creates data/bible.db from data/schema.sql and seeds the canonical books table.
// Safe to re-run: uses CREATE TABLE IF NOT EXISTS and INSERT OR IGNORE.
const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../src/db');
const BOOKS = require('./books-meta');

// SQLite has no "ADD COLUMN IF NOT EXISTS"; patch older databases in place
// so re-running setup after a schema.sql change doesn't require a wipe.
function migrateColumns(db) {
  const tabsCols = db.prepare("PRAGMA table_info(tabs)").all().map((c) => c.name);
  if (!tabsCols.includes('font_family')) {
    db.exec("ALTER TABLE tabs ADD COLUMN font_family TEXT NOT NULL DEFAULT 'serif-georgia'");
  }
  if (!tabsCols.includes('font_size')) {
    db.exec('ALTER TABLE tabs ADD COLUMN font_size INTEGER NOT NULL DEFAULT 18');
  }
  if (!tabsCols.includes('view_mode')) {
    db.exec("ALTER TABLE tabs ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'verses'");
  }
  if (!tabsCols.includes('linked')) {
    db.exec('ALTER TABLE tabs ADD COLUMN linked INTEGER NOT NULL DEFAULT 0');
  }
  if (!tabsCols.includes('column_mode')) {
    db.exec("ALTER TABLE tabs ADD COLUMN column_mode TEXT NOT NULL DEFAULT 'single'");
  }
}

// The verses_fts triggers now index a niqqud-stripped copy of the text (see
// data/schema.sql), but that only takes effect for future inserts — any
// verses already imported are still indexed with their original vowel
// points/cantillation marks, which an ordinary unpointed search never
// matches. Cheap to redo unconditionally (~150k rows) and a no-op on a
// fresh, empty database.
//
// Batched rather than one `DELETE FROM verses_fts` + one bulk INSERT: doing
// the whole external-content table in a single statement reproducibly
// throws "database disk image is malformed" from node:sqlite (confirmed not
// actual corruption — PRAGMA integrity_check and FTS5's own
// integrity-check both pass either way) once the table is this large.
// Chunking by id range sidesteps it.
function reindexFts(db) {
  const maxId = db.prepare('SELECT MAX(id) AS m FROM verses').get().m;
  if (maxId == null) return;
  const BATCH = 2000;
  const delStmt = db.prepare('DELETE FROM verses_fts WHERE rowid >= ? AND rowid < ?');
  const insStmt = db.prepare(
    'INSERT INTO verses_fts(rowid, text) SELECT id, strip_niqqud(text) FROM verses WHERE id >= ? AND id < ?'
  );
  for (let start = 0; start <= maxId; start += BATCH) {
    const end = start + BATCH;
    db.exec('BEGIN');
    try {
      delStmt.run(start, end);
      insStmt.run(start, end);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

function main() {
  const db = getDb();
  const schema = fs.readFileSync(path.join(__dirname, '..', 'data', 'schema.sql'), 'utf8');
  db.exec(schema);
  migrateColumns(db);
  reindexFts(db);

  const insertBook = db.prepare(
    'INSERT OR IGNORE INTO books (ordinal, name, abbrev, testament, chapters) VALUES (?, ?, ?, ?, 0)'
  );
  for (const b of BOOKS) {
    insertBook.run(b.ordinal, b.name, b.abbrev, b.testament);
  }

  console.log(`Schema ready. Books seeded: ${db.prepare('SELECT COUNT(*) AS n FROM books').get().n}`);
}

main();
