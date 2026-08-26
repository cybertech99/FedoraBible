const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, ordinal, name, abbrev, testament, chapters FROM books ORDER BY ordinal'
  ).all();
  res.json(rows);
});

module.exports = router;
