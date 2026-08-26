// Importer for the nathans/lxx-swete word-per-line format (Swete's Septuagint,
// 1887-1930 edition — Old Testament in Greek). Files are named
// "<index>.<LatinName>.txt"; this script maps the Latin/Vulgate-style names
// to our canonical books.name, including the LXX's different OT book
// grouping (e.g. "Regnorum I-IV" = 1-2 Samuel + 1-2 Kings).
//
// Usage:
//   node scripts/import-swete.js --code LXXG --name "Septuagint (Swete, Greek)" \
//     --dir data/sources/lxx-gr --language grc --year 1930 --publicDomain true
const fs = require('node:fs');
const path = require('node:path');
const { runImport, parseArgs } = require('./lib/import-core');
const { parseSwete } = require('./lib/swete');

// Latin filename stem (without the leading "NN.") -> canonical books.name.
// Ezra, Nehemiah (combined as one "Esdras B" book in the LXX, no clean verse
// split available) and Ecclesiastes (not present in this source) are omitted.
const NAME_MAP = {
  Genesis: 'Genesis', Exodus: 'Exodus', Leviticus: 'Leviticus', Numeri: 'Numbers',
  Deuteronomium: 'Deuteronomy', Josue: 'Joshua', Judices: 'Judges', Ruth: 'Ruth',
  Regnorum_I: '1 Samuel', Regnorum_II: '2 Samuel', Regnorum_III: '1 Kings', Regnorum_IV: '2 Kings',
  Paralipomenon_I: '1 Chronicles', Paralipomenon_II: '2 Chronicles',
  Esther: 'Esther', Job: 'Job', Psalmi: 'Psalms', Proverbia: 'Proverbs', Canticum: 'Song of Solomon',
  Isaias: 'Isaiah', Jeremias: 'Jeremiah', Threni_seu_Lamentationes: 'Lamentations', Ezechiel: 'Ezekiel',
  Daniel_Theodotionis_versio: 'Daniel',
  Osee: 'Hosea', Joel: 'Joel', Amos: 'Amos', Abdias: 'Obadiah', Jonas: 'Jonah', Michaeas: 'Micah',
  Nahum: 'Nahum', Habacuc: 'Habakkuk', Sophonias: 'Zephaniah', Aggaeus: 'Haggai',
  Zacharias: 'Zechariah', Malachias: 'Malachi',
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { code, name, dir } = args;
  if (!code || !name || !dir) {
    console.error('Required: --code <CODE> --name "<Full Name>" --dir <path/to/source>');
    process.exit(1);
  }
  const sourceDir = path.resolve(dir);
  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.txt'));

  const bookEntries = [];
  for (const f of files) {
    const stem = f.replace(/^\d+\./, '').replace(/\.txt$/i, '');
    const bookName = NAME_MAP[stem];
    if (!bookName) {
      console.warn(`Skipping ${f}: no canonical book mapping for "${stem}"`);
      continue;
    }
    const raw = fs.readFileSync(path.join(sourceDir, f), 'utf8');
    bookEntries.push({ name: bookName, chapters: parseSwete(raw) });
  }

  runImport({
    code, name,
    language: args.language || 'grc',
    year: args.year ? Number(args.year) : null,
    isPublicDomain: args.publicDomain !== 'false',
    sourceNote: args.sourceNote,
  }, bookEntries);
}

main();
