import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const envDevPath = path.join(root, 'src', 'environments', 'environment.ts');
const envProdPath = path.join(root, 'src', 'environments', 'environment.prod.ts');
const publicDir = path.join(root, 'public');
const versionJsonPath = path.join(publicDir, 'version.json');
const versionTxtPath = path.join(publicDir, 'version.txt');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;

function patchEnv(filePath) {
  let src = fs.readFileSync(filePath, 'utf-8');
  // Replace appVersion: '...'
  if (!src.includes('appVersion')) {
    // Insert a new appVersion field after production/serviceWorker if missing
    src = src.replace(/(production:\s*[^,]+,\s*\n\s*serviceWorker:\s*[^,]+,?)/, `$1\n  appVersion: '${version}',`);
  } else {
    src = src.replace(/appVersion:\s*'[^']*'/, `appVersion: '${version}'`);
  }
  fs.writeFileSync(filePath, src);
  console.log(`[set-version] Updated ${path.relative(root, filePath)} -> ${version}`);
}

patchEnv(envDevPath);
patchEnv(envProdPath);
// Write lightweight version files for runtime polling (fallback when SW disabled)
try {
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(versionJsonPath, JSON.stringify({ version }, null, 2));
  fs.writeFileSync(versionTxtPath, version);
  console.log(`[set-version] Wrote public/version.json & version.txt -> ${version}`);
} catch (e) {
  console.warn('[set-version] Failed to write version assets', e);
}
