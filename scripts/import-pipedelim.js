// Importer for the flat pipe-delimited source shape (as mirrored by, e.g.,
// github.com/EtkAppsAdmin/Bibles-1, derived from biblesuperseach.com's Bible
// module dumps): a single file, one verse per line —
//   NNS||chapter||verse||text
// where NN is the canonical 1-66 book ordinal (01-39 = OT, 40-66 = NT) and S
// is a redundant O/N testament suffix. Used for the Van Dyck Arabic Bible.
//
// Usage:
//   node scripts/import-pipedelim.js --code AVD --name "Van Dyck (Arabic)" \
//     --file data/sources/vandyck-ar/vandyck.txt --language ar --year 1865 --publicDomain true
const fs = require('node:fs');
const { runImport, parseArgs } = require('./lib/import-core');
const CANONICAL_BOOKS = require('./books-meta');

const LINE_RE = /^(\d{2})[A-Z]\|\|(\d+)\|\|(\d+)\|\|(.*)$/;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { code, name, file } = args;
  if (!code || !name || !file) {
    console.error('Required: --code <CODE> --name "<Full Name>" --file <path/to/source.txt>');
    process.exit(1);
  }

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const booksByOrdinal = new Map(); // ordinal -> { name, chapters: Map<chapter, verses[]> }

  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(LINE_RE);
    if (!m) throw new Error(`Unrecognized line format: ${line.slice(0, 60)}`);
    const [, ordinalStr, chapterStr, verseStr, text] = m;
    const ordinal = Number(ordinalStr);
    const book = CANONICAL_BOOKS[ordinal - 1];
    if (!book) throw new Error(`Ordinal ${ordinal} out of range (line: ${line.slice(0, 60)})`);

    if (!booksByOrdinal.has(ordinal)) booksByOrdinal.set(ordinal, { name: book.name, chapters: new Map() });
    const entry = booksByOrdinal.get(ordinal);
    const chapterNum = Number(chapterStr);
    if (!entry.chapters.has(chapterNum)) entry.chapters.set(chapterNum, []);
    entry.chapters.get(chapterNum).push({ verse: Number(verseStr), text: text.trim() });
  }

  const bookEntries = [...booksByOrdinal.values()].map((entry) => ({
    name: entry.name,
    chapters: [...entry.chapters.entries()].map(([chapter, verses]) => ({ chapter, verses })),
  }));

  runImport({
    code, name,
    language: args.language || 'en',
    year: args.year ? Number(args.year) : null,
    isPublicDomain: args.publicDomain !== 'false',
    sourceNote: args.sourceNote,
  }, bookEntries);
}

main();
