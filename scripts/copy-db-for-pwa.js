// Copies the built data/bible.db into public/data/bible.db, so it's served
// as a plain static file — both by Express (desktop app, unchanged) and by
// any static host the PWA build gets deployed to. This is the one-time seed
// localDb.worker.js fetches to populate OPFS on a phone's first visit.
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'data', 'bible.db');
const DEST = path.join(__dirname, '..', 'public', 'data', 'bible.db');

if (!fs.existsSync(SRC)) {
  console.error(`No database at ${SRC} — run "npm run setup" first.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.copyFileSync(SRC, DEST);
console.log(`Copied ${SRC} -> ${DEST} (${(fs.statSync(DEST).size / 1024 / 1024).toFixed(1)} MB)`);
