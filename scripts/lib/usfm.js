// Minimal USFM -> {chapters:[{chapter, verses:[{verse, text}]}]} parser.
// Handles the marker set actually present in eBible.org texts: strips
// footnotes (\f ... \f*), cross-references (\x ... \x*), and inline character
// styles (\wj, \sc, \add, \bd, ... and their \*  closers), keeping their text.
function parseUsfm(raw) {
  // Drop footnote and cross-reference spans entirely (including content).
  let text = raw.replace(/\\f\s*\+?[\s\S]*?\\f\*/g, '').replace(/\\x\s*\+?[\s\S]*?\\x\*/g, '');
  // Strip character-style markers but keep their text: \tag ...\tag* or bare \tag
  text = text.replace(/\\[a-z][a-z0-9]*\*/gi, '').replace(/\\[a-z][a-z0-9]*\d?\s?/gi, (m) => {
    // Keep structural markers we handle explicitly below; blank out the rest.
    return /^\\(c|v)\d?\s$/i.test(m) ? m : (/^\\(c|v)\s$/i.test(m) ? m : '');
  });

  const chapters = [];
  let curChapter = null;
  let curVerse = null;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cMatch = line.match(/^\\c\s+(\d+)/);
    if (cMatch) {
      curChapter = { chapter: Number(cMatch[1]), verses: [] };
      chapters.push(curChapter);
      curVerse = null;
      continue;
    }
    // LXX verse numbers sometimes carry a letter suffix (35a, 35b, ...) where
    // the Greek has more material than the Hebrew base text being aligned to;
    // fold those into their base verse number instead of colliding on insert.
    const vMatch = line.match(/^\\v\s+(\d+)[a-z]?\s?(.*)$/);
    if (vMatch) {
      if (!curChapter) continue; // stray verse before any \c (shouldn't happen)
      const num = Number(vMatch[1]);
      const existing = curChapter.verses.find((v) => v.verse === num);
      if (existing) {
        existing.text += ' ' + vMatch[2];
        curVerse = existing;
      } else {
        curVerse = { verse: num, text: vMatch[2] };
        curChapter.verses.push(curVerse);
      }
      continue;
    }
    // Paragraph/other markers: append trailing text (if any) to the open verse.
    if (curVerse && line && !line.startsWith('\\')) {
      curVerse.text += ' ' + line;
    } else if (curVerse) {
      const stripped = line.replace(/^\\\S+\s*/, '');
      if (stripped) curVerse.text += ' ' + stripped;
    }
  }

  for (const c of chapters) {
    for (const v of c.verses) {
      v.text = v.text.replace(/\s+/g, ' ').trim();
    }
  }
  return chapters.filter((c) => c.verses.length > 0);
}

module.exports = { parseUsfm };
