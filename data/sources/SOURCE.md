# Bible text sources

Every text vendored here is public domain or carries an explicit free-redistribution
license — see each entry below — with one clearly-flagged exception (`peshitta-ot/`,
which is noncommercial-only). Modern in-copyright translations (NIV, ESV, NKJV, NASB,
etc.) are intentionally excluded; hosting their full text isn't something this project
does, regardless of where a copy might turn up online.

## kjv/ — King James Version (English, 1769)
Public domain in the United States. Sourced from
https://github.com/aruljohn/Bible-kjv (per-book JSON, 66 files + Books.json listing
canonical book order). 31,102 verses. Import shape: `scripts/import-translation.js`.

Note: the KJV text is subject to Crown copyright / letters patent restrictions on
commercial printing within the United Kingdom, but is otherwise freely usable.

## tr/ — Textus Receptus (Greek New Testament, Stephanus 1550 / Scrivener 1894)
Public domain. Sourced from https://github.com/midvash/bible-data
(`versions/gr/tr/books/`), 27 NT books, 7,957 verses. Import shape:
`scripts/import-midvash.js`.

## wlc/ — Westminster Leningrad Codex (Hebrew Old Testament, Masoretic Text)
Free-distribution license (see https://tanach.us/Pages/Tanach.xml#License), attributed
to the Westminster Hebrew Institute. Sourced from https://github.com/midvash/bible-data
(`versions/he/wlc/books/`), 39 OT books, 23,318 verses. Import shape:
`scripts/import-midvash.js`.

## lxx-en/ — Septuagint, Brenton's English translation (1851)
Public domain (Sir Lancelot C. L. Brenton, 1851). Sourced as USFM from eBible.org
(https://eBible.org/Scriptures/eng-Brenton_usfm.zip). Only the 39 protocanonical OT
books are imported, mapped onto the app's existing 66-book canon — Esther and Daniel
follow standard (Hebrew-aligned) versification, so the distinct Greek-only additions to
those two books aren't captured; Psalms keeps the LXX's extra Psalm 151. The fuller LXX
(full Apocrypha/Deuterocanon as separate books — Tobit, Judith, Wisdom, Sirach, Baruch,
1–4 Maccabees, etc.) isn't supported since the schema's `books` table is fixed to the
66-book Protestant canon; that would need a schema change to support non-canonical
books. Import shape: `scripts/import-usfm.js` + `scripts/lib/usfm.js`.

## lxx-gr/ — Septuagint, Greek (Swete edition, 1887–1930)
The underlying text — H. B. Swete's "The Old Testament in Greek according to the
Septuagint" — is public domain (Swete died in 1917). The specific word-level
transcription used here is via the Open Greek and Latin Project / First1KGreek,
https://github.com/nathans/lxx-swete, licensed CC BY-SA 4.0 (attribution + share-alike).
36 of the 39 protocanonical OT books are imported: Ezra and Nehemiah are combined as a
single "Esdras B" book in the LXX tradition with no clean verse-level split available in
this source, and Ecclesiastes isn't present in this particular transcription — both are
skipped rather than guessed at. Daniel uses the Theodotion recension (the version
Brenton's English LXX also follows). 22,045 verses. Import shape: `scripts/import-swete.js`
+ `scripts/lib/swete.js` (reconstructs verse text from the source's one-Greek-word-per-line
format).

## peshitta/ — Peshitta (Syriac New Testament)
Public domain critical edition, British and Foreign Bible Society (1905/1920). Genuine
Syriac-script text (not a translation into another language). Sourced from
https://github.com/scrollmapper/bible_databases
(`sources/syr/Peshitta/Peshitta.json`, whole-Bible file — only the 27 NT books have
text in this particular dataset; the OT entries are empty placeholders and are skipped).
7,956 verses. Vendored here converted into the standard per-book shape so it imports via
`scripts/import-translation.js`.

## coptic-sahidic/ — Coptic New Testament (Sahidic dialect)
The underlying translation is ancient (3rd–4th century). This particular digital
transcription — via https://github.com/scrollmapper/bible_databases
(`sources/cop-sa/CopSahBible2/CopSahBible2.json`) — is licensed CC BY-SA (attribution +
share-alike). The source file also contains a wide, very fragmentary spread of Old
Testament and deuterocanonical books (Sahidic manuscript survival is patchy — some
books are 0% preserved in this dataset, others partial); only the New Testament, which
is 98–100% complete per book here, is imported. 7,933 verses across the 27 NT books.
Vendored converted into the standard per-book shape so it imports via
`scripts/import-translation.js`.

## peshitta-ot/ — Peshitta Old Testament ⚠️ noncommercial use only
Genuine Syriac-script text, all 39 protocanonical OT books, 23,076 verses. Sourced from
https://github.com/ETCBC/peshitta (`plain/0.2/`), the *Vetus Testamentum Syriace*
critical edition (Peshitta Institute Amsterdam, published by Brill) for the books that
have appeared in that series, and the Codex Ambrosianus manuscript for the rest.

**Unlike every other source in this file, this one is licensed CC BY-NC** —
noncommercial use only, per the source repo's docs/about.md. The Peshitta Institute
Amsterdam and Brill Publishers hold rights over the underlying critical edition (Brill
separately sells the full apparatus as "Brill Peshitta Online"); this repo distributes
only the plain text under CC BY-NC. Fine for a personal, non-monetized app — but if this
project is ever distributed commercially or with ads, this translation needs to come out
first, or separate permission needs to be obtained from the Peshitta Institute/Brill.
Import shape: `scripts/import-translation.js`, converted from the source's
`Chapter N` / `verse text` plain-text format via `scripts/lib/peshitta-plain.js`.

## vandyck-ar/ — Van Dyck (Arabic, 1865)
Public domain (Eli Smith and Cornelius Van Dyck; NT completed 1860, OT 1865, American
Bible Society). Sourced from https://github.com/EtkAppsAdmin/Bibles-1
(`Arabic__Smith_and_Van_Dyke__arabicsv__RTL.txt`), full 66-book canon, 31,102 verses.
Flat pipe-delimited format (`NNS||chapter||verse||text`, NN = canonical 1-66 book
ordinal, S = redundant O/N testament letter). Import shape: `scripts/import-pipedelim.js`.

## Adding another translation

Four import scripts cover the source shapes seen so far — pick whichever matches:

**`scripts/import-translation.js`** — one JSON file per book, optional `Books.json`
listing them in order:
```json
{ "book": "Genesis", "chapters": [{ "chapter": "1", "verses": [{ "verse": "1", "text": "..." }] }] }
```
```
node scripts/import-translation.js --code ASV --name "American Standard Version" --dir data/sources/asv --year 1901 --publicDomain true
```

**`scripts/import-midvash.js`** — one JSON file per book, no book-list file; each file
names its own book via an `englishName` field matching `books.name` exactly:
```json
{ "englishName": "Genesis", "chapters": [{ "chapter": 1, "verses": [{ "number": 1, "text": "..." }] }] }
```
```
node scripts/import-midvash.js --code WEB --name "World English Bible" --dir data/sources/web --language en --publicDomain true
```

**`scripts/import-usfm.js`** — one `<CODE>.usfm` file per book, named by the standard
3-letter USFM book code (`GEN`, `1SA`, `MAT`, ...; see `scripts/lib/usfm-books.js`):
```
node scripts/import-usfm.js --code YLT --name "Young's Literal Translation" --dir data/sources/ylt --year 1898 --publicDomain true
```

**`scripts/import-pipedelim.js`** — a single flat file, one verse per line,
`NNS||chapter||verse||text` (NN = canonical 1-66 book ordinal, S = a redundant O/N
testament letter) — the shape used by biblesuperseach.com-derived dumps mirrored across
several GitHub repos:
```
node scripts/import-pipedelim.js --code AVD --name "Van Dyck (Arabic)" --file data/sources/vandyck-ar/vandyck.txt --language ar --year 1865 --publicDomain true
```

Any importer accepts `--language <code>` (BCP-47-ish: `en`, `grc`, `hbo`, ...) — the
frontend uses it to pick a serif fallback stack and right-to-left rendering.

A translation doesn't need to cover the whole 66-book canon (the Greek NT and Hebrew OT
above only cover half each) — a tab switching to a translation that doesn't have the
current book jumps to the nearest book that translation does cover.

A fifth script, `scripts/import-swete.js` + `scripts/lib/swete.js`, handles the
one-word-per-line format used by the Swete Greek LXX transcription specifically — only
worth reaching for if you find another source shaped the same way.

Only import translations you have the legal right to redistribute/use locally — the
KJV, ASV, WEB, YLT, Douay-Rheims, Textus Receptus, WLC, both Septuagint sources, the
Peshitta NT, and the Van Dyck Arabic here are public domain or free-distribution;
NIV/ESV/NKJV/NASB are not. The Peshitta OT is the one exception — CC BY-NC,
noncommercial use only (see above).
