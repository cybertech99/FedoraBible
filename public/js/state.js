// Font choices offered per tab. `id` is what's persisted (tabs.font_family);
// `stack` is the actual CSS font-family value applied to that pane's verses.
const FONT_FAMILIES = [
  { id: 'serif-literata', label: 'Literata', stack: "'Literata', Georgia, serif" },
  { id: 'serif-georgia', label: 'Georgia', stack: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif" },
  { id: 'serif-palatino', label: 'Palatino', stack: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { id: 'serif-times', label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { id: 'serif-garamond', label: 'Garamond', stack: "Garamond, 'Apple Garamond', 'EB Garamond', serif" },
  { id: 'sans-system', label: 'Sans-serif', stack: "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: 'mono', label: 'Monospace', stack: "Consolas, 'SFMono-Regular', Menlo, monospace" },
];
const FONT_SIZES = [14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 32];

function fontStackFor(id) {
  return (FONT_FAMILIES.find((f) => f.id === id) || FONT_FAMILIES[0]).stack;
}

// Original-language texts need a font that actually covers their script, so
// the user's general (Latin) typeface choice is replaced by one of these
// instead — Syriac has two real choices since it's written in genuinely
// distinct traditional styles (Estrangela vs. the more cursive, Arabic-like
// Serto), the others just have the one appropriate face.
const SCRIPT_FONT_CHOICES = {
  grc: [{ id: 'greek-gentium', label: 'Gentium Plus', stack: "'Gentium Plus', 'Noto Serif', Georgia, serif" }],
  hbo: [{ id: 'hebrew-noto', label: 'Noto Serif Hebrew', stack: "'Noto Serif Hebrew', 'Times New Roman', serif" }],
  he: [{ id: 'hebrew-noto', label: 'Noto Serif Hebrew', stack: "'Noto Serif Hebrew', 'Times New Roman', serif" }],
  cop: [{ id: 'coptic-noto', label: 'Noto Sans Coptic', stack: "'Noto Sans Coptic', 'Noto Serif', serif" }],
  ar: [{ id: 'arabic-naskh', label: 'Noto Naskh Arabic', stack: "'Noto Naskh Arabic', 'Noto Serif', serif" }],
  syr: [
    { id: 'syriac-estrangela', label: 'Estrangela', stack: "'Noto Sans Syriac', 'Noto Serif', serif" },
    { id: 'syriac-serto', label: 'Serto (cursive, Arabic-like)', stack: "'Noto Sans Syriac Western', 'Noto Sans Syriac', 'Noto Serif', serif" },
  ],
};
const RTL_LANGUAGES = new Set(['hbo', 'he', 'ar', 'syr']);

// The font choices to offer for a given translation language — the general
// Latin family list for English, or that script's own options otherwise.
function fontChoicesFor(language) {
  return SCRIPT_FONT_CHOICES[language] || FONT_FAMILIES;
}

function scriptFontStackFor(language, id) {
  const choices = SCRIPT_FONT_CHOICES[language];
  if (!choices) return null;
  return (choices.find((f) => f.id === id) || choices[0]).stack;
}

function languageOf(translationCode) {
  const t = State.translations.find((tr) => tr.code === translationCode);
  return t ? t.language : 'en';
}

// Shared in-memory app state.
const State = {
  translations: [],
  books: [],
  tabs: [], // rows + { el, paneEl, chapterData }
  activeTabId: null,

  bookById(id) {
    return this.books.find((b) => b.id === Number(id));
  },
  tabById(id) {
    return this.tabs.find((t) => t.id === Number(id));
  },
  activeTab() {
    return this.tabById(this.activeTabId) || this.tabs[0] || null;
  },
};
