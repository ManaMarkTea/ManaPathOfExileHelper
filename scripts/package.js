// Wraps electron-builder to stamp each build with the date + short git commit hash it
// came from, e.g. "1.0.0_20260826.93ee4ac". package.json's own version stays a plain,
// human-bumped release number - this only affects what gets embedded in the built exe
// (via extraMetadata) so every artifact is traceable back to its exact source commit
// without anyone having to remember to bump anything on every push.

const { execSync, spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

function shortHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
  } catch (err) {
    return 'nogit';
  }
}

const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const buildVersion = `${pkg.version}_${date}.${shortHash()}`;

console.log(`Packaging as ${buildVersion}`);

const result = spawnSync(
  'npx',
  ['electron-builder', '--win', 'portable', `-c.extraMetadata.version=${buildVersion}`],
  { stdio: 'inherit', cwd: root, shell: true }
);

process.exit(result.status === null ? 1 : result.status);
