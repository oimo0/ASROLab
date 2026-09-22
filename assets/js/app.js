import { fetchTools, isNewTool, sortTools } from './data.js';

const state={tools:[],query:'',category:'all',showArchived:false,controller:null};
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const els={
  grid:$('[data-tool-grid]'),template:$('#tool-card-template'),categories:$('[data-categories]'),search:$('[data-search]'),
  heroSearch:$('[data-hero-search]'),archive:$('[data-archive-toggle]'),skeleton:$('[data-skeleton]'),empty:$('[data-empty]'),
  noResults:$('[data-no-results]'),error:$('[data-error]'),result:$('[data-result-summary]'),retry:$('[data-retry]'),
  reset:$('[data-reset-filters]'),theme:$('[data-theme-toggle]'),header:$('[data-header]'),focusSearch:$('[data-focus-search]')
};
const labels={experimental:'Experimental',beta:'Beta',stable:'Stable',archived:'Archived'};
const categoryLabels={image:'Image',developer:'Developer',ai:'AI',study:'Study',utility:'Utility',experimental:'Experimental'};
const norm=v=>String(v||'').normalize('NFKC').toLocaleLowerCase('ja').trim();

function visible(){
  const q=norm(state.query);
  return state.tools.filter(t=>{
    if(!state.showArchived&&t.status==='archived')return false;
    if(state.category!=='all'&&norm(t.category)!==norm(state.category))return false;
    if(q&&!norm([t.name,t.description,t.category,...t.tags].join(' ')).includes(q))return false;
    return true;
  });
}
function setView(mode){
  els.skeleton.hidden=mode!=='loading';
  els.grid.hidden=!['ready','empty'].includes(mode);
  els.empty.hidden=mode!=='empty';
  els.noResults.hidden=mode!=='no-results';
  els.error.hidden=mode!=='error';
}
function updateMetrics(){
  const active=state.tools.filter(t=>t.status!=='archived');
  const categories=[...new Set(active.map(t=>norm(t.category)).filter(Boolean))];
  const fresh=active.filter(t=>isNewTool(t)).length;
  $$('[data-tool-count]').forEach(x=>x.textContent=String(active.length).padStart(2,'0'));
  $$('[data-category-count]').forEach(x=>x.textContent=String(categories.length).padStart(2,'0'));
  $$('[data-new-count]').forEach(x=>x.textContent=String(fresh).padStart(2,'0'));
  $$('[data-side-tool-count]').forEach(x=>x.textContent=String(active.length));
  $$('[data-side-category-count]').forEach(x=>x.textContent=String(categories.length));
  document.body.classList.toggle('has-tools',active.length>0);
}
function setCategory(value){
  state.category=value;
  renderCategories();
  updateQuickCategories();
  paint();
  document.querySelector('#tools')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function updateQuickCategories(){
  $$('[data-category-shortcut]').forEach(b=>b.classList.toggle('is-active',norm(b.dataset.categoryShortcut)===norm(state.category)));
}
function renderCategories(){
  const cats=[...new Set(state.tools.filter(t=>t.status!=='archived').map(t=>t.category))].sort((a,b)=>a.localeCompare(b,'ja'));
  els.categories.replaceChildren(...['all',...cats].map(v=>{
    const b=document.createElement('button');
    b.type='button';b.className='category-chip';
    b.setAttribute('aria-pressed',String(norm(state.category)===norm(v)));
    b.textContent=norm(v)==='all'?'All':(categoryLabels[norm(v)]||v);
    b.addEventListener('click',()=>setCategory(v));
    return b;
  }));
}
function renderCard(tool){
  const card=els.template.content.firstElementChild.cloneNode(true);
  card.dataset.status=tool.status;
  const link=card.querySelector('.tool-card-link');
  link.href=tool.url;link.setAttribute('aria-label',tool.name+'を開く');
  card.querySelector('.tool-name').textContent=tool.name;
  card.querySelector('.tool-description').textContent=tool.description;
  card.querySelector('.tool-category').textContent=categoryLabels[norm(tool.category)]||tool.category;
  card.querySelector('[data-status-label]').textContent=labels[tool.status]||'Experimental';
  card.querySelector('.badge-new').hidden=!isNewTool(tool);
  card.querySelector('.badge-sample').hidden=!tool.sample;
  const tags=card.querySelector('.tool-tags');
  tool.tags.slice(0,3).forEach(tag=>{const s=document.createElement('span');s.textContent=tag;tags.append(s)});
  if(!tool.tags.length)tags.hidden=true;
  const img=card.querySelector('.tool-thumbnail'),fb=card.querySelector('.thumb-fallback');
  if(tool.thumbnailUrl){
    img.src=tool.thumbnailUrl;img.alt=tool.name+'のサムネイル';
    img.addEventListener('load',()=>{img.classList.add('is-loaded');fb.hidden=true},{once:true});
    img.addEventListener('error',()=>{img.hidden=true;fb.hidden=false},{once:true});
  }else img.hidden=true;
  requestAnimationFrame(()=>card.classList.add('is-visible'));
  return card;
}
function paint(){
  const tools=visible();
  els.grid.replaceChildren(...tools.map(renderCard));
  if(!state.tools.length){els.result.textContent='0 tools';setView('empty')}
  else{els.result.textContent=tools.length+' tool'+(tools.length===1?'':'s');setView(tools.length?'ready':'no-results')}
}
async function load(){
  state.controller?.abort();state.controller=new AbortController();setView('loading');
  try{
    state.tools=sortTools(await fetchTools({signal:state.controller.signal}));
    updateMetrics();renderCategories();updateQuickCategories();paint();
  }catch(e){
    if(e?.name==='AbortError')return;
    console.error('[ASRO Lab]',e);els.result.textContent='Unavailable';setView('error');
  }
}
function setQuery(value,source){
  state.query=value;
  if(source!==els.search)els.search.value=value;
  if(source!==els.heroSearch)els.heroSearch.value=value;
  paint();
}
function installTheme(){
  const mq=matchMedia('(prefers-color-scheme: dark)');
  const apply=mode=>{
    const r=mode==='auto'?(mq.matches?'dark':'light'):mode;
    document.documentElement.dataset.theme=mode;
    document.documentElement.dataset.resolvedTheme=r;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',r==='dark'?'#080a0d':'#f7f8fb');
  };
  els.theme.addEventListener('click',()=>{
    const next=document.documentElement.dataset.resolvedTheme==='dark'?'light':'dark';
    localStorage.setItem('asro-lab-theme',next);apply(next);
  });
  mq.addEventListener?.('change',()=>{if((localStorage.getItem('asro-lab-theme')||'auto')==='auto')apply('auto')});
}
function installReveal(){
  const items=$$('[data-reveal]');
  if(!('IntersectionObserver'in window)||matchMedia('(prefers-reduced-motion: reduce)').matches){items.forEach(x=>x.classList.add('is-revealed'));return}
  const o=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-revealed');o.unobserve(e.target)}}),{threshold:.06,rootMargin:'80px 0px'});
  items.forEach(x=>o.observe(x));
}
function boot(){
  $('[data-year]').textContent=new Date().getFullYear();
  installTheme();installReveal();
  addEventListener('scroll',()=>els.header.classList.toggle('is-scrolled',scrollY>10),{passive:true});
  let timer;
  [els.search,els.heroSearch].filter(Boolean).forEach(input=>input.addEventListener('input',e=>{
    clearTimeout(timer);timer=setTimeout(()=>setQuery(e.currentTarget.value,e.currentTarget),70);
  }));
  els.focusSearch?.addEventListener('click',()=>{els.heroSearch?.focus();document.querySelector('#home')?.scrollIntoView({behavior:'smooth',block:'start'})});
  $$('[data-category-shortcut]').forEach(b=>b.addEventListener('click',()=>setCategory(b.dataset.categoryShortcut)));
  els.archive.addEventListener('click',()=>{state.showArchived=!state.showArchived;els.archive.setAttribute('aria-pressed',String(state.showArchived));paint()});
  els.reset.addEventListener('click',()=>{state.query='';state.category='all';state.showArchived=false;els.search.value='';if(els.heroSearch)els.heroSearch.value='';els.archive.setAttribute('aria-pressed','false');renderCategories();updateQuickCategories();paint()});
  els.retry.addEventListener('click',load);
  addEventListener('keydown',e=>{if(e.key==='/'&&!/input|textarea|select/i.test(document.activeElement?.tagName||'')){e.preventDefault();els.heroSearch?.focus()}});
  load();
}
boot();
