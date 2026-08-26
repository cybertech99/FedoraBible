-- FedoraBible database schema
-- One SQLite file holds both Bible text (translations/books/verses) and user data
-- (tabs/highlights/notes/bookmarks). Bible text tables are effectively read-only
-- after being populated by scripts/import-translation.js.

CREATE TABLE IF NOT EXISTS translations (
  code              TEXT PRIMARY KEY,       -- e.g. 'KJV', 'ASV'
  name              TEXT NOT NULL,          -- e.g. 'King James Version'
  language          TEXT NOT NULL DEFAULT 'en',
  year              INTEGER,
  is_public_domain  INTEGER NOT NULL DEFAULT 1,
  source_note       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
  id        INTEGER PRIMARY KEY,
  ordinal   INTEGER NOT NULL UNIQUE,        -- canonical 1-66 order
  name      TEXT NOT NULL UNIQUE,           -- e.g. 'Genesis'
  abbrev    TEXT NOT NULL,                  -- e.g. 'Gen'
  testament TEXT NOT NULL CHECK (testament IN ('OT', 'NT')),
  chapters  INTEGER NOT NULL                -- chapter count, filled in from KJV import
);

CREATE TABLE IF NOT EXISTS verses (
  id               INTEGER PRIMARY KEY,
  translation_code TEXT NOT NULL REFERENCES translations(code) ON DELETE CASCADE,
  book_id          INTEGER NOT NULL REFERENCES books(id),
  chapter          INTEGER NOT NULL,
  verse            INTEGER NOT NULL,
  text             TEXT NOT NULL,
  UNIQUE (translation_code, book_id, chapter, verse)
);

CREATE INDEX IF NOT EXISTS idx_verses_lookup
  ON verses (translation_code, book_id, chapter);

-- Full text search over verse text. External-content table backed by verses.
CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
  text,
  content = 'verses',
  content_rowid = 'id',
  tokenize = 'porter unicode61'
);

-- strip_niqqud (registered in src/db.js on every connection) removes Hebrew
-- vowel points/cantillation before indexing, since nobody types those when
-- searching and SQLite's tokenizer doesn't strip them on its own. It's a
-- no-op for every other script, so this applies uniformly to all text.
CREATE TRIGGER IF NOT EXISTS verses_ai AFTER INSERT ON verses BEGIN
  INSERT INTO verses_fts(rowid, text) VALUES (new.id, strip_niqqud(new.text));
END;

CREATE TRIGGER IF NOT EXISTS verses_ad AFTER DELETE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, text) VALUES ('delete', old.id, strip_niqqud(old.text));
END;

CREATE TRIGGER IF NOT EXISTS verses_au AFTER UPDATE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, text) VALUES ('delete', old.id, strip_niqqud(old.text));
  INSERT INTO verses_fts(rowid, text) VALUES (new.id, strip_niqqud(new.text));
END;

-- User data: open reading tabs (persisted so they survive a server/browser restart)
CREATE TABLE IF NOT EXISTS tabs (
  id               INTEGER PRIMARY KEY,
  position         INTEGER NOT NULL,
  translation_code TEXT NOT NULL REFERENCES translations(code),
  book_id          INTEGER NOT NULL REFERENCES books(id),
  chapter          INTEGER NOT NULL,
  is_active        INTEGER NOT NULL DEFAULT 0,
  font_family      TEXT NOT NULL DEFAULT 'serif-georgia',
  font_size        INTEGER NOT NULL DEFAULT 18,
  view_mode        TEXT NOT NULL DEFAULT 'verses',   -- 'verses' (one per line) | 'flow' (paragraph)
  column_mode      TEXT NOT NULL DEFAULT 'single',   -- 'single' | 'dual' (newspaper-style columns)
  linked           INTEGER NOT NULL DEFAULT 0,       -- linked tabs navigate together
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Highlights are tied to a passage reference, independent of translation,
-- so a highlight made while reading KJV still shows up after switching to ASV.
CREATE TABLE IF NOT EXISTS highlights (
  id         INTEGER PRIMARY KEY,
  book_id    INTEGER NOT NULL REFERENCES books(id),
  chapter    INTEGER NOT NULL,
  verse      INTEGER NOT NULL,
  color      TEXT NOT NULL DEFAULT 'yellow',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (book_id, chapter, verse)
);

-- Notes: verse = 0 means a chapter-level note; otherwise a specific verse.
CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY,
  book_id    INTEGER NOT NULL REFERENCES books(id),
  chapter    INTEGER NOT NULL,
  verse      INTEGER NOT NULL DEFAULT 0,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (book_id, chapter, verse)
);

-- Bookmarks: verse = 0 means the whole chapter is bookmarked.
CREATE TABLE IF NOT EXISTS bookmarks (
  id         INTEGER PRIMARY KEY,
  book_id    INTEGER NOT NULL REFERENCES books(id),
  chapter    INTEGER NOT NULL,
  verse      INTEGER NOT NULL DEFAULT 0,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (book_id, chapter, verse)
);

-- Reading progress: a row per chapter that has been opened in the reader.
CREATE TABLE IF NOT EXISTS read_chapters (
  book_id  INTEGER NOT NULL REFERENCES books(id),
  chapter  INTEGER NOT NULL,
  read_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (book_id, chapter)
);
