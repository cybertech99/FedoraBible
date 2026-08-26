// "About this translation" overlay — details for a single translation code.
const TranslationInfo = (() => {
  const overlay = document.getElementById('translation-info');
  const body = document.getElementById('ti-body');

  const LANGUAGE_NAMES = { en: 'English', grc: 'Greek', hbo: 'Hebrew', he: 'Hebrew', syr: 'Syriac', cop: 'Coptic' };
  function languageName(code) {
    return LANGUAGE_NAMES[code] || code;
  }

  // Describes which part of the canon a translation spans, and flags gaps
  // within that span (e.g. the Greek LXX is OT-range but missing 3 books).
  function coverageText(t) {
    const total = t.book_ids.length;
    if (total === 66) return 'Full 66-book canon (66 books)';
    const spanLabel = t.min_ordinal === 1 && t.max_ordinal === 39
      ? 'Old Testament'
      : t.min_ordinal === 40 && t.max_ordinal === 66
        ? 'New Testament'
        : null;
    const spanSize = t.max_ordinal - t.min_ordinal + 1;
    const gapNote = total < spanSize ? ` (${spanSize - total} not included)` : '';
    return spanLabel
      ? `${spanLabel} — ${total} of ${spanSize} books${gapNote}`
      : `${total} of 66 books${gapNote}`;
  }

  function render(code) {
    const t = State.translations.find((tr) => tr.code === code);
    if (!t) return;

    body.innerHTML = `
      <div class="ti-badge">${t.code}</div>
      <h2>${t.name}</h2>
      <p class="ti-row"><span class="ti-k">Language</span><span class="ti-v">${languageName(t.language)}</span></p>
      ${t.year ? `<p class="ti-row"><span class="ti-k">Published</span><span class="ti-v">${t.year}</span></p>` : ''}
      <p class="ti-row"><span class="ti-k">Coverage</span><span class="ti-v">${coverageText(t)}</span></p>
      <p class="ti-row"><span class="ti-k">License</span><span class="ti-v">${t.is_public_domain ? 'Public domain / free redistribution' : 'Licensed'}</span></p>
      ${t.source_note ? `<p class="ti-note">${t.source_note}</p>` : ''}
    `;
  }

  function open(code) {
    render(code);
    overlay.classList.remove('hidden');
  }
  function close() {
    overlay.classList.add('hidden');
  }
  function isOpen() {
    return !overlay.classList.contains('hidden');
  }

  document.getElementById('ti-close').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  return { open, close, isOpen };
})();
