import { fetchTools, isNewTool, sortTools } from './data.js';

const state = { tools: [], query: '', category: 'all', showArchived: false, controller: null };
const $ = (s) => document.querySelector(s);
const els = {
  grid: $('[data-tool-grid]'), template: $('#tool-card-template'), categories: $('[data-categories]'), search: $('[data-search]'),
  archive: $('[data-archive-toggle]'), skeleton: $('[data-skeleton]'), empty: $('[data-empty]'), noResults: $('[data-no-results]'),
  error: $('[data-error]'), result: $('[data-result-summary]'), retry: $('[data-retry]'), reset: $('[data-reset-filters]'),
  theme: $('[data-theme-toggle]'), header: $('[data-header]'), console: $('[data-console-message]')
};
const labels = { experimental: 'Experimental', beta: 'Beta', stable: 'Stable', archived: 'Archived' };
const categoryLabels = { image: 'Image', developer: 'Developer', ai: 'AI', study: 'Study', utility: 'Utility', experimental: 'Experimental' };
const norm = v => String(v || '').normalize('NFKC').toLocaleLowerCase('ja').trim();

function visibleTools() {
  const q = norm(state.query);
  return state.tools.filter(tool => {
    if (!state.showArchived && tool.status === 'archived') return false;
    if (state.category !== 'all' && norm(tool.category) !== norm(state.category)) return false;
    if (q && !norm([tool.name, tool.description, tool.category, ...tool.tags].join(' ')).includes(q)) return false;
    return true;
  });
}

function setView(mode) {
  els.skeleton.hidden = mode !== 'loading';
  els.grid.hidden = !['ready', 'empty'].includes(mode);
  els.empty.hidden = mode !== 'empty';
  els.noResults.hidden = mode !== 'no-results';
  els.error.hidden = mode !== 'error';
}

function renderMetrics() {
  const active = state.tools.filter(t => t.status !== 'archived');
  const cats = new Set(active.map(t => norm(t.category)));
  $('[data-tool-count]').textContent = String(active.length).padStart(2, '0');
  $('[data-category-count]').textContent = String(cats.size).padStart(2, '0');
  $('[data-new-count]').textContent = String(active.filter(isNewTool).length).padStart(2, '0');
  $('[data-build-state]').textContent = 'READY';
  els.console.textContent = active.length ? `${active.length} experiment${active.length === 1 ? "" : "s"} available.` : 'Waiting for the first experiment.';
}

function renderCategories() {
  const categories = [...new Set(state.tools.filter(t => t.status !== 'archived').map(t => t.category))].sort((a,b) => a.localeCompare(b,'ja'));
  const values = ['all', ...categories];
  els.categories.replaceChildren(...values.map(value => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'category-chip'; b.dataset.category = value;
    b.setAttribute('aria-pressed', String(norm(state.category) === norm(value)));
    b.textContent = norm(value) === 'all' ? 'All' : (categoryLabels[norm(value)] || value);
    b.addEventListener('click', () => { state.category = value; renderCategories(); paint(); });
    return b;
  }));
}

function renderCard(tool, index) {
  const card = els.template.content.firstElementChild.cloneNode(true);
  card.dataset.status = tool.status; card.style.setProperty('--i', index);
  const link = card.querySelector('.tool-card-link'); link.href = tool.url; link.setAttribute('aria-label', `${tool.name}を開く`);
  card.querySelector('.tool-name').textContent = tool.name;
  card.querySelector('.tool-description').textContent = tool.description;
  card.querySelector('.tool-category').textContent = categoryLabels[norm(tool.category)] || tool.category;
  card.querySelector('[data-status-label]').textContent = labels[tool.status] || 'Experimental';
  card.querySelector('.badge-new').hidden = !isNewTool(tool);
  card.querySelector('.badge-sample').hidden = !tool.sample;
  const tags = card.querySelector('.tool-tags');
  tool.tags.slice(0,3).forEach(tag => { const s = document.createElement('span'); s.textContent = tag; tags.append(s); });
  if (!tool.tags.length) tags.hidden = true;
  const img = card.querySelector('.tool-thumbnail'), fallback = card.querySelector('.thumbnail-fallback');
  if (tool.thumbnailUrl) {
    img.src = tool.thumbnailUrl; img.alt = `${tool.name}のサムネイル`;
    img.addEventListener('load', () => { img.classList.add('is-loaded'); fallback.hidden = true; }, { once: true });
    img.addEventListener('error', () => { img.hidden = true; fallback.hidden = false; }, { once: true });
  } else img.hidden = true;
  requestAnimationFrame(() => card.classList.add('is-visible'));
  return card;
}

function paint() {
  const tools = visibleTools();
  els.grid.replaceChildren(...tools.map(renderCard));
  if (!state.tools.length) {
    els.result.textContent = '0 tools · first slot open'; setView('empty');
    els.search.disabled = true; els.archive.disabled = true;
  } else {
    els.search.disabled = false; els.archive.disabled = false;
    els.result.textContent = `${tools.length} tool${tools.length === 1 ? "" : "s"}${state.category !== "all" ? ` · ${state.category}` : ""}`;
    setView(tools.length ? 'ready' : 'no-results');
  }
}

async function load() {
  state.controller?.abort(); state.controller = new AbortController(); setView('loading');
  try {
    state.tools = sortTools(await fetchTools({ signal: state.controller.signal }));
    renderMetrics(); renderCategories(); paint();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.error('[ASRO Lab]', error); $('[data-build-state]').textContent = 'ERROR'; els.result.textContent = 'Index unavailable'; setView('error');
  }
}

function installTheme() {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const apply = mode => {
    const resolved = mode === 'auto' ? (mq.matches ? 'dark' : 'light') : mode;
    document.documentElement.dataset.theme = mode; document.documentElement.dataset.resolvedTheme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#080b12' : '#f5f7fb');
  };
  els.theme.addEventListener('click', () => {
    const next = document.documentElement.dataset.resolvedTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('asro-lab-theme', next); apply(next);
  });
  mq.addEventListener?.('change', () => { if ((localStorage.getItem('asro-lab-theme') || 'auto') === 'auto') apply('auto'); });
}

function installReveal() {
  const items = [...document.querySelectorAll('[data-reveal]')];
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { items.forEach(x => x.classList.add('is-revealed')); return; }
  const obs = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-revealed'); obs.unobserve(e.target); } }), { threshold: .08, rootMargin: '80px 0px' });
  items.forEach(x => obs.observe(x));
}

function boot() {
  $('[data-year]').textContent = new Date().getFullYear(); installTheme(); installReveal();
  addEventListener('scroll', () => els.header.classList.toggle('is-scrolled', scrollY > 10), { passive: true });
  let timer; els.search.addEventListener('input', e => { state.query = e.currentTarget.value; clearTimeout(timer); timer = setTimeout(paint, 90); });
  document.addEventListener('keydown', e => { if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); if (!els.search.disabled) els.search.focus(); } });
  els.archive.addEventListener('click', () => { state.showArchived = !state.showArchived; els.archive.setAttribute('aria-pressed', String(state.showArchived)); paint(); });
  els.reset.addEventListener('click', () => { state.query = ''; state.category = 'all'; state.showArchived = false; els.search.value = ''; els.archive.setAttribute('aria-pressed','false'); renderCategories(); paint(); });
  els.retry.addEventListener('click', load); load();
}
boot();
