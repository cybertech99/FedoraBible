# FedoraBible

A local, full-featured Bible reader. Node.js + Express + SQLite (built-in `node:sqlite`,
FTS5 search) on the backend, no-build vanilla JS frontend.

## Setup

```
npm install
npm run setup     # creates data/bible.db and imports all eight translations below
npm start         # http://localhost:3000
```

`npm run dev` runs the server with `--watch` for auto-restart on changes.
`data/bible.db` is fully regenerable — if it's ever missing or wiped, just re-run
`npm run setup` (your highlights/notes live in it though, so export first if they matter).

## Features

- **Multi-tab parallel reading** — tabs open as side-by-side panes with equal auto-sizing;
  drag a pane's right edge to resize. Each tab keeps its own translation, typeface,
  size, and layout.
- **Linked tabs** — hit the link icon on two or more panes and they turn pages together
  (each keeping its own translation): parallel reading that stays in sync.
- **Command palette** (`Ctrl+K`) — type `jn 3:16`, `ps 23`, `1 cor 13`… and jump straight
  there; `Ctrl+Enter` opens the reference in a new tab. Anything else hands off to search.
- **Full-text search** — FTS5 with `*` prefix wildcards (`love*` matches love/loved/loving),
  testament/translation filters, and reference detection (`ps 23` shows a Go-to row).
- **Highlights, notes & bookmarks** — click any verse: five highlight colors, a note,
  copy-with-reference, and save (bookmark). Chapters can be bookmarked from the toolbar
  and annotated with chapter-level notes. All keyed by reference, independent of
  translation. The popup toolbar toggle (`h`) switches verse clicks to a quick
  yellow-highlight toggle instead — no popup — for fast marking while reading.
- **Study drawer** (`b`) — Search / Marks / Notes / Saved / Journey panels; every entry
  jumps to its passage. **Export study notes** writes everything to Markdown.
- **Journey** — reading progress tracked automatically per chapter, with whole-Bible,
  OT/NT, and per-book progress bars.
- **Three themes** (`d`) — Parchment, Manuscript (sepia), and Ink (dark).
- **Per-tab typography** — Literata/Georgia/Palatino/Times/Garamond/sans/mono, 14–32px,
  and verse-per-line vs. flowing paragraph layout (`p`).
- **Single / dual column layout** (`c`) — newspaper-style columns for wide panes (a
  tablet in landscape, a wide desktop pane); each tab remembers its own choice. Dual
  column reads as a paginated e-book: `← →`, the mouse wheel, or tapping the left/right
  edge turns the page, and paging past a chapter's last page moves to the next chapter.
  Falls back to a single column automatically if the pane's too narrow for two to be
  readable, even with dual selected.
- **Original languages** — Greek New Testament (Textus Receptus), Hebrew Old Testament
  (Westminster Leningrad Codex), the Septuagint in both Greek (Swete) and Brenton's
  English translation, the Syriac Peshitta New Testament, and the Sahidic Coptic New
  Testament — plus the Van Dyck Arabic translation. Hebrew, Syriac, and Arabic render
  right-to-left automatically with a script-appropriate typeface; Greek and Coptic each
  get their own script-capable one. The book selector only ever lists books a
  translation actually has, and a translation that only covers half the canon (a New
  Testament-only or Old Testament-only text) snaps a tab to the nearest chapter it does
  cover instead of erroring when you switch into it from unsupported territory.
- **Keyboard-first** — press `?` for the shortcut map.

## Offline on your phone (PWA)

FedoraBible is also a Progressive Web App — install it to a phone's home screen and
it runs fully offline afterward, no Node/Express required on the device. The same
frontend runs against an in-browser SQLite database (WASM + OPFS, via
`@sqlite.org/sqlite-wasm`) instead of the REST API whenever it can't reach a server,
so nothing about the desktop app changes.

To get it onto a phone, visit this server's address from the phone once (same WiFi as
your computer, or deploy the `public/` folder — it's a plain static site once seeded —
to a free static host like GitHub Pages/Cloudflare Pages for access from anywhere),
then "Add to Home Screen." That first visit downloads the ~55MB Bible database once;
every visit after that, including fully offline ones, uses the copy it saved on the
device — highlights, notes, and bookmarks included.

