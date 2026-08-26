// Importer for plain USFM sources: one <CODE>.usfm file per book, where
// <CODE> is the standard 3-letter USFM book code (GEN, 1SA, MAT, ...).
// Used for the Brenton English Septuagint.
//
// Usage:
//   node scripts/import-usfm.js --code LXXE --name "Septuagint (Brenton, 1851)" \
//     --dir data/sources/lxx-en --language en --year 1851 --publicDomain true
const fs = require('node:fs');
const path = require('node:path');
const { runImport, parseArgs } = require('./lib/import-core');
const { parseUsfm } = require('./lib/usfm');
const CODE_TO_NAME = require('./lib/usfm-books');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { code, name, dir } = args;
  if (!code || !name || !dir) {
    console.error('Required: --code <CODE> --name "<Full Name>" --dir <path/to/source>');
    process.exit(1);
  }
  const sourceDir = path.resolve(dir);
  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.usfm'));

  const bookEntries = [];
  for (const f of files) {
    const usfmCode = f.replace(/\.usfm$/i, '').toUpperCase();
    const bookName = CODE_TO_NAME[usfmCode];
    if (!bookName) {
      console.warn(`Skipping ${f}: unrecognized USFM code "${usfmCode}"`);
      continue;
    }
    const raw = fs.readFileSync(path.join(sourceDir, f), 'utf8');
    bookEntries.push({ name: bookName, chapters: parseUsfm(raw) });
  }

  runImport({
    code, name,
    language: args.language || 'en',
    year: args.year ? Number(args.year) : null,
    isPublicDomain: args.publicDomain !== 'false',
    sourceNote: args.sourceNote,
  }, bookEntries);
}

main();
