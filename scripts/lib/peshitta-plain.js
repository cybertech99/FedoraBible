// Parser for the ETCBC/peshitta "plain" text format:
//   Chapter <N>
//   (blank line)
//   <verse> <text, possibly wrapped across following lines>
//   <verse> <text...>
//   ...
// A line starting with a chapter/verse number begins a new unit; any other
// non-blank line is a continuation of the previous verse's text.
function parsePeshittaPlain(raw) {
  const chapters = [];
  let curChapter = null;
  let curVerse = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const chapterMatch = line.match(/^Chapter\s+(\d+)\s*$/i);
    if (chapterMatch) {
      curChapter = { chapter: Number(chapterMatch[1]), verses: [] };
      chapters.push(curChapter);
      curVerse = null;
      continue;
    }
    if (!curChapter) continue; // stray content before the first chapter header

    const verseMatch = line.match(/^(\d+)\s+(.*)$/);
    if (verseMatch) {
      curVerse = { verse: Number(verseMatch[1]), text: verseMatch[2] };
      curChapter.verses.push(curVerse);
    } else if (curVerse) {
      curVerse.text += ' ' + line;
    }
  }

  for (const ch of chapters) {
    for (const v of ch.verses) v.text = v.text.replace(/\s+/g, ' ').trim();
  }
  return chapters.filter((c) => c.verses.length > 0);
}

module.exports = { parsePeshittaPlain };
