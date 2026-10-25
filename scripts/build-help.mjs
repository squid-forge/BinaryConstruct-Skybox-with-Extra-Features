import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';

// Build local help from the maintained guides without a runtime documentation dependency.
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const inline = s => escape(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, path) => {
    const href = path.startsWith('LICENSES/') ? 'licenses/' + path.slice(9) : path === 'THIRD_PARTY_NOTICES.txt' ? 'licenses/THIRD_PARTY_NOTICES.txt' : /^https?:\/\//.test(path) ? path : path.startsWith('public/') ? path.slice(7) : path.includes('CREDITS') ? '#credits' : path.includes('LICENSE') ? 'LICENSE.txt'
      : path.includes('ELEMENT-RESOLUTION') ? '#element-detail-and-output-resolution' : path.includes('EXPORTS') ? '#exports-hdr-smoothness-and-large-files' : '#using-binaryconstruct-skybox--extra-features';
    return `<a href="${href}">${label}</a>`;
  });
function render(markdown) {
  let code = false, table = false, body = false;
  const output = [];
  const closeTable = () => {
    if (table) output.push(body ? '</tbody></table></div>' : '</table></div>');
    table = body = false;
  };
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.startsWith('```')) { closeTable(); code = !code; output.push(code ? '<pre><code>' : '</code></pre>'); continue; }
    if (code) { output.push(escape(line)); continue; }
    if (line.startsWith('|')) {
      if (/^\|[ :|-]+$/.test(line)) continue;
      const cells = line.replace(/^\||\|$/g, '').split('|').map(cell => inline(cell.trim()));
      if (!table) { output.push('<div class="table-scroll"><table><thead><tr>' + cells.map(cell => `<th>${cell}</th>`).join('') + '</tr></thead>'); table = true; }
      else { if (!body) { output.push('<tbody>'); body = true; } output.push('<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>'); }
      continue;
    }
    closeTable();
    const heading = /^(#{1,6}) (.+)$/.exec(line);
    if (heading) {
      let id = heading[2].toLowerCase().replace(/[^a-z0-9 ]/g, '').replaceAll(' ', '-');
      if (id === 'credits' && heading[1].length > 1) id = 'usage-credits';
      output.push(`<h${heading[1].length} id="${id}">${inline(heading[2])}</h${heading[1].length}>`);
    } else if (line.trim()) output.push(`<p>${inline(line.replace(/^- /, '\u2022 '))}</p>`);
  }
  closeTable();
  return output.join('\n');
}
const guides = await Promise.all(['Docs/Instructions/USAGE.md', 'Docs/Instructions/EXPORTS.md', 'Docs/Design/ELEMENT-RESOLUTION.md', 'CREDITS.md'].map(p => readFile(p, 'utf8')));
await mkdir('public', { recursive: true });
await writeFile('public/help.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BinaryConstruct Skybox + Extra Features - Help and credits</title><style>body{max-width:900px;margin:36px auto;padding:0 20px;background:#11161e;color:#dce5ef;font:16px/1.65 system-ui}a{color:#9dc8ff}h1,h2{line-height:1.25;scroll-margin-top:24px}h1{margin-top:60px}code{background:#202b39;padding:2px 5px;border-radius:3px}pre{padding:12px;background:#202b39;overflow:auto}pre code{padding:0}nav{display:flex;flex-wrap:wrap;gap:12px 20px}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:8px;border:1px solid #354052}th{background:#202b39}</style><nav><a href="./">Editor</a><a href="#using-binaryconstruct-skybox--extra-features">Usage</a><a href="#exports-hdr-smoothness-and-large-files">Exports</a><a href="#element-detail-and-output-resolution">Element detail</a><a href="#credits">Credits</a><a href="LICENSE.txt">MIT License</a></nav><main>${guides.map(render).join('\n')}</main></html>\n`);
await copyFile('LICENSE', 'public/LICENSE.txt');
