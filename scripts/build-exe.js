// Builds a standalone Windows launcher: FedoraBible.exe + a `data/` and
// `public/` folder next to it (a portable app folder, not a single-file
// bundle — the SQLite DB and static assets stay on disk rather than being
// embedded, which keeps this build simple and keeps `data/bible.db`
// trivially replaceable/upgradable without rebuilding the exe).
//
// Usage: npm run build:exe
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { patchToWindowsSubsystem } = require('./lib/pe-subsystem');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RELEASE = path.join(ROOT, 'release');
const EXE_NAME = 'FedoraBible.exe';

function run(cmd, args, opts = {}) {
  console.log('>', cmd, args.join(' '));
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function main() {
  const dbPath = path.join(ROOT, 'data', 'bible.db');
  if (!fs.existsSync(dbPath)) {
    console.error('data/bible.db not found. Run "npm run setup" first, then retry.');
    process.exit(1);
  }

  // Only remove what this script itself produces — never the whole release/
  // folder. It also holds .browser-profile/ (Edge/Chrome's own runtime
  // profile data, created on first launch) and FedoraBible.log, both of
  // which are fine to carry over between rebuilds and can be locked by a
  // still-running or just-closed browser process, which would otherwise
  // make a full-folder wipe fail.
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.rmSync(path.join(RELEASE, EXE_NAME), { force: true });
  fs.rmSync(path.join(RELEASE, 'public'), { recursive: true, force: true });
  fs.rmSync(path.join(RELEASE, 'data'), { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  fs.mkdirSync(RELEASE, { recursive: true });

  console.log('\n1. Bundling server.js + dependencies with esbuild...');
  run('node', [
    require.resolve('esbuild/bin/esbuild'),
    'server.js',
    '--bundle', '--platform=node', '--target=node22', '--format=cjs',
    '--outfile=dist/server.bundle.js',
  ]);

  console.log('\n2. Generating the SEA blob...');
  run(process.execPath, ['--experimental-sea-config', 'sea-config.json']);

  console.log('\n3. Copying the Node runtime as the base executable...');
  const exePath = path.join(RELEASE, EXE_NAME);
  fs.copyFileSync(process.execPath, exePath);

  console.log('\n4. Removing the Node binary\'s code signature (required before injection)...');
  try {
    run('signtool', ['remove', '/s', exePath]);
  } catch {
    console.warn('   signtool not available or failed — continuing without stripping a signature.');
    console.warn('   (Node.js Windows builds are usually unsigned in practice; this is normally fine.)');
  }

  console.log('\n5. Injecting the app blob into the executable with postject...');
  run(process.execPath, [
    require.resolve('postject/dist/cli.js'),
    exePath, 'NODE_SEA_BLOB', 'dist/sea-prep.blob',
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ]);

  console.log('\n6. Hiding the console window (flipping the PE subsystem to GUI)...');
  try {
    patchToWindowsSubsystem(exePath);
    console.log('   Done — launching the .exe will no longer show a console window.');
  } catch (err) {
    console.warn(`   Skipped: ${err.message}`);
    console.warn('   The .exe will still work, just with a visible console window.');
  }

  console.log('\n7. Copying public/ and data/bible.db into release/...');
  fs.cpSync(path.join(ROOT, 'public'), path.join(RELEASE, 'public'), { recursive: true });
  fs.mkdirSync(path.join(RELEASE, 'data'), { recursive: true });
  fs.copyFileSync(dbPath, path.join(RELEASE, 'data', 'bible.db'));

  console.log(`\nDone. Run release\\${EXE_NAME} to launch FedoraBible.`);
  console.log('The release/ folder (exe + data/ + public/) is what you distribute — keep them together.');
  console.log('If anything goes wrong at launch, check release/FedoraBible.log.');
}

main();
