// Importer for the midvash/bible-data source shape: one JSON file per book,
// no book-list file — each file names itself via `englishName`, which matches
// our canonical books.name exactly. Used for the Greek Textus Receptus (NT)
// and Hebrew Westminster Leningrad Codex (OT) sources.
//
// Usage:
//   node scripts/import-midvash.js --code TR --name "Textus Receptus (1550/1894)" \
//     --dir data/sources/tr --language grc --year 1894 --publicDomain true
const fs = require('node:fs');
const path = require('node:path');
const { runImport, parseArgs } = require('./lib/import-core');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { code, name, dir } = args;
  if (!code || !name || !dir) {
    console.error('Required: --code <CODE> --name "<Full Name>" --dir <path/to/source>');
    process.exit(1);
  }
  const sourceDir = path.resolve(dir);
  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.json'));

  const bookEntries = files.map((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(sourceDir, f), 'utf8'));
    return {
      name: data.englishName,
      chapters: data.chapters.map((ch) => ({
        chapter: ch.chapter,
        verses: ch.verses.map((v) => ({ verse: v.number, text: v.text })),
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
