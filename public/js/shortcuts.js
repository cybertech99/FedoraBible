// Global keyboard shortcuts + the "?" help overlay.
const Shortcuts = (() => {
  const help = document.getElementById('help');

  const ROWS = [
    ['Ctrl K', 'Go to reference / search'],
    ['/', 'Search'],
    ['← →', 'Previous / next chapter'],
    ['n', 'New tab'],
    ['w', 'Close tab'],
    ['1–9', 'Switch to tab'],
    ['b', 'Study drawer'],
    ['d', 'Cycle theme'],
    ['p', 'Verses / flow layout'],
    ['c', 'Single / dual column'],
    ['h', 'Verse click: popup / quick highlight'],
    ['?', 'This help'],
    ['Esc', 'Close / stop'],
  ];

  document.getElementById('help-grid').innerHTML = ROWS.map(([keys, label]) => `
    <div class="help-row"><span>${label}</span><span class="keys">${keys.split(' ').map((k) => `<kbd>${k}</kbd>`).join('')}</span></div>
  `).join('');

  function toggleHelp() { help.classList.toggle('hidden'); }
  help.addEventListener('mousedown', (e) => { if (e.target === help) help.classList.add('hidden'); });
  document.getElementById('help-btn').addEventListener('click', toggleHelp);

  function isTyping(e) {
    const t = e.target;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
  }

  document.addEventListener('keydown', (e) => {
    // Ctrl+K works everywhere, even while typing.
    if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      Palette.isOpen() ? Palette.close() : Palette.open();
      return;
    }

    if (e.key === 'Escape') {
      if (Palette.isOpen()) return Palette.close();
      if (!help.classList.contains('hidden')) return help.classList.add('hidden');
      if (TranslationInfo.isOpen()) return TranslationInfo.close();
      if (Notes.isOpen()) return Notes.close();
      return;
    }

    if (isTyping(e) || Palette.isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;

    const tab = State.activeTab();
    switch (e.key) {
      case '/':
        e.preventDefault();
        Drawer.focusSearch();
        break;
      case 'ArrowLeft': {
        // In dual-column mode this is a horizontal scroll on a focusable-ish
        // area — without preventDefault, the browser's own native arrow-key
        // scroll nudge fires right after Reader.turnPage's JS-driven smooth
        // scroll starts, cancelling and truncating it to a few px.
        if (tab && tab.column_mode === 'dual') e.preventDefault();
        if (tab && Reader.turnPage(tab, -1)) break;
        const p = tab && tab.chapterData && tab.chapterData.prev;
        if (p) Tabs.navigate(tab, { book_id: p.book, chapter: p.chapter });
        break;
      }
      case 'ArrowRight': {
        if (tab && tab.column_mode === 'dual') e.preventDefault();
        if (tab && Reader.turnPage(tab, 1)) break;
        const n = tab && tab.chapterData && tab.chapterData.next;
        if (n) Tabs.navigate(tab, { book_id: n.book, chapter: n.chapter });
        break;
      }
      case 'n':
        Tabs.openTabLikeActive();
        break;
      case 'w':
        if (tab) Tabs.closeTab(tab);
        break;
      case 'b':
        // Drawer.toggle() can move focus into the search input (when opening
        // on the Search tab); without this the same keypress types a stray
        // "b" into it right after.
        e.preventDefault();
        Drawer.toggle();
        break;
      case 'd':
        App.cycleTheme();
        break;
      case 'h':
        App.toggleVersePopup();
        break;
      case 'p':
        if (tab) {
          const mode = tab.view_mode === 'flow' ? 'verses' : 'flow';
          tab.view_mode = mode;
          Reader.applyViewMode(tab);
          Api.updateTab(tab.id, { view_mode: mode }).catch(() => {});
          toast(mode === 'flow' ? 'Flow layout' : 'Verse layout');
        }
        break;
      case 'c':
        if (tab) {
          const mode = tab.column_mode === 'dual' ? 'single' : 'dual';
          tab.column_mode = mode;
          Reader.applyColumnMode(tab);
          tab.paneEl.querySelector('.verses').scrollTo({ left: 0, behavior: 'instant' });
          Api.updateTab(tab.id, { column_mode: mode }).catch(() => {});
          toast(mode === 'dual' ? 'Dual column' : 'Single column');
        }
        break;
      case '?':
        toggleHelp();
        break;
      default: {
        const num = Number(e.key);
        if (num >= 1 && num <= 9 && State.tabs[num - 1]) {
          Tabs.setActive(State.tabs[num - 1]);
        }
      }
    }
  });

  return { toggleHelp };
})();
