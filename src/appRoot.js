const path = require('node:path');
const { isSea } = require('node:sea');

// When running as a packaged Single Executable Application, __dirname isn't
// a real path on disk (the code lives inside the .exe), so data/ and public/
// are resolved relative to the .exe's own location instead. In normal dev
// (`node server.js`), __dirname still works as usual.
function getAppRoot() {
  if (isSea()) return path.dirname(process.execPath);
  return path.join(__dirname, '..');
}

module.exports = { getAppRoot };
