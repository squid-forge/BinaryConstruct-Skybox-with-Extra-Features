import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, relative, extname, join, sep } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve('.');
const git = args => execFileSync('git', ['-c', `safe.directory=${root}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let paths;
try {
  // Read the real index without changing it; also inspect untracked source.
  paths = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
} catch {
  // Source ZIPs have no .git. Evaluate their ignore rules in disposable OS
  // temporary metadata rather than leaving another repository in the project.
  const temporaryGit = mkdtempSync(join(tmpdir(), 'skybox-publication-'));
  if (!resolve(temporaryGit).startsWith(resolve(tmpdir()) + sep + 'skybox-publication-')) throw Error('Unexpected temporary audit path');
  try {
    git(['init', '--bare', temporaryGit]);
    paths = git([`--git-dir=${temporaryGit}`, `--work-tree=${root}`, 'ls-files', '--others', '--exclude-standard', '-z']);
  } finally {
    rmSync(temporaryGit, { recursive: true, force: true });
  }
}
paths = [...new Set(paths.split('\0').filter(Boolean))].sort();
const published = new Set(paths), issues = [], manifest = [];
const sensitive = /(?:^|\/)(?:\.env(?:\..*)?|id_rsa|id_ed25519|credentials|[^/]+\.(?:pem|p12|pfx|key))$/i;
const secret = /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/;
for (const path of paths) {
  const bytes = await readFile(path);
  const type = path.startsWith('src/') ? 'source/test' : path.startsWith('public/') ? 'runtime asset/notice' : path.startsWith('Docs/') ? 'documentation/evidence' : path.startsWith('presets/') ? 'preset' : 'build/configuration/notice';
  manifest.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), type });
  if (!bytes.length) issues.push({ path, issue: 'Empty file' });
  if (bytes.length > 5 * 1024 * 1024) issues.push({ path, issue: 'Exceeds 5 MiB publication policy; keep generated large exports local' });
  if (sensitive.test(path) && !path.endsWith('.env.example')) issues.push({ path, issue: 'Sensitive filename' });
  if (['.md', '.txt', '.json', '.ts', '.tsx', '.mjs', '.yml', '.toml', '.xml', '.html'].includes(extname(path))) {
    const text = bytes.toString('utf8');
    if (secret.test(text)) issues.push({ path, issue: 'Possible credential/private-key signature' });
    if (/[A-Za-z]:[\\/]Users[\\/][^\s/\\]+/.test(text)) issues.push({ path, issue: 'Private workstation user path' });
    if (path.endsWith('.md')) {
      const prose = text.replace(/```[\s\S]*?```/g, '');
      for (const match of prose.matchAll(/\]\(([^)]+)\)/g)) {
        const href = match[1].split(' "')[0].replace(/^<|>$/g, '');
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue;
        const target = resolve(dirname(resolve(path)), decodeURIComponent(href.split('#')[0]));
        const targetPath = relative(root, target).replaceAll('\\', '/');
        const exists = published.has(targetPath) || paths.some(p => p.startsWith(targetPath + '/'));
        if (!exists) issues.push({ path, issue: `Missing or excluded documentation target: ${href}` });
      }
    }
  }
}
for (const required of ['LICENSE', 'LICENSING.md', 'CREDITS.md', 'LICENSES/SPACESCAPE-MIT.txt', 'LICENSES/HYG-CC-BY-SA-2.5.txt', 'public/masks/smoke/LICENSE.txt', 'public/masks/smoke/provenance.json', 'THIRD_PARTY_NOTICES.txt']) {
  if (!published.has(required)) issues.push({ path: required, issue: 'Required notice is excluded/missing' });
}
const total = manifest.reduce((n, f) => n + f.bytes, 0);
console.log(JSON.stringify({ files: paths.length, totalMiB: +(total / 1048576).toFixed(2), issues }, null, 2));
if (issues.length) process.exitCode = 1;
