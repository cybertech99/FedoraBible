// Command palette (Ctrl+K): jump to a reference, pick a book, or hand off to search.
const Palette = (() => {
  const overlay = document.getElementById('palette');
  const input = document.getElementById('palette-input');
  const resultsEl = document.getElementById('palette-results');
  let items = []; // { label html, run(newTab) }
  let sel = 0;

  const bookIcon = '<svg viewBox="0 0 16 16"><path d="M2.5 3C4 2.2 5.6 2.2 8 3.4 10.4 2.2 12 2.2 13.5 3v9.6c-1.5-.8-3.1-.8-5.5.4-2.4-1.2-4-1.2-5.5-.4V3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none"/><path d="M8 3.4v9.6" stroke="currentColor" stroke-width="1.3"/></svg>';
  const searchIcon = '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.4" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

  function isOpen() { return !overlay.classList.contains('hidden'); }

  function open() {
    overlay.classList.remove('hidden');
    input.value = '';
    build('');
    input.focus();
  }
  function close() { overlay.classList.add('hidden'); }

  function build(q) {
    items = [];
    q = q.trim();

    if (q) {
      const ref = RefParse.parse(q);
      if (ref) {
        if (ref.chapter) {
          const label = RefParse.format(ref);
          items.push({
            html: `<span class="pi-icon">${bookIcon}</span><span class="pi-label">Open <b>${label}</b></span><kbd>Enter</kbd>`,
            run: (newTab) => go(ref.book.id, ref.chapter, ref.verse, newTab),
          });
        }
        // Book suggestions (first chapter) for ambiguous / chapterless input.
        const cands = ref.candidates.slice(0, ref.chapter ? 3 : 6);
        for (const b of cands) {
          if (ref.chapter && b.id === ref.book.id) continue;
          const ch = ref.chapter && ref.chapter <= b.chapters ? ref.chapter : 1;
          items.push({
            html: `<span class="pi-icon">${bookIcon}</span><span class="pi-label"><b>${b.name}</b> <span class="dim">${ch > 1 ? ch : `· ${b.chapters} chapters`}</span></span><kbd>Enter</kbd>`,
            run: (newTab) => go(b.id, ch, null, newTab),
          });
        }
      }
      items.push({
        html: `<span class="pi-icon">${searchIcon}</span><span class="pi-label">Search for &ldquo;<b>${q.replace(/[&<>]/g, '')}</b>&rdquo;</span><kbd>Enter</kbd>`,
        run: () => {
          close();
          Drawer.focusSearch();
          Drawer.searchInput.value = q;
          Drawer.runSearch();
        },
      });
    } else {
      // Idle state: a few gentle starting points.
      const suggestions = [
        ['Psalms', 23], ['John', 3], ['Genesis', 1], ['Romans', 8], ['Proverbs', 3],
      ];
      for (const [name, ch] of suggestions) {
        const b = State.books.find((bk) => bk.name === name);
        if (!b) continue;
        items.push({
          html: `<span class="pi-icon">${bookIcon}</span><span class="pi-label"><b>${name} ${ch}</b></span><kbd>Enter</kbd>`,
          run: (newTab) => go(b.id, ch, null, newTab),
        });
      }
    }

    sel = 0;
    render();
  }

  async function go(book_id, chapter, verse, newTab) {
    close();
    if (newTab) {
      await Tabs.openTabLikeActive({ book_id, chapter });
      if (verse) Reader.flashVerse(State.activeTab(), verse);
    } else {
      Tabs.jumpTo(book_id, chapter, verse);
    }
  }

  function render() {
    resultsEl.innerHTML = items.map((it, i) =>
      `<div class="palette-item${i === sel ? ' sel' : ''}" data-i="${i}">${it.html}</div>`
    ).join('');
    resultsEl.querySelectorAll('.palette-item').forEach((el) => {
      el.addEventListener('click', (e) => items[Number(el.dataset.i)].run(e.ctrlKey));
      el.addEventListener('mousemove', () => {
        const i = Number(el.dataset.i);
        if (i !== sel) { sel = i; render(); }
      });
    });
    const selEl = resultsEl.querySelector('.palette-item.sel');
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', () => build(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); items[sel] && items[sel].run(e.ctrlKey); }
    else if (e.key === 'Escape') { close(); }
  });
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.getElementById('palette-btn').addEventListener('click', open);

  return { open, close, isOpen };
})();
