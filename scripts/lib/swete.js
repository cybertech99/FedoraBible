// Parser for the nathans/lxx-swete word-per-line format:
//   <bookIndex>.<chapter>.<verse> <word>
// one Greek word (with its trailing punctuation) per line; verse text is
// reconstructed by joining consecutive words that share a chapter.verse key.
function parseSwete(raw) {
  const chapters = [];
  let curChapter = null;
  let curVerse = null;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(/^\d+\.(\d+)\.(\d+)\s+(.+)$/);
    if (!m) continue;
    const chapterNum = Number(m[1]);
    const verseNum = Number(m[2]);
    const word = m[3].trim();

    if (!curChapter || curChapter.chapter !== chapterNum) {
      // A few chapters (mostly in Psalms) repeat a verse number for trailing
      // liturgical material (e.g. a diapsalma); fold it into the existing
      // verse of that chapter instead of starting a fresh one.
      curChapter = chapters.find((c) => c.chapter === chapterNum) || { chapter: chapterNum, verses: [] };
      if (chapters[chapters.length - 1] !== curChapter) chapters.push(curChapter);
      curVerse = null;
    }
    const existing = curChapter.verses.find((v) => v.verse === verseNum);
    if (existing) {
      existing.text += ' ' + word;
      curVerse = existing;
    } else {
      curVerse = { verse: verseNum, text: word };
      curChapter.verses.push(curVerse);
    }
  }
  return chapters;
}

module.exports = { parseSwete };
