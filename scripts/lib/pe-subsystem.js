// Flips a Windows PE executable's "Subsystem" field from CONSOLE (3) to
// WINDOWS (2), so double-clicking it never allocates a console window.
// This is a well-known technique (used by several Node packaging tools) —
// the loader-visible difference between the two subsystems is essentially
// just "allocate a console before running", so a console app tolerates the
// flip fine as long as it stops relying on having a console (see server.js's
// file-based logging, added alongside this).
//
// Subsystem lives at a fixed offset (68) into the PE Optional Header for
// both PE32 and PE32+ images: e_lfanew + 4 (PE signature) + 20 (COFF header)
// + 68 = e_lfanew + 92.
const fs = require('node:fs');

const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;
const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3;

function patchToWindowsSubsystem(exePath) {
  const buf = fs.readFileSync(exePath);

  if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error('Not a valid PE file (missing MZ signature).');
  const peOffset = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOffset) !== 0x00004550) throw new Error('Not a valid PE file (missing PE\\0\\0 signature).');

  const optHeaderOffset = peOffset + 4 + 20;
  const magic = buf.readUInt16LE(optHeaderOffset);
  if (magic !== 0x10b && magic !== 0x20b) {
    throw new Error(`Unrecognized Optional Header magic 0x${magic.toString(16)} (expected PE32 or PE32+).`);
  }

  const subsystemOffset = optHeaderOffset + 68;
  const current = buf.readUInt16LE(subsystemOffset);
  if (current !== IMAGE_SUBSYSTEM_WINDOWS_CUI) {
    throw new Error(`Subsystem field is ${current}, not the expected CONSOLE (3) — refusing to touch it.`);
  }

  buf.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, subsystemOffset);
  fs.writeFileSync(exePath, buf);
}

module.exports = { patchToWindowsSubsystem };
