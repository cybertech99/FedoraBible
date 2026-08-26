const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

const VALID_FONT_FAMILIES = new Set([
  'serif-literata', 'serif-georgia', 'serif-palatino', 'serif-times', 'serif-garamond', 'sans-system', 'mono',
  'greek-gentium', 'hebrew-noto', 'coptic-noto', 'syriac-estrangela', 'syriac-serto', 'arabic-naskh',
]);
const VALID_VIEW_MODES = new Set(['verses', 'flow']);
const VALID_COLUMN_MODES = new Set(['single', 'dual']);
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 36;

function clampFontSize(size) {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tabs ORDER BY position').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const db = getDb();
  const { translation_code, book_id, chapter } = req.body;
  if (!translation_code || !book_id || !chapter) {
    return res.status(400).json({ error: 'translation_code, book_id, chapter are required' });
  }
  const font_family = VALID_FONT_FAMILIES.has(req.body.font_family) ? req.body.font_family : 'serif-literata';
  const font_size = req.body.font_size ? clampFontSize(Number(req.body.font_size)) : 18;
  const view_mode = VALID_VIEW_MODES.has(req.body.view_mode) ? req.body.view_mode : 'verses';
  const column_mode = VALID_COLUMN_MODES.has(req.body.column_mode) ? req.body.column_mode : 'single';

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM tabs').get().m;
  db.exec('UPDATE tabs SET is_active = 0');
  const info = db.prepare(
    `INSERT INTO tabs (position, translation_code, book_id, chapter, is_active, font_family, font_size, view_mode, column_mode)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`
  ).run(maxPos + 1, translation_code, book_id, chapter, font_family, font_size, view_mode, column_mode);
  const row = db.prepare('SELECT * FROM tabs WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tabs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Tab not found' });

  const translation_code = req.body.translation_code ?? existing.translation_code;
  const book_id = req.body.book_id ?? existing.book_id;
  const chapter = req.body.chapter ?? existing.chapter;
  const position = req.body.position ?? existing.position;
  const font_family = req.body.font_family
    ? (VALID_FONT_FAMILIES.has(req.body.font_family) ? req.body.font_family : existing.font_family)
    : existing.font_family;
  const font_size = req.body.font_size ? clampFontSize(Number(req.body.font_size)) : existing.font_size;
  const view_mode = VALID_VIEW_MODES.has(req.body.view_mode) ? req.body.view_mode : existing.view_mode;
  const column_mode = VALID_COLUMN_MODES.has(req.body.column_mode) ? req.body.column_mode : existing.column_mode;
  const linked = req.body.linked !== undefined ? (req.body.linked ? 1 : 0) : existing.linked;

  if (req.body.is_active) {
    db.exec('UPDATE tabs SET is_active = 0');
  }
  const is_active = req.body.is_active ? 1 : existing.is_active;

  db.prepare(
    `UPDATE tabs SET translation_code = ?, book_id = ?, chapter = ?, position = ?,
       is_active = ?, font_family = ?, font_size = ?, view_mode = ?, column_mode = ?, linked = ?,
       updated_at = datetime('now') WHERE id = ?`
  ).run(translation_code, book_id, chapter, position, is_active, font_family, font_size, view_mode, column_mode, linked, id);

  res.json(db.prepare('SELECT * FROM tabs WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  db.prepare('DELETE FROM tabs WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
