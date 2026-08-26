// Importer for the aruljohn/Bible-kjv-shaped source layout: one JSON file per
// book, an optional Books.json listing them in canonical order.
//
// Usage:
//   node scripts/import-translation.js --code KJV --name "King James Version" \
//     --dir data/sources/kjv --year 1769 --publicDomain true
//
// Expected folder shape (see data/sources/SOURCE.md):
//   <dir>/Books.json           optional; falls back to the canonical 66-name list
//   <dir>/<BookNameNoSpaces>.json  { book, chapters: [{ chapter, verses: [{ verse, text }] }] }
const fs = require('node:fs');
const path = require('node:path');
const { runImport, parseArgs } = require('./lib/import-core');
const CANONICAL_BOOKS = require('./books-meta');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { code, name, dir } = args;
  if (!code || !name || !dir) {
    console.error('Required: --code <CODE> --name "<Full Name>" --dir <path/to/source>');
    process.exit(1);
  }
  const sourceDir = path.resolve(dir);

  const booksListPath = path.join(sourceDir, 'Books.json');
  const bookNames = fs.existsSync(booksListPath)
    ? JSON.parse(fs.readFileSync(booksListPath, 'utf8'))
    : CANONICAL_BOOKS.map((b) => b.name);

  const bookEntries = bookNames.map((bookName) => {
    const filePath = path.join(sourceDir, bookName.replace(/\s+/g, '') + '.json');
    const bookData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      name: bookName,
      chapters: bookData.chapters.map((ch) => ({
        chapter: ch.chapter,
        verses: ch.verses.map((v) => ({ verse: v.verse, text: v.text })),
      })),
    };
  });

  runImport({
    code, name,
    language: args.language || 'en',
    year: args.year ? Number(args.year) : null,
    isPublicDomain: args.publicDomain !== 'false',
    sourceNote: args.sourceNote,
  }, bookEntries);
}

main();
