const Reader = (() => {
  function fillSelects(tab) {
    const bookSel = tab.paneEl.querySelector('.pane-book');
    const chapterSel = tab.paneEl.querySelector('.pane-chapter');
    const transSel = tab.paneEl.querySelector('.pane-translation');

    // Only offer books this translation actually has (a Greek NT or Hebrew OT
    // text shouldn't list books it doesn't cover).
    const trans = State.translations.find((t) => t.code === tab.translation_code);
    const bookIds = trans && trans.book_ids && trans.book_ids.length ? new Set(trans.book_ids) : null;
    const availableBooks = bookIds ? State.books.filter((b) => bookIds.has(b.id)) : State.books;
    bookSel.innerHTML = availableBooks
      .map((b) => `<option value="${b.id}">${b.name}</option>`)
      .join('');
    bookSel.value = tab.book_id;

    // Chapter count comes from this translation's actual coverage of the book
    // (from the last chapter load), not the canonical cross-translation max —
    // KJV Psalms has 150 chapters, the LXX has 151, etc.
    const chapterCount = (tab.chapterData && tab.chapterData.book.chapters) || State.bookById(tab.book_id).chapters;
    chapterSel.innerHTML = Array.from({ length: chapterCount }, (_, i) => i + 1)
      .map((n) => `<option value="${n}">${n}</option>`)
      .join('');
    chapterSel.value = tab.chapter;

    transSel.innerHTML = State.translations
      .map((t) => `<option value="${t.code}">${t.name}</option>`)
      .join('');
    transSel.value = tab.translation_code;

    const lang = languageOf(tab.translation_code);
    const familySel = tab.paneEl.querySelector('.font-family-select');
    const choices = fontChoicesFor(lang);
    familySel.innerHTML = choices
      .map((f) => `<option value="${f.id}">${f.label}</option>`)
      .join('');
    // Fall back to that script's default if the stored choice doesn't apply
    // here (e.g. an English tab's Latin family, switched to a Syriac text).
    familySel.value = choices.some((f) => f.id === tab.font_family) ? tab.font_family : choices[0].id;

    const sizeSel = tab.paneEl.querySelector('.font-size-select');
    sizeSel.innerHTML = FONT_SIZES
      .map((s) => `<option value="${s}">${s}px</option>`)
      .join('');
    sizeSel.value = tab.font_size;
  }

  function applyFont(tab) {
    const versesEl = tab.paneEl.querySelector('.verses');
    const lang = languageOf(tab.translation_code);
    versesEl.style.fontFamily = scriptFontStackFor(lang, tab.font_family) || fontStackFor(tab.font_family);
    versesEl.style.fontSize = tab.font_size + 'px';
    const rtl = RTL_LANGUAGES.has(lang);
    versesEl.dir = rtl ? 'rtl' : 'ltr';
    versesEl.classList.toggle('rtl-text', rtl);
  }

  function applyViewMode(tab) {
    const versesEl = tab.paneEl.querySelector('.verses');
    versesEl.classList.toggle('flow', tab.view_mode === 'flow');
    const menu = tab.paneEl.querySelector('.font-menu');
    menu.querySelector('.seg-verses').classList.toggle('on', tab.view_mode !== 'flow');
    menu.querySelector('.seg-flow').classList.toggle('on', tab.view_mode === 'flow');
  }

  // The `dual` class toggles here, but app.css does the real work on the
  // `.verses-inner` wrapper `load()` builds: a fixed height + column-fill:auto
  // makes content fill column 1 then column 2 per screen-width "page", with
  // any more overflowing sideways into further columns rather than growing
  // taller — `.verses` switches to horizontal scrolling to reveal those (see
  // turnPage, just below).
  function applyColumnMode(tab) {
    const versesEl = tab.paneEl.querySelector('.verses');
    versesEl.classList.toggle('dual', tab.column_mode === 'dual');
    const menu = tab.paneEl.querySelector('.font-menu');
    menu.querySelector('.seg-col-single').classList.toggle('on', tab.column_mode !== 'dual');
    menu.querySelector('.seg-col-dual').classList.toggle('on', tab.column_mode === 'dual');
    syncColumnLayout(tab);
  }

  // Leaving column-width to the browser's own column-count/column-width
  // negotiation (the CSS default) doesn't reliably split the two columns
  // evenly across engines — measured centered in Chrome, but not always
  // elsewhere. Computing an exact pixel width for each column removes that
  // ambiguity entirely: with both columns forced to identical widths that
  // together consume the full available space, there's no "extra" space
  // left for the layout engine to distribute unevenly, so the divider lands
  // exactly at the midpoint on any engine. Falls back to a single column
  // if the pane's too narrow for two to be comfortably readable.
  const COLUMN_GAP = 64;
  const MIN_COLUMN_WIDTH = 280;
  function syncColumnLayout(tab) {
    const inner = tab.paneEl.querySelector('.verses-inner');
    if (!inner) return;
    if (tab.column_mode !== 'dual') {
      // Clear any column-count/column-width this set earlier — leaving them
      // in place is exactly the bug: they're inline styles, so they keep
      // overriding the CSS (which stops applying once the `dual` class is
      // removed from `.verses`) even after switching back to single-column.
      inner.style.columnCount = '';
      inner.style.columnWidth = '';
      return;
    }
    const available = inner.clientWidth;
    const colWidth = Math.floor((available - COLUMN_GAP) / 2);
    if (colWidth < MIN_COLUMN_WIDTH) {
      inner.style.columnCount = '1';
      inner.style.columnWidth = 'auto';
    } else {
      inner.style.columnCount = '2';
      inner.style.columnWidth = colWidth + 'px';
    }
  }

  // Page-turn for dual-column mode: one "page" is exactly one .verses-wide
  // slice of the horizontally-paginated .verses-inner (see the CSS — fixed
  // height + column-fill:auto makes overflow continue in further columns to
  // the right instead of growing taller). Returns false at the first/last
  // page (or outside dual mode) so callers — arrow keys — can fall through
  // to prev/next chapter instead.
  function turnPage(tab, direction) {
    if (tab.column_mode !== 'dual') return false;
    const versesEl = tab.paneEl.querySelector('.verses');
    const atStart = versesEl.scrollLeft <= 1;
    const atEnd = versesEl.scrollLeft + versesEl.clientWidth >= versesEl.scrollWidth - 1;
    if (direction > 0 && atEnd) return false;
    if (direction < 0 && atStart) return false;
    versesEl.scrollBy({ left: direction * versesEl.clientWidth, behavior: 'smooth' });
    return true;
  }

  function updatePaneButtons(tab) {
    tab.paneEl.querySelector('.pane-link').classList.toggle('on', !!tab.linked);
    const bmBtn = tab.paneEl.querySelector('.pane-bookmark');
    bmBtn.classList.toggle('on', !!(tab.chapterData && tab.chapterData.chapterBookmark));
  }

  function renderBadges(verseEl, v) {
    const badges = verseEl.querySelector('.verse-badges');
    let html = '';
    if (v.note_id) html += '<span class="badge" title="Has a note">&#9998;</span>';
    if (v.bookmark_id) html += '<span class="badge" title="Saved">&#9670;</span>';
    badges.innerHTML = html;
    verseEl.classList.toggle('has-note', !!v.note_id);
    verseEl.classList.toggle('has-bookmark', !!v.bookmark_id);
  }

  async function load(tab) {
    const pane = tab.paneEl;
    const versesEl = pane.querySelector('.verses');
    versesEl.classList.remove('anim');
    versesEl.innerHTML = '<p style="opacity:.5;font-family:var(--font-ui);font-size:13px">Loading&hellip;</p>';

    let data;
    try {
      data = await Api.getChapter(tab.translation_code, tab.book_id, tab.chapter);
    } catch (err) {
      versesEl.innerHTML = `<p style="color:#b04a3a;font-family:var(--font-ui);font-size:13px">${err.message}</p>`;
      return;
    }

    tab.chapterData = data;
    fillSelects(tab);
    applyFont(tab);
    updatePaneButtons(tab);

    const noteEl = pane.querySelector('.chapter-note');
    if (data.chapterNote) {
      noteEl.textContent = data.chapterNote.body;
      noteEl.classList.add('visible');
    } else {
      noteEl.textContent = '';
      noteEl.classList.remove('visible');
    }

    const tplVerse = document.getElementById('tpl-verse');
    versesEl.innerHTML = '';

    // Column mode (see applyColumnMode) needs this wrapper to have its own
    // unconstrained natural height, separate from `.verses`' scroll viewport.
    const inner = document.createElement('div');
    inner.className = 'verses-inner';
    versesEl.appendChild(inner);

    const head = document.createElement('div');
    head.className = 'chapter-head';
    head.innerHTML = `<h1>${data.book.name} ${data.chapter}</h1><span class="trans-chip">${data.translation}</span>`;
    inner.appendChild(head);

    for (const v of data.verses) {
      const frag = tplVerse.content.cloneNode(true);
      const verseEl = frag.querySelector('.verse');
      verseEl.dataset.verse = v.verse;
      frag.querySelector('.verse-num').textContent = v.verse;
      frag.querySelector('.verse-text').textContent = v.text + ' ';
      if (v.highlight_color) verseEl.classList.add('hl-' + v.highlight_color);
      renderBadges(verseEl, v);
      inner.appendChild(frag);
    }

    applyViewMode(tab);
    applyColumnMode(tab);

    versesEl.querySelectorAll('.verse').forEach((verseEl) => {
      verseEl.addEventListener('click', (e) => {
        // Don't hijack a text-selection drag as a popover click.
        if (window.getSelection().toString()) return;
        e.stopPropagation();
        if (!App.isVersePopupEnabled()) return;
        Notes.openForVerse(tab, verseEl);
      });
    });

    // Replay the entrance animation.
    requestAnimationFrame(() => versesEl.classList.add('anim'));
    versesEl.scrollTop = 0;
    // `.verses` has scroll-behavior: smooth, which intercepts a plain
    // scrollLeft assignment and animates it instead of jumping — harmless
    // for scrollTop right above (the container was just emptied and
    // refilled, so there's nothing meaningful to animate from), but a
    // dual-column pane is already fully rendered here, so an animated
    // "drift back to page 1" would be a visible glitch. Same fix as
    // Tabs.alignToVerse uses for the equivalent scrollTop case.
    versesEl.scrollTo({ left: 0, behavior: 'instant' });

    Tabs.updateLabel(tab);
  }

  function flashVerse(tab, verse) {
    const verseEl = tab.paneEl.querySelector(`.verse[data-verse="${verse}"]`);
    if (!verseEl) return;
    verseEl.scrollIntoView({ block: 'center' });
    verseEl.classList.add('selected');
    setTimeout(() => verseEl.classList.remove('selected'), 1800);
  }

  return { load, fillSelects, applyFont, applyViewMode, applyColumnMode, syncColumnLayout, turnPage, updatePaneButtons, renderBadges, flashVerse };
})();
