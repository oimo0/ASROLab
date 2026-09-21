const STATUS_VALUES = new Set(['experimental', 'beta', 'stable', 'archived']);

const safeText = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;

export function normalizeTool(raw, index = 0) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const status = safeText(source.status, 'experimental').toLowerCase();
  return {
    ...source,
    id: safeText(source.id, `tool-${index + 1}`),
    name: safeText(source.name, 'Untitled Tool'),
    description: safeText(source.description, 'ASRO Labで実験中のツールです。'),
    status: STATUS_VALUES.has(status) ? status : 'experimental',
    category: safeText(source.category, 'Utility'),
    tags: Array.isArray(source.tags) ? source.tags.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).slice(0, 12) : [],
    url: safeText(source.url, '#'),
    thumbnailUrl: safeText(source.thumbnailUrl, '') || null,
    added: safeText(source.added, '') || null,
    sample: source.sample === true,
    featured: source.featured === true,
  };
}

export async function fetchTools({ signal } = {}) {
  const response = await fetch(`data/tools.json?v=${Date.now()}`, { cache: 'no-store', signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`tools.json returned HTTP ${response.status}`);
  const payload = await response.json();
  const items = Array.isArray(payload) ? payload : payload?.tools;
  if (!Array.isArray(items)) throw new TypeError('tools.json must contain a tools array');
  return items.map(normalizeTool).filter(tool => tool.url && tool.url !== '#');
}

export function isNewTool(tool, days = 21, now = new Date()) {
  if (!tool?.added) return false;
  const added = new Date(`${tool.added}T00:00:00Z`);
  if (Number.isNaN(added.getTime())) return false;
  const age = now.getTime() - added.getTime();
  return age >= 0 && age <= days * 86400000;
}

export function sortTools(tools) {
  return [...tools].sort((a, b) => {
    const archived = Number(a.status === 'archived') - Number(b.status === 'archived');
    if (archived) return archived;
    const featured = Number(b.featured) - Number(a.featured);
    if (featured) return featured;
    const da = a.added ? Date.parse(`${a.added}T00:00:00Z`) : 0;
    const db = b.added ? Date.parse(`${b.added}T00:00:00Z`) : 0;
    return db - da || a.name.localeCompare(b.name, 'ja');
  });
}
