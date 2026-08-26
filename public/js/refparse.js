// Bible reference parser: turns "jn 3:16", "1 cor 13", "ps23", "song of sol 2"
// into { book, chapter, verse }. Returns null when the input isn't reference-shaped.
const RefParse = (() => {
  // Common abbreviations that aren't simple prefixes of the book name.
  const ALIASES = {
    gn: 'Genesis', ex: 'Exodus', lv: 'Leviticus', nm: 'Numbers', nu: 'Numbers',
    dt: 'Deuteronomy', jsh: 'Joshua', jos: 'Joshua', jdg: 'Judges', jgs: 'Judges',
    rt: 'Ruth', '1sa': '1 Samuel', '2sa': '2 Samuel', '1kg': '1 Kings', '2kg': '2 Kings',
    '1ki': '1 Kings', '2ki': '2 Kings', '1ch': '1 Chronicles', '2ch': '2 Chronicles',
    ezr: 'Ezra', neh: 'Nehemiah', est: 'Esther', jb: 'Job',
    ps: 'Psalms', psa: 'Psalms', psalm: 'Psalms', pr: 'Proverbs', prv: 'Proverbs',
    ec: 'Ecclesiastes', ecc: 'Ecclesiastes', ss: 'Song of Solomon', sos: 'Song of Solomon',
    song: 'Song of Solomon', isa: 'Isaiah', jer: 'Jeremiah', lam: 'Lamentations',
    eze: 'Ezekiel', ezk: 'Ezekiel', dn: 'Daniel', dan: 'Daniel', hos: 'Hosea',
    jl: 'Joel', am: 'Amos', ob: 'Obadiah', jon: 'Jonah', mic: 'Micah', nah: 'Nahum',
    hab: 'Habakkuk', zep: 'Zephaniah', zph: 'Zephaniah', hag: 'Haggai',
    zec: 'Zechariah', zch: 'Zechariah', mal: 'Malachi',
    mt: 'Matthew', mk: 'Mark', mrk: 'Mark', lk: 'Luke', jn: 'John', jhn: 'John',
    ac: 'Acts', ro: 'Romans', rom: 'Romans', '1co': '1 Corinthians', '2co': '2 Corinthians',
    ga: 'Galatians', gal: 'Galatians', eph: 'Ephesians', php: 'Philippians',
    col: 'Colossians', '1th': '1 Thessalonians', '2th': '2 Thessalonians',
    '1ti': '1 Timothy', '2ti': '2 Timothy', tit: 'Titus', phm: 'Philemon',
    heb: 'Hebrews', jas: 'James', jam: 'James', '1pe': '1 Peter', '2pe': '2 Peter',
    '1jn': '1 John', '2jn': '2 John', '3jn': '3 John', jud: 'Jude',
    re: 'Revelation', rev: 'Revelation',
  };

  const norm = (s) => s.toLowerCase().replace(/[\s.]+/g, '');

  // All books whose name/abbrev/alias matches the (normalized) name fragment.
  function matchBooks(nameFrag) {
    const n = norm(nameFrag);
    if (!n) return [];
    const alias = ALIASES[n];
    if (alias) {
      const b = State.books.find((bk) => bk.name === alias);
      if (b) return [b];
    }
    const exact = State.books.filter((b) => norm(b.name) === n || norm(b.abbrev) === n);
    if (exact.length) return exact;
    return State.books.filter((b) => norm(b.name).startsWith(n) || norm(b.abbrev).startsWith(n));
  }

  // Full parse. Accepts "book", "book 3", "book 3:16", "book 3.16", "ps23".
  function parse(input) {
    const m = input.trim().match(/^([1-3]?\s*[a-z][a-z\s.]*?)\s*(?:(\d+)\s*(?:[:.]\s*(\d+))?)?$/i);
    if (!m) return null;
    const books = matchBooks(m[1]);
    if (books.length === 0) return null;
    const book = books[0];
    let chapter = m[2] ? Number(m[2]) : null;
    let verse = m[3] ? Number(m[3]) : null;
    if (chapter !== null && chapter > book.chapters) return { book, chapter: null, verse: null, candidates: books };
    return { book, chapter, verse, candidates: books };
  }

  function format(ref) {
    let s = ref.book.name;
    if (ref.chapter) s += ' ' + ref.chapter;
    if (ref.verse) s += ':' + ref.verse;
    return s;
  }

  return { parse, matchBooks, format };
})();
