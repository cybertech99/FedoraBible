const Drawer = (() => {
  const drawer = document.getElementById('drawer');
  const tabsNav = document.getElementById('drawer-tabs');
  const sections = {
    search: document.getElementById('drawer-search'),
    highlights: document.getElementById('drawer-highlights'),
    notes: document.getElementById('drawer-notes'),
    bookmarks: document.getElementById('drawer-bookmarks'),
    progress: document.getElementById('drawer-progress'),
  };
  const searchInput = document.getElementById('search-input');
  const transSel = document.getElementById('search-translation');
  const testSel = document.getElementById('search-testament');
  const gotoEl = document.getElementById('search-goto');
  const resultsEl = document.getElementById('search-results');

  let mode = 'search';
  let debounceTimer = null;
  let studyStale = true;

  const esc = (s) => (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function highlightTerms(text, query) {
    const terms = query.trim().split(/\s+/).filter(Boolean).map((t) => {
      const escaped = t.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      return escaped.endsWith('*') ? escaped.slice(0, -1) + '\\w*' : escaped.replace(/\*/g, '');
    }).filter(Boolean);
    if (terms.length === 0) return esc(text);
    const re = new RegExp('(' + terms.join('|') + ')', 'gi');
    return esc(text).replace(re, '<mark>$1</mark>');
  }

  function isOpen() { return !drawer.classList.contains('hidden'); }

  function open(newMode) {
    drawer.classList.remove('hidden');
    document.getElementById('drawer-btn').classList.add('on');
    if (newMode) setMode(newMode);
    else refresh();
  }
  function close() {
    drawer.classList.add('hidden');
    document.getElementById('drawer-btn').classList.remove('on');
  }
  function toggle(newMode) {
    if (isOpen() && (!newMode || newMode === mode)) close();
    else open(newMode || mode);
  }

  function setMode(m) {
    mode = m;
    tabsNav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    Object.entries(sections).forEach(([k, el]) => el.classList.toggle('hidden', k !== m));
    refresh();
    if (m === 'search') searchInput.focus();
  }

  function invalidate() {
    studyStale = true;
    if (isOpen() && mode !== 'search') refresh();
  }

  async function refresh() {
    if (mode === 'search') return;
    if (mode === 'progress') return renderProgress();
    if (!studyStale && sections[mode].dataset.loaded) return;
    try {
      const data = await Api.getStudy('KJV');
      renderStudyLists(data);
      studyStale = false;
    } catch (err) {
      sections[mode].innerHTML = `<p class="search-meta">Failed to load: ${esc(err.message)}</p>`;
    }
  }

  function refText(item) {
    return item.verse > 0
      ? `${item.book_name} ${item.chapter}:${item.verse}`
      : `${item.book_name} ${item.chapter}`;
  }

  function wireJump(container) {
    container.querySelectorAll('.study-item').forEach((el) => {
      el.addEventListener('click', () => {
        Tabs.jumpTo(Number(el.dataset.book), Number(el.dataset.chapter), Number(el.dataset.verse) || null);
      });
    });
  }

  function emptyState(icon, text) {
    return `<div class="drawer-empty"><span class="big">${icon}</span>${text}</div>`;
  }

  function renderStudyLists(data) {
    // Highlights
    sections.highlights.innerHTML = data.highlights.length
      ? data.highlights.map((h) => `
          <div class="study-item" data-book="${h.book_id}" data-chapter="${h.chapter}" data-verse="${h.verse}">
            <div class="ref"><span class="hl-dot ${h.color}"></span>${refText(h)}</div>
            <div class="snippet">${esc(h.text || '')}</div>
          </div>`).join('')
      : emptyState('&#9998;', 'No highlights yet.<br>Click any verse and pick a color.');
    wireJump(sections.highlights);
    sections.highlights.dataset.loaded = '1';

    // Notes
    sections.notes.innerHTML = data.notes.length
      ? data.notes.map((n) => `
          <div class="study-item" data-book="${n.book_id}" data-chapter="${n.chapter}" data-verse="${n.verse}">
            <div class="ref">${refText(n)}${n.verse === 0 ? ' <span style="opacity:.6">(chapter)</span>' : ''}</div>
            ${n.text ? `<div class="snippet">${esc(n.text)}</div>` : ''}
            <div class="note-body">${esc(n.body)}</div>
          </div>`).join('')
      : emptyState('&#9998;', 'No notes yet.<br>Click a verse and write one.');
    wireJump(sections.notes);
    sections.notes.dataset.loaded = '1';

    // Bookmarks
    sections.bookmarks.innerHTML = data.bookmarks.length
      ? data.bookmarks.map((bm) => `
          <div class="study-item" data-book="${bm.book_id}" data-chapter="${bm.chapter}" data-verse="${bm.verse}">
            <div class="ref">&#9670; ${refText(bm)}${bm.label ? ` — ${esc(bm.label)}` : ''}</div>
            ${bm.text ? `<div class="snippet">${esc(bm.text)}</div>` : ''}
          </div>`).join('')
      : emptyState('&#9670;', 'Nothing saved yet.<br>Bookmark verses from the popover,<br>or chapters from the toolbar.');
    wireJump(sections.bookmarks);
    sections.bookmarks.dataset.loaded = '1';
  }

  async function renderProgress() {
    let p;
    try {
      p = await Api.getProgress();
    } catch (err) {
      sections.progress.innerHTML = `<p class="search-meta">Failed: ${esc(err.message)}</p>`;
      return;
    }
    const pct = (r, t) => (t ? Math.round((r / t) * 100) : 0);
    const bar = (r, t) => `<div class="prog-bar"><div style="width:${pct(r, t)}%"></div></div>`;
    sections.progress.innerHTML = `
      <div class="prog-summary">
        <div class="prog-line"><strong>Whole Bible</strong><span>${p.total.read} / ${p.total.chapters} chapters · ${pct(p.total.read, p.total.chapters)}%</span></div>
        ${bar(p.total.read, p.total.chapters)}
        <div class="prog-line"><strong>Old Testament</strong><span>${pct(p.ot.read, p.ot.chapters)}%</span></div>
        ${bar(p.ot.read, p.ot.chapters)}
        <div class="prog-line"><strong>New Testament</strong><span>${pct(p.nt.read, p.nt.chapters)}%</span></div>
        ${bar(p.nt.read, p.nt.chapters)}
      </div>
      <div class="prog-books">
        ${p.books.map((b) => `
          <div class="prog-book${b.read >= b.chapters ? ' done' : ''}" title="${b.name}: ${b.read}/${b.chapters}">
            <span class="nm">${b.abbrev}</span>${bar(b.read, b.chapters)}
          </div>`).join('')}
      </div>
      <button class="prog-reset">Reset reading progress</button>
    `;
    sections.progress.querySelector('.prog-reset').addEventListener('click', async () => {
      await Api.resetProgress();
      renderProgress();
      toast('Reading progress reset');
    });
  }

  // ── Search ──
  async function runSearch() {
    const q = searchInput.value.trim();

    // Reference detection: offer a jump row above text results.
    const ref = q.length >= 2 ? RefParse.parse(q) : null;
    if (ref && ref.chapter) {
      gotoEl.innerHTML = `&#10142; Go to <b>&nbsp;${RefParse.format(ref)}</b>`;
      gotoEl.classList.remove('hidden');
      gotoEl.onclick = () => Tabs.jumpTo(ref.book.id, ref.chapter, ref.verse);
    } else {
      gotoEl.classList.add('hidden');
    }

    if (q.length < 2) {
      resultsEl.innerHTML = '<p class="search-meta">Type at least 2 characters. Use * for a wildcard: love*</p>';
      return;
    }
    resultsEl.innerHTML = '<p class="search-meta">Searching&hellip;</p>';
    let data;
    try {
      data = await Api.search(q, transSel.value, testSel.value);
    } catch (err) {
      resultsEl.innerHTML = `<p class="search-meta">${esc(err.message)}</p>`;
      return;
    }
    if (data.results.length === 0) {
      resultsEl.innerHTML = '<p class="search-meta">No results.</p>';
      return;
    }
    resultsEl.innerHTML =
      `<p class="search-meta">${data.total} result${data.total === 1 ? '' : 's'}</p>` +
      data.results.map((r) => `
        <div class="study-item" data-book="${r.book_id}" data-chapter="${r.chapter}" data-verse="${r.verse}">
          <div class="ref">${r.book_name} ${r.chapter}:${r.verse}</div>
          <div class="snippet">${highlightTerms(r.text, q)}</div>
        </div>`).join('');
    resultsEl.querySelectorAll('.study-item').forEach((el) => {
      el.addEventListener('click', () => {
        Tabs.jumpTo(Number(el.dataset.book), Number(el.dataset.chapter), Number(el.dataset.verse), transSel.value);
      });
    });
  }

  // ── Export ──
  async function exportMarkdown() {
    const data = await Api.getStudy('KJV');
    const lines = ['# My Bible study notes', '', `_Exported ${new Date().toLocaleDateString()} from FedoraBible_`, ''];
    if (data.highlights.length) {
      lines.push('## Highlights', '');
      for (const h of data.highlights) {
        lines.push(`- **${refText(h)}** (${h.color}) — ${h.text || ''}`);
      }
      lines.push('');
    }
    if (data.notes.length) {
      lines.push('## Notes', '');
      for (const n of data.notes) {
        lines.push(`### ${refText(n)}${n.verse === 0 ? ' (chapter)' : ''}`);
        if (n.text) lines.push(`> ${n.text}`, '');
        lines.push(n.body, '');
      }
    }
    if (data.bookmarks.length) {
      lines.push('## Saved', '');
      for (const bm of data.bookmarks) {
        lines.push(`- **${refText(bm)}**${bm.label ? ` — ${bm.label}` : ''}${bm.text ? ` — ${bm.text}` : ''}`);
      }
      lines.push('');
    }
    if (!data.highlights.length && !data.notes.length && !data.bookmarks.length) {
      toast('Nothing to export yet');
      return;
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bible-study-notes.md';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Exported bible-study-notes.md');
  }

  function init() {
    transSel.innerHTML = State.translations.map((t) => `<option value="${t.code}">${t.name}</option>`).join('');
    tabsNav.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
    });
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runSearch, 280);
    });
    transSel.addEventListener('change', runSearch);
    testSel.addEventListener('change', runSearch);
    document.getElementById('drawer-btn').addEventListener('click', () => toggle());
    document.getElementById('export-btn').addEventListener('click', () => {
      exportMarkdown().catch(() => toast('Export failed'));
    });
  }

  function focusSearch() {
    open('search');
    searchInput.focus();
    searchInput.select();
  }

  return { init, open, close, toggle, isOpen, setMode, invalidate, focusSearch, runSearch, searchInput };
})();
