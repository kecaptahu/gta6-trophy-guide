const DATA_URL = 'data/trophies.json';
const PROGRESS_KEY = 'gta6-trophy-progress-v2';
const SPOILER_KEY = 'gta6-hide-story-spoilers';
let trophies = [], earned = new Set(), currentView = 'checklist';
const $ = id => document.getElementById(id);
const el = { grid:$('trophy-grid'), progress:$('progress'), grades:$('grade-progress'), search:$('search'), grade:$('grade'), kind:$('kind'), missable:$('missable'), spoilers:$('spoilers'), exportBtn:$('export'), importInput:$('import'), status:$('import-status') };
const STAGES = {1:'Early story',2:'Mid story',3:'Late story',4:'Post-game cleanup',5:'Collectibles mop-up',6:'Online'};
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label = g => g.charAt(0).toUpperCase()+g.slice(1);
const save = () => localStorage.setItem(PROGRESS_KEY, JSON.stringify([...earned]));
const hidden = t => el.spoilers.checked && t.kind === 'story' && !earned.has(t.name);

function sourceLink(source) {
  const [name, target] = String(source).split(' - ');
  const domains = {powerpyx:'powerpyx.com',psnprofiles:'psnprofiles.com',exophase:'exophase.com','playstation blog':'blog.playstation.com'};
  const url = (target || domains[name.trim().toLowerCase()] || '').trim();
  if (!url) return `<span>${esc(name)}</span>`;
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`;
}

function card(t) {
  const done = earned.has(t.name), hide = hidden(t);
  const sources = (t.sources || []).map(sourceLink).join(' · ');
  return `<article class="trophy-card ${done?'is-earned':''}">
    <div class="trophy-head"><label class="earn-control"><input class="earn-toggle" type="checkbox" data-id="${t.id}" ${done?'checked':''}> Done</label>
    <div class="badges"><span class="badge grade ${t.grade}">${label(t.grade)}</span><span class="badge">${esc(t.kind)}</span>${t.missable?'<span class="badge missable">MISSABLE</span>':''}</div></div>
    <h3>${esc(hide?'Hidden story trophy':t.name)}</h3>
    <p class="official-description">${esc(hide?'Earn this trophy to reveal its official description.':t.description)}</p>
    <div class="trophy-meta">Stage ${t.roadmap_stage} · ${STAGES[t.roadmap_stage]||'Guide'}</div>
    ${hide?'<p class="spoiler-note">Guide and sources unlock when earned.</p>':`<details class="guide-details"><summary>Read guide & sources</summary><p>${esc(t.guide)}</p><div class="sources">${sources}</div></details>`}
  </article>`;
}

function updateProgress() {
  el.progress.textContent = `${earned.size} / ${trophies.length} earned`;
  el.grades.innerHTML = ['platinum','gold','silver','bronze'].map(g => {
    const total = trophies.filter(t=>t.grade===g).length, done = trophies.filter(t=>t.grade===g&&earned.has(t.name)).length;
    return `<span class="grade-pill ${g}">${label(g)} ${done}/${total}</span>`;
  }).join('');
}
function filtered() {
  const q = el.search.value.trim().toLowerCase();
  return trophies.filter(t => (el.grade.value==='all'||t.grade===el.grade.value) && (el.kind.value==='all'||t.kind===el.kind.value) && (el.missable.value==='all'||(el.missable.value==='yes'?t.missable:!t.missable)) && (!q||`${t.name} ${t.description} ${t.guide}`.toLowerCase().includes(q))).sort((a,b)=>a.roadmap_stage-b.roadmap_stage||a.id-b.id);
}
function checklist() {
  const items = filtered();
  el.grid.innerHTML = items.length ? items.map(card).join('') : '<div class="empty-state">No trophies match these filters.</div>';
}
function roadmap() {
  const stages = [...new Set(trophies.map(t=>t.roadmap_stage))].sort((a,b)=>a-b);
  el.grid.innerHTML = stages.map(stage => {
    const items = trophies.filter(t=>t.roadmap_stage===stage), done = items.filter(t=>earned.has(t.name)).length;
    return `<section class="roadmap-stage"><div class="stage-heading"><div><span class="stage-number">STAGE ${stage}</span><h2>${STAGES[stage]}</h2></div><strong>${done}/${items.length}</strong></div><div class="stage-grid">${items.map(card).join('')}</div></section>`;
  }).join('');
}
function missables() {
  const items = trophies.filter(t=>t.missable).sort((a,b)=>a.roadmap_stage-b.roadmap_stage||a.id-b.id);
  el.grid.innerHTML = items.map(card).join('') || '<div class="empty-state">No missable trophies.</div>';
}
function setView(view) {
  currentView = view;
  document.querySelectorAll('[data-tab]').forEach(b => { const active=b.dataset.tab===view; b.classList.toggle('tab-active',active); b.setAttribute('aria-selected',active); });
  $('filter-panel').classList.toggle('filters-muted',view!=='checklist');
  if (view==='roadmap') roadmap(); else if (view==='missables') missables(); else checklist();
}
function render() { updateProgress(); setView(currentView); }
function toggle(id, checked) {
  const t = trophies.find(x=>x.id===Number(id)); if (!t) return;
  checked ? earned.add(t.name) : earned.delete(t.name); save(); render();
}
function exportProgress() {
  const data = JSON.stringify({app:'gta6-trophy-guide',version:1,earned:[...earned]},null,2);
  const url = URL.createObjectURL(new Blob([data],{type:'application/json'})), a = document.createElement('a');
  a.href=url; a.download='gta6-trophy-progress.json'; a.click(); URL.revokeObjectURL(url); el.status.textContent='Progress exported.';
}
async function importProgress(file) {
  if (!file) return;
  try {
    const data=JSON.parse(await file.text()), names=Array.isArray(data)?data:data.earned;
    if(!Array.isArray(names)) throw new Error('Expected an earned trophy array');
    const valid=new Set(trophies.map(t=>t.name)); earned=new Set(names.filter(n=>valid.has(n))); save();
    el.status.textContent=`Imported ${earned.size} earned trophies.`; el.status.className='status-success'; render();
  } catch(e) { el.status.textContent=`Import failed: ${e.message}`; el.status.className='status-error'; }
  finally { el.importInput.value=''; }
}
function bindEvents() {
  el.grid.addEventListener('change',e=>{if(e.target.matches('.earn-toggle')) toggle(e.target.dataset.id,e.target.checked);});
  [el.search,el.grade,el.kind,el.missable].forEach(c=>c.addEventListener(c===el.search?'input':'change',()=>setView('checklist')));
  el.spoilers.addEventListener('change',()=>{localStorage.setItem(SPOILER_KEY,el.spoilers.checked);render();});
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.tab)));
  el.exportBtn.addEventListener('click',exportProgress);
  el.importInput.addEventListener('change',()=>importProgress(el.importInput.files[0]));
}
async function init() {
  try {
    const saved=JSON.parse(localStorage.getItem(PROGRESS_KEY)||'[]'); earned=new Set(Array.isArray(saved)?saved:[]);
    el.spoilers.checked=localStorage.getItem(SPOILER_KEY)!=='false';
    const response=await fetch(DATA_URL); if(!response.ok) throw new Error(`Could not load data (${response.status})`);
    trophies=(await response.json()).trophies; bindEvents(); render();
  } catch(e) { el.grid.innerHTML=`<div class="empty-state">${esc(e.message)}</div>`; }
}
init();