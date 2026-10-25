import { readFile, readdir, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const packages = [], texts = new Map();
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/')) continue;
  let metadata;
  try { metadata = JSON.parse(await readFile(`${path}/package.json`, 'utf8')); }
  catch { continue; } // Optional binaries for other platforms are not installed/bundled.
  let directory = path;
  if (metadata.name.startsWith('@oxlint/binding-')) directory = 'node_modules/oxlint';
  if (metadata.name.startsWith('@rolldown/binding-')) directory = 'node_modules/rolldown';
  const files = (await readdir(directory)).filter(name => /^(licen[cs]e|notice|third[-_]?party[-_]?(?:notice|license)|copyright)(?:[.\-_]|$)/i.test(name));
  if (!files.length && !entry.dev) throw Error(`Missing runtime license text for ${metadata.name}`);
  const refs = [];
  for (const file of files.sort()) {
    let contents;
    try { contents = (await readFile(`${directory}/${file}`, 'utf8')).replace(/\r\n/g, '\n').trim(); } catch { continue; }
    const id = createHash('sha256').update(contents).digest('hex').slice(0, 16);
    texts.set(id, contents); refs.push(id);
  }
  packages.push({ name: metadata.name, version: metadata.version, license: metadata.license ?? entry.license ?? 'See notice', development: entry.dev === true, notices: refs,
    ...(!refs.length ? { note: 'Development package declares this license in package.json but omits a separate text file; its code is not included in the distributed browser app.', author: metadata.author, repository: metadata.repository } : {}) });
}
packages.sort((a, b) => a.name.localeCompare(b.name));
const text = `Third-party dependency notices\nGenerated from installed locked packages. Includes development tools; this does not relicense them under MIT.\nOptional packages not installed on this platform are not bundled here.\n\n${packages.map(p => `${p.name}@${p.version} | ${p.license} | ${p.development ? 'development' : 'runtime/types'} | notices ${p.notices.join(', ')}${p.note ? '\n' + JSON.stringify({ note: p.note, author: p.author, repository: p.repository }) : ''}`).join('\n')}\n\n${[...texts].map(([id, text]) => `=== Notice ${id} ===\n${text}\n`).join('\n')}`;
await writeFile('THIRD_PARTY_NOTICES.txt', text);
await mkdir('public/licenses', { recursive: true });
await copyFile('THIRD_PARTY_NOTICES.txt', 'public/licenses/THIRD_PARTY_NOTICES.txt');
for (const file of await readdir('LICENSES')) await copyFile(`LICENSES/${file}`, `public/licenses/${file}`);
console.log(`License notices: ${packages.length} installed packages, ${texts.size} distinct texts`);
