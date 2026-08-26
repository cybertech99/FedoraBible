const Tabs = (() => {
  const tabBar = document.getElementById('tab-bar');
  const panes = document.getElementById('panes');
  const tplTab = document.getElementById('tpl-tab');
  const tplPane = document.getElementById('tpl-pane');

  function updateLabel(tab) {
    const book = State.bookById(tab.book_id);
    tab.el.querySelector('.tab-label').textContent = `${book ? book.abbrev : '?'} ${tab.chapter}`;
    tab.el.querySelector('.tab-trans').textContent = tab.translation_code;
  }

  function setActive(tab, persist = true) {
    for (const t of State.tabs) {
      t.el.classList.toggle('active', t.id === tab.id);
      t.paneEl.classList.toggle('active-pane', t.id === tab.id);
    }
    State.activeTabId = tab.id;
    tab.paneEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    if (persist) Api.updateTab(tab.id, { is_active: true }).catch(() => {});
  }

  // Some translations only cover part of the canon (a Greek NT, a Hebrew OT).
  // If a change would land on a book that translation doesn't have, snap to
  // the nearest book it does cover instead of hitting a dead end.
  function snapToCoverage(patch, tab) {
    const translation_code = patch.translation_code || tab.translation_code;
    const trans = State.translations.find((t) => t.code === translation_code);
    if (!trans) return patch;
    const book = State.bookById(patch.book_id ?? tab.book_id);
    if (!book) return patch;
    if (book.ordinal < trans.min_ordinal || book.ordinal > trans.max_ordinal) {
      toast(`${trans.code} doesn't include ${book.name} — showing where it starts`);
      return { ...patch, translation_code, book_id: trans.default_book_id, chapter: 1 };
    }
    return patch;
  }

  let propagating = false;
  async function navigate(tab, patch) {
    if ('translation_code' in patch || 'book_id' in patch) patch = snapToCoverage(patch, tab);
    Object.assign(tab, patch);
    await Reader.load(tab);
    Api.updateTab(tab.id, patch).catch(() => {});

    // Linked tabs turn pages together (each keeps its own translation).
    const isNav = 'book_id' in patch || 'chapter' in patch;
    if (isNav && tab.linked && !propagating) {
      propagating = true;
      try {
        const followers = State.tabs.filter((t) => t !== tab && t.linked);
        await Promise.all(followers.map((t) =>
          navigate(t, { book_id: tab.book_id, chapter: tab.chapter })
        ));
      } finally {
        propagating = false;
      }
    }
  }

  // Jump the active tab to a reference (used by search, palette, study lists).
  async function jumpTo(book_id, chapter, verse, translation_code) {
    let tab = State.activeTab();
    if (!tab) return;
    const patch = { book_id, chapter };
    if (translation_code) patch.translation_code = translation_code;
    await navigate(tab, patch);
    setActive(tab);
    if (verse) Reader.flashVerse(tab, verse);
  }

  function closeAllFontMenus() {
    for (const t of State.tabs) {
      t.paneEl.querySelector('.font-menu').classList.add('hidden');
      t.paneEl.querySelector('.pane-font-btn').classList.remove('on');
    }
  }

  function setFont(tab, patch) {
    Object.assign(tab, patch);
    Reader.applyFont(tab);
    Api.updateTab(tab.id, patch).catch(() => {});
  }

  function resetAutoSizing() {
    for (const t of State.tabs) t.paneEl.style.flex = '1 1 0';
  }

  function wireResizer(tab) {
    const handle = tab.paneEl.querySelector('.pane-resizer');
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = tab.paneEl.getBoundingClientRect().width;
      handle.classList.add('dragging');

      function onMove(ev) {
        const newWidth = Math.max(280, startWidth + (ev.clientX - startX));
        tab.paneEl.style.flex = `0 0 ${newWidth}px`;
      }
      function onUp() {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  async function toggleChapterBookmark(tab) {
    const has = tab.chapterData && tab.chapterData.chapterBookmark;
    try {
      if (has) {
        await Api.removeBookmark(tab.book_id, tab.chapter, 0);
        tab.chapterData.chapterBookmark = null;
        toast('Chapter bookmark removed');
      } else {
        const bm = await Api.setBookmark(tab.book_id, tab.chapter, 0);
        tab.chapterData.chapterBookmark = bm;
        toast('Chapter bookmarked');
      }
      Reader.updatePaneButtons(tab);
      Drawer.invalidate();
    } catch (err) {
      toast('Could not update bookmark');
    }
  }

  function toggleLink(tab) {
    tab.linked = tab.linked ? 0 : 1;
    Reader.updatePaneButtons(tab);
    Api.updateTab(tab.id, { linked: tab.linked }).catch(() => {});
    const linkedCount = State.tabs.filter((t) => t.linked).length;
    toast(tab.linked
      ? (linkedCount > 1 ? `Linked — ${linkedCount} tabs turn pages and scroll together` : 'Linked — link another tab to pair them')
      : 'Unlinked');
  }

  // Scroll lock: while two or more linked tabs are showing the exact same
  // book/chapter, scrolling any one of them brings the same verse to the top
  // of the others — reading the same passage across translations stays
  // aligned instead of only the chapter turning together. Percentage-of-page
  // scroll would drift out of alignment since translations render to
  // different lengths, so this tracks by verse number instead.
  let scrollSyncing = false;

  function verseAtTop(versesEl) {
    const containerTop = versesEl.getBoundingClientRect().top;
    for (const v of versesEl.querySelectorAll('.verse')) {
      if (v.getBoundingClientRect().bottom > containerTop) return Number(v.dataset.verse);
    }
    return null;
  }

  function alignToVerse(versesEl, verseNum) {
    let el = versesEl.querySelector(`.verse[data-verse="${verseNum}"]`);
    if (!el) {
      // Cross-tradition verse numbering can differ for a given chapter (the
      // LXX Psalter is famously offset from the Hebrew/KJV numbering for a
      // long stretch) — align to whichever verse number in this pane is
      // closest instead of silently giving up.
      let bestDiff = Infinity;
      for (const v of versesEl.querySelectorAll('.verse')) {
        const diff = Math.abs(Number(v.dataset.verse) - verseNum);
        if (diff < bestDiff) { bestDiff = diff; el = v; }
      }
    }
    if (!el) return;
    const containerRect = versesEl.getBoundingClientRect();
    const target = versesEl.scrollTop + (el.getBoundingClientRect().top - containerRect.top);
    // `.verses` has scroll-behavior: smooth for user-facing scrolling
    // (search results, flashVerse, etc.) — but that also applies to a plain
    // scrollTop assignment, which turned syncing into a multi-hundred-ms
    // animation instead of a snap. That's both laggy and, worse, meant the
    // "ignore echoed scroll events" window below wasn't long enough to
    // cover it. An explicit instant scrollTo bypasses the CSS behavior.
    versesEl.scrollTo({ top: target, behavior: 'instant' });
  }

  function wireScrollSync(tab) {
    const versesEl = tab.paneEl.querySelector('.verses');
    let rafPending = false;
    versesEl.addEventListener('scroll', () => {
      if (scrollSyncing || !tab.linked || rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const followers = State.tabs.filter((t) =>
          t !== tab && t.linked && t.book_id === tab.book_id && t.chapter === tab.chapter
        );
        if (followers.length === 0) return;
        const verseNum = verseAtTop(versesEl);
        if (verseNum == null) return;
        scrollSyncing = true;
        for (const t of followers) alignToVerse(t.paneEl.querySelector('.verses'), verseNum);
        // Now that alignToVerse scrolls instantly, the followers' echoed
        // scroll events fire (and need to be ignored) within the same tick —
        // one rAF of guard is plenty, no arbitrary timeout needed.
        requestAnimationFrame(() => { scrollSyncing = false; });
      });
    });
  }

  function setViewMode(tab, view_mode) {
    tab.view_mode = view_mode;
    Reader.applyViewMode(tab);
    Api.updateTab(tab.id, { view_mode }).catch(() => {});
  }

  function setColumnMode(tab, column_mode) {
    tab.column_mode = column_mode;
    Reader.applyColumnMode(tab);
    // scrollTo(..., 'instant'), not a plain scrollLeft assignment — .verses'
    // scroll-behavior:smooth would otherwise animate this and race any
    // in-flight page-turn scroll (see reader.js's load()).
    tab.paneEl.querySelector('.verses').scrollTo({ left: 0, behavior: 'instant' });
    Api.updateTab(tab.id, { column_mode }).catch(() => {});
  }

  // Dual-column mode pages horizontally instead of scrolling vertically (see
  // app.css and Reader.turnPage) — wire the ways to move between pages that
  // arrow keys don't already cover (arrow-key paging is in shortcuts.js), plus
  // keeping the column widths in sync as the pane's available space changes.
  function wireDualColumn(tab) {
    const versesEl = tab.paneEl.querySelector('.verses');

    // A plain vertical mouse wheel has no effect on a horizontally-scrolling
    // element by default; translate it so wheel users aren't stuck with only
    // keyboard/trackpad-swipe navigation. Deltas that are already mostly
    // horizontal (an actual trackpad swipe) are left alone — the browser's
    // native scrolling there already feels right.
    versesEl.addEventListener('wheel', (e) => {
      if (tab.column_mode !== 'dual') return;
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      versesEl.scrollBy({ left: e.deltaY, behavior: 'auto' });
    }, { passive: false });

    // Tap/click the outer edges to turn a page, like an e-reader — the
    // primary interaction on a touch device (this feature's main use case).
    // Verse text fills almost the full column width, so there's rarely any
    // non-verse whitespace to click in the edge zone — and verse elements
    // stopPropagation() on click (see Reader.load), which would normally
    // swallow it before it ever reached a listener on `.verses`. Using the
    // capture phase here runs this before that bubble-phase handler, so a
    // page-turn can claim the click (via stopPropagation of its own) ahead
    // of the verse popover.
    versesEl.addEventListener('click', (e) => {
      if (tab.column_mode !== 'dual') return;
      const rect = versesEl.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      if (frac >= 0.82) { e.stopPropagation(); Reader.turnPage(tab, 1); }
      else if (frac <= 0.18) { e.stopPropagation(); Reader.turnPage(tab, -1); }
    }, true);

    // Keeps the two columns' exact pixel widths (see Reader.syncColumnLayout)
    // correct through anything that changes the pane's available width:
    // window resize, tablet rotation, the drag-to-resize handle, or the
    // study drawer opening/closing. One observer per tab covers all of
    // those causes uniformly instead of hooking each one individually.
    new ResizeObserver(() => Reader.syncColumnLayout(tab)).observe(versesEl);

    // A plain touch swipe can land anywhere mid-page, showing a torn mix of
    // two pages rather than one clean one — 'scrollend' fires once any
    // scroll (a swipe's momentum, a wheel tick, or one of our own
    // scrollBy/scrollTo calls) has fully settled, regardless of what
    // started it, so this snaps the rest of the way to the nearest page
    // boundary. Reader.turnPage's own scrolls already land exactly on a
    // boundary, so this is a no-op for those — it only does real work after
    // a free-form swipe or wheel scroll.
    versesEl.addEventListener('scrollend', () => {
      if (tab.column_mode !== 'dual') return;
      const pageWidth = versesEl.clientWidth;
      if (!pageWidth) return;
      const target = Math.round(versesEl.scrollLeft / pageWidth) * pageWidth;
      if (Math.abs(target - versesEl.scrollLeft) > 1) {
        versesEl.scrollTo({ left: target, behavior: 'smooth' });
      }
    });
  }

  function wirePane(tab) {
    const pane = tab.paneEl;
    pane.querySelector('.pane-book').addEventListener('change', (e) => {
      navigate(tab, { book_id: Number(e.target.value), chapter: 1 });
    });
    pane.querySelector('.pane-chapter').addEventListener('change', (e) => {
      navigate(tab, { chapter: Number(e.target.value) });
    });
    pane.querySelector('.pane-translation').addEventListener('change', (e) => {
      navigate(tab, { translation_code: e.target.value });
    });
    pane.querySelector('.pane-prev').addEventListener('click', () => {
      const p = tab.chapterData && tab.chapterData.prev;
      if (p) navigate(tab, { book_id: p.book, chapter: p.chapter });
    });
    pane.querySelector('.pane-next').addEventListener('click', () => {
      const n = tab.chapterData && tab.chapterData.next;
      if (n) navigate(tab, { book_id: n.book, chapter: n.chapter });
    });
    pane.querySelector('.pane-bookmark').addEventListener('click', () => toggleChapterBookmark(tab));
    pane.querySelector('.pane-link').addEventListener('click', () => toggleLink(tab));
    pane.querySelector('.pane-about').addEventListener('click', () => TranslationInfo.open(tab.translation_code));

    const fontBtn = pane.querySelector('.pane-font-btn');
    const fontMenu = pane.querySelector('.font-menu');
    fontBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = !fontMenu.classList.contains('hidden');
      closeAllFontMenus();
      if (!wasOpen) {
        fontMenu.classList.remove('hidden');
        fontBtn.classList.add('on');
      }
    });
    pane.querySelector('.font-family-select').addEventListener('change', (e) => {
      setFont(tab, { font_family: e.target.value });
    });
    pane.querySelector('.font-size-select').addEventListener('change', (e) => {
      setFont(tab, { font_size: Number(e.target.value) });
    });
    fontMenu.querySelector('.seg-verses').addEventListener('click', () => setViewMode(tab, 'verses'));
    fontMenu.querySelector('.seg-flow').addEventListener('click', () => setViewMode(tab, 'flow'));
    fontMenu.querySelector('.seg-col-single').addEventListener('click', () => setColumnMode(tab, 'single'));
    fontMenu.querySelector('.seg-col-dual').addEventListener('click', () => setColumnMode(tab, 'dual'));

    pane.addEventListener('mousedown', () => { if (State.activeTabId !== tab.id) setActive(tab); });
    wireResizer(tab);
    wireScrollSync(tab);
    wireDualColumn(tab);
  }

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.font-menu') && !e.target.closest('.pane-font-btn')) {
      closeAllFontMenus();
    }
  });

  function buildDom(row) {
    const tabFrag = tplTab.content.cloneNode(true);
    const tabEl = tabFrag.querySelector('.tab');
    const paneFrag = tplPane.content.cloneNode(true);
    const paneEl = paneFrag.querySelector('.pane');

    const tab = {
      id: row.id,
      position: row.position,
      translation_code: row.translation_code,
      book_id: row.book_id,
      chapter: row.chapter,
      font_family: row.font_family || 'serif-literata',
      font_size: row.font_size || 18,
      view_mode: row.view_mode || 'verses',
      column_mode: row.column_mode || 'single',
      linked: row.linked || 0,
      el: tabEl,
      paneEl,
      chapterData: null,
    };

    tabEl.addEventListener('click', () => setActive(tab));
    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab);
    });

    tabBar.appendChild(tabEl);
    panes.appendChild(paneEl);
    wirePane(tab);
    State.tabs.push(tab);
    return tab;
  }

  async function openTab(fields) {
    const row = await Api.createTab(fields);
    const tab = buildDom(row);
    resetAutoSizing();
    await Reader.load(tab);
    setActive(tab);
    return tab;
  }

  function openTabLikeActive(overrides = {}) {
    const src = State.activeTab();
    return openTab({
      translation_code: src ? src.translation_code : 'KJV',
      book_id: src ? src.book_id : State.books[0].id,
      chapter: src ? src.chapter : 1,
      font_family: src ? src.font_family : 'serif-literata',
      font_size: src ? src.font_size : 18,
      view_mode: src ? src.view_mode : 'verses',
      column_mode: src ? src.column_mode : 'single',
      ...overrides,
    });
  }

  async function closeTab(tab) {
    const idx = State.tabs.indexOf(tab);
    if (idx === -1) return;
    State.tabs.splice(idx, 1);
    tab.el.remove();
    tab.paneEl.remove();
    Api.deleteTab(tab.id).catch(() => {});
    if (State.tabs.length === 0) {
      openTab({
        translation_code: tab.translation_code, book_id: tab.book_id, chapter: 1,
        font_family: tab.font_family, font_size: tab.font_size, view_mode: tab.view_mode,
        column_mode: tab.column_mode,
      });
    } else {
      resetAutoSizing();
      if (State.activeTabId === tab.id) setActive(State.tabs[Math.max(0, idx - 1)]);
    }
  }

  async function init() {
    const rows = await Api.getTabs();
    if (rows.length === 0) {
      await openTab({ translation_code: 'KJV', book_id: State.books[0].id, chapter: 1 });
      return;
    }
    let active = null;
    for (const row of rows) {
      const tab = buildDom(row);
      await Reader.load(tab);
      if (row.is_active) active = tab;
    }
    setActive(active || State.tabs[0], false);
  }

  document.getElementById('new-tab-btn').addEventListener('click', () => openTabLikeActive());

  return { init, openTab, openTabLikeActive, closeTab, setActive, navigate, jumpTo, updateLabel };
})();
