import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const toolsDir = join(root, 'tools');
const output = join(root, 'data', 'tools.json');
const statuses = new Set(['experimental', 'beta', 'stable', 'archived']);
const warnings = [];

async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function folders() { if (!(await exists(toolsDir))) return []; return (await readdir(toolsDir, { withFileTypes: true })).filter(x => x.isDirectory() && !x.name.startsWith('_')).map(x => x.name); }

const tools = [];
for (const id of await folders()) {
  const dir = join(toolsDir, id), metaPath = join(dir, 'tool.json'), indexPath = join(dir, 'index.html');
  if (!(await exists(metaPath)) || !(await exists(indexPath))) { warnings.push(`${id}: index.html or tool.json missing`); continue; }
  try {
    const raw = JSON.parse(await readFile(metaPath, 'utf8'));
    const status = String(raw.status || 'experimental').toLowerCase();
    const thumb = typeof raw.thumbnail === 'string' && raw.thumbnail.trim() ? raw.thumbnail.trim() : null;
    tools.push({
      ...raw,
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
      description: typeof raw.description === 'string' ? raw.description.trim() : '',
      status: statuses.has(status) ? status : 'experimental',
      category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'Utility',
      tags: Array.isArray(raw.tags) ? raw.tags.filter(x => typeof x === 'string') : [],
      added: typeof raw.added === 'string' ? raw.added : null,
      url: `tools/${id}/`,
      thumbnailUrl: thumb && await exists(join(dir, thumb)) ? `tools/${id}/${thumb}` : null
    });
  } catch (e) { warnings.push(`${id}: ${e.message}`); }
}

tools.sort((a,b) => Number(b.featured) - Number(a.featured) || String(b.added || '').localeCompare(String(a.added || '')));
await writeFile(output, JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), tools }, null, 2) + '\n');
console.log(`Generated ${relative(root, output)} with ${tools.length} tool(s).`);
warnings.forEach(w => console.warn(`WARN ${w}`));