Two platform gotchas worth knowing before you're debugging a blank screen:

- **HTTPS is required** — a service worker (what makes offline work at all) won't
  register over plain `http://` unless the address is `localhost`, which a phone can
  never reach on someone else's computer. A LAN address like `http://192.168.1.20:3000`
  will not work as-is. Chrome has a dev-only escape hatch for testing
  (`chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add the address, enable,
  relaunch) but **Safari has no equivalent** — iOS needs a real HTTPS URL, e.g. via a
  free tunnel (`cloudflared tunnel --url http://localhost:3000`) or a static host.
- **On iOS, the home-screen icon needs its own online launch** — opening the address in
  a regular Safari tab (even offline afterward) does not seed the standalone app; iOS
  registers the service worker separately for the home-screen shortcut. After adding to
  the home screen, open it from the *icon* at least once while still online before
  testing airplane mode.

`npm run setup` already includes the `pwa:seed` step that copies `data/bible.db` into
`public/data/bible.db` for this. If you re-run `npm run setup` later (new translation,
rebuilt database), that copy refreshes too — a phone that already installed the PWA
keeps using its own saved copy until it clears site data, since the seed is only ever
fetched once per install.

## Included translations

| Code | Text | Language | Notes |
|---|---|---|---|
| KJV | King James Version (1769) | English | Full 66-book canon |
| TR | Textus Receptus (Stephanus 1550 / Scrivener 1894) | Greek | New Testament only (27 books) |
| WLC | Westminster Leningrad Codex | Hebrew | Old Testament only (39 books), renders right-to-left |
| LXXE | Septuagint, Brenton's English translation (1851) | English | 39 protocanonical OT books; Esther/Daniel follow standard versification (Greek-only additions not captured), Psalms keeps the LXX's extra Psalm 151 |
| LXXG | Septuagint, Greek (Swete edition, 1887–1930) | Greek | 36 of 39 protocanonical OT books (Ezra/Nehemiah and Ecclesiastes not available in this source); Daniel follows the Theodotion recension |
| PESH | Peshitta (Syriac New Testament, BFBS 1905/1920) | Syriac | New Testament only (27 books), renders right-to-left |
| COPS | Coptic New Testament (Sahidic dialect) | Coptic | New Testament only (27 books) |
| PESHOT | Peshitta Old Testament | Syriac | Full 39-book OT, renders right-to-left. ⚠️ **CC BY-NC — noncommercial use only** (see `data/sources/SOURCE.md`), unlike every other translation here |
| AVD | Van Dyck (1865) | Arabic | Full 66-book canon, renders right-to-left |

## Adding another translation

See `data/sources/SOURCE.md` for full details — four import scripts cover the source
shapes seen so far (`import-translation.js` for KJV-style per-book JSON,
`import-midvash.js` for the midvash/bible-data shape, `import-usfm.js` for plain USFM,
`import-swete.js` for the Swete Greek LXX's word-per-line format). For the common case:

```
node scripts/import-translation.js --code ASV --name "American Standard Version" \
  --dir data/sources/asv --year 1901 --publicDomain true
```

The new translation immediately appears in every tab's translation dropdown. Only
import translations you have the legal right to use — the KJV, ASV, WEB, YLT,
Douay-Rheims, Textus Receptus, WLC, both Septuagint sources, and the Peshitta NT here
are public domain or carry a free-redistribution license; NIV/ESV/NKJV/NASB are not. The
Peshitta OT is noncommercial-use-only (CC BY-NC) — see the table above.

## Data model

- `translations` / `books` / `verses` — Bible text, one row per (translation, book,
  chapter, verse). `verses_fts` is an FTS5 index over verse text.
- `tabs` — persisted open tabs (reference, translation, font, layout, link state).
- `highlights` / `notes` / `bookmarks` — keyed by (book, chapter, verse); verse 0 means
  chapter-level.
- `read_chapters` — reading progress, one row per chapter opened.
