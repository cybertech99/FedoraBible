const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { getAppRoot } = require('./appRoot');

const DB_PATH = path.join(getAppRoot(), 'data', 'bible.db');

let db;

// Hebrew niqqud (vowel points) and cantillation marks are combining
// characters layered onto the consonants (U+0591-U+05C7). Nobody types
// those when searching, but SQLite's unicode61 tokenizer doesn't strip
// them (its remove_diacritics option only covers Latin script) — so the
// FTS index has to be built from this stripped form instead of the raw,
// fully-pointed verse text, or an ordinary Hebrew search never matches
// anything. Registered on every connection since verses_fts's insert
// triggers call it directly (see data/schema.sql).
function stripNiqqud(text) {
  return text.replace(/[֑-ׇ]/g, '');
}

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA journal_mode = WAL');
    db.function('strip_niqqud', stripNiqqud);
  }
  return db;
}

module.exports = { getDb, DB_PATH };
