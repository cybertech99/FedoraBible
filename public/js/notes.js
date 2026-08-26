const Notes = (() => {
  const popover = document.getElementById('popover');
  const refEl = popover.querySelector('.popover-ref');
  const textarea = document.getElementById('popover-note');
  const deleteBtn = document.getElementById('popover-delete-note');
  const bookmarkBtn = document.getElementById('popover-bookmark');
  let current = null; // { tab, verseEl, book_id, chapter, verse, verseData }

  function close() {
    popover.classList.add('hidden');
    current = null;
    document.removeEventListener('mousedown', onOutsideClick, true);
  }

  function isOpen() {
    return !popover.classList.contains('hidden');
  }

  function onOutsideClick(e) {
    if (!popover.contains(e.target)) close();
  }

  function position(verseEl) {
    const rect = verseEl.getBoundingClientRect();
    const pw = 288;
    const ph = 280; // approx
    let top = rect.bottom + 6;
    if (top + ph > window.innerHeight) top = Math.max(8, rect.top - ph - 6);

    let minLeft = 8;
    let maxLeft = window.innerWidth - pw - 12;

    // In dual-column mode, prefer keeping the popover within the clicked
    // verse's own column instead of just clamping to the window edge — the
    // plain clamp can pull it sideways across the column divider, so it
    // ends up straddling both columns. Only bother when the column is
    // actually wide enough to hold the popover; otherwise fall back to the
    // whole-pane clamp above rather than force an impossible fit.
    const pane = verseEl.closest('.pane');
    const versesEl = pane && pane.querySelector('.verses');
    if (versesEl && versesEl.classList.contains('dual')) {
      const paneRect = pane.getBoundingClientRect();
      const mid = paneRect.left + paneRect.width / 2;
      const inLeftColumn = rect.left < mid;
      const colMin = inLeftColumn ? paneRect.left + 8 : mid + 8;
      const colMax = inLeftColumn ? mid - 8 : paneRect.right - 8;
      if (colMax - colMin >= pw) {
        minLeft = colMin;
        maxLeft = Math.min(maxLeft, colMax - pw);
      }
    }

    const left = Math.max(minLeft, Math.min(rect.left, maxLeft));
    popover.style.top = top + 'px';
    popover.style.left = left + 'px';
  }

  async function openForVerse(tab, verseEl) {
    if (current && current.verseEl === verseEl) { close(); return; }
    const verse = Number(verseEl.dataset.verse);
    const verseData = tab.chapterData.verses.find((v) => v.verse === verse);
    current = { tab, verseEl, book_id: tab.book_id, chapter: tab.chapter, verse, verseData };

    const book = State.bookById(tab.book_id);
    refEl.textContent = `${book.name} ${tab.chapter}:${verse}`;

    position(verseEl);
    popover.classList.remove('hidden');

    const activeColor = [...verseEl.classList].find((c) => c.startsWith('hl-'))?.slice(3) || '';
    popover.querySelectorAll('.swatch').forEach((s) => {
      s.classList.toggle('current', !!activeColor && s.dataset.color === activeColor);
    });

    bookmarkBtn.classList.toggle('on', !!verseData.bookmark_id);
    deleteBtn.classList.toggle('hidden', !verseData.note_id);

    textarea.value = '';
    if (verseData.note_id) {
      try {
        const notes = await Api.getNotesForChapter(tab.book_id, tab.chapter);
        const note = notes.find((n) => n.verse === verse);
        if (note) textarea.value = note.body;
      } catch { /* ignore */ }
    }

    setTimeout(() => document.addEventListener('mousedown', onOutsideClick, true), 0);
  }

  // The quick-highlight alternative to openForVerse — no popover, just a
  // toggle: click an unhighlighted verse to highlight it yellow, click an
  // already-highlighted one (any color) to remove it. Used instead of
  // openForVerse when App.isVersePopupEnabled() is off (see reader.js).
  async function toggleQuickHighlight(tab, verseEl) {
    const verse = Number(verseEl.dataset.verse);
    const verseData = tab.chapterData.verses.find((v) => v.verse === verse);
    const hadHighlight = !!verseData.highlight_color;
    try {
      if (hadHighlight) {
        await Api.removeHighlight(tab.book_id, tab.chapter, verse);
        verseEl.classList.remove('hl-yellow', 'hl-green', 'hl-blue', 'hl-pink', 'hl-orange');
        verseData.highlight_color = null;
      } else {
        await Api.setHighlight(tab.book_id, tab.chapter, verse, 'yellow');
        verseEl.classList.add('hl-yellow');
        verseData.highlight_color = 'yellow';
      }
      Drawer.invalidate();
    } catch {
      toast('Could not update highlight');
    }
  }

  popover.querySelectorAll('.swatch').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!current) return;
      const { verseEl, book_id, chapter, verse, verseData } = current;
      const color = btn.dataset.color;
      verseEl.classList.remove('hl-yellow', 'hl-green', 'hl-blue', 'hl-pink', 'hl-orange');
      try {
        if (color) {
          await Api.setHighlight(book_id, chapter, verse, color);
          verseEl.classList.add('hl-' + color);
          verseData.highlight_color = color;
        } else {
          await Api.removeHighlight(book_id, chapter, verse);
          verseData.highlight_color = null;
        }
        Drawer.invalidate();
      } catch (err) {
        toast('Could not save highlight');
      }
      close();
    });
  });

  document.getElementById('popover-copy').addEventListener('click', async () => {
    if (!current) return;
    const { tab, verse, verseData } = current;
    const book = State.bookById(tab.book_id);
    const text = `“${verseData.text.trim()}” — ${book.name} ${tab.chapter}:${verse} (${tab.translation_code})`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied with reference');
    } catch {
      toast('Copy failed');
    }
    close();
  });

  bookmarkBtn.addEventListener('click', async () => {
    if (!current) return;
    const { tab, verseEl, book_id, chapter, verse, verseData } = current;
    try {
      if (verseData.bookmark_id) {
        await Api.removeBookmark(book_id, chapter, verse);
        verseData.bookmark_id = null;
        toast('Removed from saved');
      } else {
        const bm = await Api.setBookmark(book_id, chapter, verse);
        verseData.bookmark_id = bm.id;
        toast('Verse saved');
      }
      Reader.renderBadges(verseEl, verseData);
      Drawer.invalidate();
    } catch {
      toast('Could not update bookmark');
    }
    close();
  });

  document.getElementById('popover-save-note').addEventListener('click', async () => {
    if (!current) return;
    const { verseEl, book_id, chapter, verse, verseData } = current;
    const body = textarea.value.trim();
    if (!body) { close(); return; }
    try {
      const note = await Api.setNote(book_id, chapter, verse, body);
      verseData.note_id = note.id;
      Reader.renderBadges(verseEl, verseData);
      Drawer.invalidate();
      toast('Note saved');
    } catch (err) {
      toast('Could not save note');
    }
    close();
  });

  deleteBtn.addEventListener('click', async () => {
    if (!current) return;
    const { verseEl, book_id, chapter, verse, verseData } = current;
    try {
      await Api.removeNote(book_id, chapter, verse);
      verseData.note_id = null;
      Reader.renderBadges(verseEl, verseData);
      Drawer.invalidate();
      toast('Note deleted');
    } catch {
      toast('Could not delete note');
    }
    close();
  });

  return { openForVerse, close, isOpen, toggleQuickHighlight };
})();
