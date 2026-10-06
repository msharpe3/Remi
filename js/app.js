import { normalizeIngredient, pantryCovers, isDisliked } from './normalize.js';
import * as mealdb from './mealdb.js';
import { createPlanner } from './plan.js';

// ---------- storage ----------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`remi:${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`remi:${key}`, JSON.stringify(value)); } catch { /* private mode or full */ }
  },
};

const DEFAULT_STAPLES = ['salt', 'black pepper', 'water', 'olive oil', 'vegetable oil', 'cooking spray'];
const QUICK_ADD = ['chicken', 'egg', 'rice', 'onion', 'garlic', 'potato', 'pasta', 'ground beef', 'tomato', 'cheese', 'carrot', 'butter', 'milk', 'bread'];
const PAGE = 40;

const COURSES = {
  m: 'Main dishes', b: 'Breakfast', u: 'Soups & stews', l: 'Salads', i: 'Sides',
  r: 'Breads', s: 'Desserts', c: 'Sauces & dips', n: 'Snacks', d: 'Drinks',
};
const TM_SOURCE = {
  name: 'TheMealDB',
  license: 'Shown live from TheMealDB',
  licenseUrl: 'https://www.themealdb.com/',
  home: 'https://www.themealdb.com/',
  credit: 'Live from TheMealDB. Not stored in Remi.',
};

const state = {
  index: null,
  indexStatus: 'loading', // loading | ready | missing | error
  byId: new Map(),
  titles: [],
  vocab: [],
  pantry: store.get('pantry', []),
  staples: store.get('staples', DEFAULT_STAPLES),
  saved: store.get('saved', {}),
  filters: store.get('filters', { course: '', veg: false, vegan: false, quick: false, protein: false }),
  shown: PAGE,
  chunks: new Map(),
  tm: new Map(),
  tab: 'cook',
  findQuery: '',
};

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US');
const view = $('#view');

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.5L6 21Z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

function sourceInfo(src) {
  if (src === 'tm') return TM_SOURCE;
  return state.index?.sources?.[src] || { name: 'Recipe source', credit: '' };
}

function expandImage(img, width) {
  if (!img) return '';
  const prefixes = { '~w': 'https://en.wikibooks.org/wiki/Special:FilePath/', '~m': 'https://myplate.food/', '~p': 'https://publicdomainrecipes.com/' };
  const code = img.slice(0, 2);
  if (prefixes[code]) return prefixes[code] + img.slice(2) + (code === '~w' ? `?width=${width}` : '');
  return img;
}

function saveState() {
  store.set('pantry', state.pantry);
  store.set('staples', state.staples);
  store.set('saved', state.saved);
  store.set('filters', state.filters);
}

// ---------- data ----------

async function loadIndex() {
  try {
    const res = await fetch('data/index.json', { cache: 'no-cache' });
    if (res.status === 404) { state.indexStatus = 'missing'; return; }
    if (!res.ok) throw new Error(res.status);
    const idx = await res.json();
    state.index = idx;
    state.vocab = idx.ings.map(([name]) => name);
    state.titles = idx.recipes.map((r) => r[1].toLowerCase());
    idx.recipes.forEach((r) => state.byId.set(r[0], r));
    state.indexStatus = 'ready';
    purgeOldRecipeFiles(idx.builtAt);
  } catch {
    state.indexStatus = state.index ? 'ready' : 'error';
  }
}

// After the library is rebuilt, drop recipe files cached from the old build.
function purgeOldRecipeFiles(builtAt) {
  if (!('caches' in window)) return;
  const v = `v=${encodeURIComponent(builtAt)}`;
  caches.open('remi-data').then(async (c) => {
    for (const req of await c.keys()) if (req.url.includes('/data/r/') && !req.url.includes(v)) c.delete(req);
  }).catch(() => {});
}

async function loadChunk(n) {
  if (!state.chunks.has(n)) {
    const v = encodeURIComponent(state.index?.builtAt || '');
    const p = fetch(`data/r/${n}.json?v=${v}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    state.chunks.set(n, p);
    p.catch(() => state.chunks.delete(n));
  }
  return state.chunks.get(n);
}

async function getRecipe(id) {
  // Saved recipes are kept whole on the phone, so they open instantly and offline.
  if (state.saved[id]?.full) return state.saved[id].full;
  if (id.startsWith('tm-')) {
    if (state.tm.has(id)) return state.tm.get(id);
    const r = await mealdb.lookup(id.slice(3));
    if (r) state.tm.set(id, r);
    return r;
  }
  const row = state.byId.get(id);
  if (!row) return null;
  const chunk = await loadChunk(row[3]);
  return chunk.find((r) => r.id === id) || null;
}

// ---------- matching ----------

// 2 = you said you have it, 1 = it's a staple, 0 = missing
function coverOf(name) {
  if (state.pantry.some((p) => pantryCovers(p, name))) return 2;
  if (state.staples.includes(name)) return 1;
  return 0;
}

let coverageCache = { key: '', arr: null };
function coverage() {
  const key = `${state.pantry.join('|')}#${state.staples.join('|')}#${state.vocab.length}`;
  if (coverageCache.key !== key) {
    const arr = new Uint8Array(state.vocab.length);
    state.vocab.forEach((name, i) => { arr[i] = coverOf(name); });
    coverageCache = { key, arr };
  }
  return coverageCache.arr;
}

function passesFilters(row) {
  const f = state.filters;
  if (f.course && row[9] !== f.course) return false;
  if (f.veg && !(row[8] & 1)) return false;
  if (f.vegan && !(row[8] & 2)) return false;
  if (f.quick && !(row[7] && row[7] <= 30)) return false;
  if (f.protein && !(row[6] != null && row[6] >= 20)) return false;
  return true;
}

function passesFiltersTm(r) {
  const f = state.filters;
  if (f.quick || f.protein) return false; // TheMealDB has no times or nutrition
  if (f.veg && !/vegetarian|vegan/i.test(r.cat)) return false;
  if (f.vegan && !/vegan/i.test(r.cat)) return false;
  return true;
}

// Foods you're "not a fan" of (set in Plan) are hidden here too.
const avoidList = () => store.get('plan:profile', null)?.avoid || [];
let dislikeCache = { key: null, mask: null };
function rowDisliked(row) {
  const avoid = avoidList();
  if (!avoid.length) return false;
  const key = `${avoid.join('|')}#${state.vocab.length}`;
  if (dislikeCache.key !== key) {
    const mask = new Uint8Array(state.vocab.length);
    state.vocab.forEach((name, i) => { if (isDisliked(avoid, [name])) mask[i] = 1; });
    dislikeCache = { key, mask };
  }
  return row[4].some((i) => dislikeCache.mask[i]) || isDisliked(avoid, [], row[1]);
}
const tmDisliked = (r) => isDisliked(avoidList(), r.names || [], r.t);
const hiddenNote = (n) => (n ? ` <span class="nope-note">Hiding ${fmt(n)} with foods you're not a fan of.</span>` : '');

function rankLocal() {
  if (!state.index || !state.pantry.length) return [];
  const cov = coverage();
  const out = [];
  let hidden = 0;
  for (const row of state.index.recipes) {
    if (!passesFilters(row)) continue;
    let have = 0;
    let usesPantry = false;
    for (const i of row[4]) {
      const c = cov[i];
      if (c) { have++; if (c === 2) usesPantry = true; }
    }
    if (!usesPantry) continue;
    if (rowDisliked(row)) { hidden++; continue; }
    out.push({ row, have, miss: row[4].length - have });
  }
  out.sort((a, b) => a.miss - b.miss || b.have - a.have || (b.row[8] & 4) - (a.row[8] & 4) || a.row[1].localeCompare(b.row[1]));
  out.hidden = hidden;
  return out;
}

// ---------- shared rendering ----------

function dotsHtml(states) {
  const sorted = [...states].sort((a, b) => b - a);
  return `<span class="dots" aria-hidden="true">${sorted.map((s) => `<i class="${s ? 'have' : ''}"></i>`).join('')}</span>`;
}

function thumbHtml(img, title) {
  return img
    ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'thumb',textContent:'${esc(title[0] || '?')}'}))">`
    : `<span class="thumb" aria-hidden="true">${esc(title[0] || '?')}</span>`;
}

function metaHtml(parts) {
  const list = parts.filter(Boolean);
  return list.length ? `<span class="meta">${list.map((p) => `<span>${esc(p)}</span>`).join('')}</span>` : '';
}

function cardFromRow(row, match) {
  const [id, title, src, , ings, kcal, protein, min] = row;
  const states = match ? ings.map((i) => coverage()[i]) : null;
  let missingLine = '';
  if (match) {
    const missing = ings.filter((i) => !coverage()[i]).map((i) => state.vocab[i]);
    missingLine = missing.length
      ? `<p class="missing">Missing <b>${missing.length}</b>: ${esc(missing.slice(0, 3).join(', '))}${missing.length > 3 ? '…' : ''}</p>`
      : '<p class="missing ok"><b>You have everything</b></p>';
  }
  return `<li><a class="card" href="#/r/${encodeURIComponent(id)}">
    ${thumbHtml(expandImage(row[10], 200), title)}
    <span>
      <h3>${esc(title)}</h3>
      ${states ? dotsHtml(states) : ''}
      ${metaHtml([min && `${min} min`, kcal != null && `${fmt(kcal)} cal`, protein != null && `${protein} g protein`, sourceInfo(src).name])}
      ${missingLine}
    </span>
  </a></li>`;
}

function cardFromTm(r, match) {
  const states = match ? r.names.map(coverOf) : null;
  let missingLine = '';
  if (match) {
    const missing = r.names.filter((n) => !coverOf(n));
    missingLine = missing.length
      ? `<p class="missing">Missing <b>${missing.length}</b>: ${esc(missing.slice(0, 3).join(', '))}${missing.length > 3 ? '…' : ''}</p>`
      : '<p class="missing ok"><b>You have everything</b></p>';
  }
  return `<li><a class="card" href="#/r/${encodeURIComponent(r.id)}">
    ${thumbHtml(r.img ? `${r.img}/preview` : '', r.t)}
    <span>
      <h3>${esc(r.t)}</h3>
      ${states ? dotsHtml(states) : ''}
      ${metaHtml([r.cat, 'TheMealDB'])}
      ${missingLine}
    </span>
  </a></li>`;
}

function libraryNotice() {
  if (state.indexStatus === 'missing') {
    return `<div class="notice"><strong>Your recipe library isn't built yet.</strong>
      On GitHub, open the Remi repo's Actions tab, choose “Build recipes,” and tap Run workflow. Until then you'll see recipes from TheMealDB.</div>`;
  }
  if (state.indexStatus === 'error') {
    return '<div class="notice"><strong>Couldn\'t load your recipe library.</strong> Check your connection and pull down to reload.</div>';
  }
  return '';
}

function filtersHtml() {
  const f = state.filters;
  const pill = (key, label) => `<button class="pill" type="button" data-filter="${key}" aria-pressed="${!!f[key]}">${label}</button>`;
  return `<div class="filters" role="group" aria-label="Filters">
    <select class="pill ${f.course ? 'on' : ''}" data-filter="course" aria-label="Meal type">
      <option value="">Any meal</option>
      ${Object.entries(COURSES).map(([k, v]) => `<option value="${k}" ${f.course === k ? 'selected' : ''}>${v}</option>`).join('')}
    </select>
    ${pill('quick', 'Under 30 min')}
    ${pill('protein', 'High protein')}
    ${pill('veg', 'Vegetarian')}
    ${pill('vegan', 'Vegan')}
  </div>`;
}

function bindFilters(root, onChange) {
  root.querySelectorAll('[data-filter]').forEach((el) => {
    const key = el.dataset.filter;
    const handler = () => {
      if (el.tagName === 'SELECT') {
        state.filters.course = el.value;
        el.classList.toggle('on', !!el.value);
      } else {
        state.filters[key] = !state.filters[key];
        el.setAttribute('aria-pressed', String(state.filters[key]));
      }
      saveState();
      state.shown = PAGE;
      onChange();
    };
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'click', handler);
  });
}

// ---------- autocomplete ----------

function suggestionsFor(q, exclude) {
  q = q.trim().toLowerCase();
  if (q.length < 1 || !state.index) return [];
  const out = [];
  const counts = state.index.ings;
  for (let i = 0; i < state.vocab.length && out.length < 6; i++) {
    const name = state.vocab[i];
    if (exclude.includes(name)) continue;
    if (name.startsWith(q) || name.includes(` ${q}`)) out.push([name, counts[i][1]]);
  }
  return out;
}

function bindAddRow(root, { list, onAdd, placeholder }) {
  const input = root.querySelector('input');
  const form = root.querySelector('form');
  const box = root.querySelector('.suggest');
  let active = -1;
  let items = [];

  const close = () => { box.hidden = true; box.innerHTML = ''; active = -1; input.setAttribute('aria-expanded', 'false'); };
  const paint = () => {
    if (!items.length) return close();
    box.innerHTML = items.map(([name, count], i) =>
      `<li><button type="button" role="option" data-name="${esc(name)}" aria-selected="${i === active}">
        <span>${esc(name)}</span><small>${fmt(count)} recipes</small></button></li>`).join('');
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  input.placeholder = placeholder;
  input.addEventListener('input', () => { items = suggestionsFor(input.value, list()); active = -1; paint(); });
  input.addEventListener('keydown', (e) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % items.length; paint(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; paint(); e.preventDefault(); }
    if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  box.addEventListener('pointerdown', (e) => e.preventDefault());
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-name]');
    if (!b) return;
    onAdd(b.dataset.name);
    input.value = '';
    close();
    input.focus();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = active >= 0 ? items[active][0] : input.value;
    if (raw.trim()) onAdd(raw);
    input.value = '';
    close();
  });
}

const addRowHtml = (id, label, buttonText) => `
  <form class="add-row" autocomplete="off">
    <label for="${id}" class="visually-hidden">${label}</label>
    <input id="${id}" type="text" inputmode="text" enterkeyhint="done" autocapitalize="none" autocorrect="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list">
    <button class="btn" type="submit">${buttonText}</button>
    <ul class="suggest" id="${id}-list" role="listbox" hidden></ul>
  </form>`;

function addToList(list, raw) {
  const name = normalizeIngredient(raw) || raw.trim().toLowerCase();
  if (name && !list.includes(name)) list.push(name);
  return name;
}

// ---------- Cook view ----------

function renderCook() {
  view.innerHTML = `
    <header class="page-head">
      <div class="brand">
        <h1 class="wordmark">remi<span class="dot">.</span></h1>
        <span class="mascot" role="img" aria-label="Remi, a mouse in a chef's hat holding a spoon"></span>
      </div>
      <p class="lede">Tell Remi what's in your kitchen and get recipes you can make right now.</p>
    </header>
    <section class="pantry" aria-label="Your ingredients">
      <label for="pantry-input">What do you have?</label>
      ${addRowHtml('pantry-input', 'Add an ingredient', 'Add')}
      <div class="chips" id="pantry-chips"></div>
      <div class="pantry-foot" id="pantry-foot"></div>
    </section>
    ${filtersHtml()}
    ${libraryNotice()}
    <div id="results"></div>
    <div id="tm-results"></div>`;

  bindAddRow($('.pantry'), {
    list: () => state.pantry,
    placeholder: state.pantry.length ? 'Add another ingredient' : 'chicken, rice, broccoli…',
    onAdd: (raw) => {
      for (const part of raw.split(/,| and /)) if (part.trim()) addToList(state.pantry, part);
      saveState();
      state.shown = PAGE;
      updateCook();
    },
  });
  bindFilters(view, () => updateCook(false));
  updateCook();
}

function updateCook(pantryChanged = true) {
  const chips = $('#pantry-chips');
  if (!chips) return;
  if (state.pantry.length) {
    chips.innerHTML = state.pantry.map((p) =>
      `<span class="chip">${esc(p)}<button class="x" type="button" data-remove="${esc(p)}" aria-label="Remove ${esc(p)}">×</button></span>`).join('');
    $('#pantry-foot').innerHTML = '<button class="linkish" type="button" id="clear-pantry">Clear all</button><span class="muted">Staples are in Kitchen</span>';
  } else {
    const quick = QUICK_ADD.filter((q) => !state.vocab.length || state.vocab.some((v) => pantryCovers(q, v))).slice(0, 8);
    chips.innerHTML = quick.map((q) => `<button class="chip add" type="button" data-quick="${esc(q)}">+ ${esc(q)}</button>`).join('');
    $('#pantry-foot').innerHTML = '';
  }
  chips.onclick = (e) => {
    const rm = e.target.closest('[data-remove]');
    const qa = e.target.closest('[data-quick]');
    if (rm) state.pantry = state.pantry.filter((p) => p !== rm.dataset.remove);
    else if (qa) addToList(state.pantry, qa.dataset.quick);
    else return;
    saveState();
    state.shown = PAGE;
    updateCook();
  };
  const clear = $('#clear-pantry');
  if (clear) clear.onclick = () => { state.pantry = []; saveState(); updateCook(); };
  const input = $('#pantry-input');
  if (input) input.placeholder = state.pantry.length ? 'Add another ingredient' : 'chicken, rice, broccoli…';

  renderCookResults();
  if (pantryChanged) loadTmForPantry(); else renderTm();
}

function renderCookResults() {
  const box = $('#results');
  if (!box) return;
  if (!state.pantry.length) {
    box.innerHTML = `<div class="empty"><h3>Start with one ingredient</h3>
      <p>Add anything you have, like eggs or leftover rice. Remi ranks recipes by how few things you'd need to buy.</p></div>`;
    return;
  }
  if (state.indexStatus === 'loading') { box.innerHTML = '<p class="loading">Loading recipes…</p>'; return; }
  if (state.indexStatus !== 'ready') { box.innerHTML = ''; return; }
  const ranked = rankLocal();
  if (!ranked.length) {
    box.innerHTML = `<div class="empty"><h3>No matches yet</h3>
      <p>Try a more general name, like “chicken” instead of “chicken tenders,” or turn off a filter.${hiddenNote(ranked.hidden)}</p></div>`;
    return;
  }
  const ready = ranked.filter((r) => r.miss === 0).length;
  box.innerHTML = `
    <p class="result-count">${fmt(ranked.length)} recipes use what you have${ready ? `, and you can make ${fmt(ready)} right now` : ''}.${hiddenNote(ranked.hidden)}</p>
    <ul class="list">${ranked.slice(0, state.shown).map((r) => cardFromRow(r.row, true)).join('')}</ul>
    ${ranked.length > state.shown ? '<div class="more-row"><button class="btn quiet wide" id="show-more" type="button">Show more recipes</button></div>' : ''}`;
  const more = $('#show-more');
  if (more) more.onclick = () => { state.shown += PAGE; renderCookResults(); };
}

let tmToken = 0;
let tmItems = [];
async function loadTmForPantry() {
  const box = $('#tm-results');
  if (!box) return;
  const terms = state.pantry.filter((p) => !state.staples.includes(p));
  if (!terms.length) { tmItems = []; box.innerHTML = ''; return; }
  const token = ++tmToken;
  box.innerHTML = '<h2 class="section">More from TheMealDB</h2><p class="loading">Searching…</p>';
  try {
    const items = await mealdb.forPantry(terms);
    if (token !== tmToken) return;
    items.forEach((r) => state.tm.set(r.id, r));
    tmItems = items;
    renderTm();
  } catch {
    if (token !== tmToken) return;
    tmItems = [];
    box.innerHTML = '<h2 class="section">More from TheMealDB</h2><p class="loading">TheMealDB isn\'t reachable right now.</p>';
  }
}

function renderTm() {
  const box = $('#tm-results');
  if (!box) return;
  const items = tmItems.filter((r) => passesFiltersTm(r) && !tmDisliked(r))
    .map((r) => ({ r, miss: r.names.filter((n) => !coverOf(n)).length }))
    .sort((a, b) => a.miss - b.miss);
  box.innerHTML = items.length
    ? `<h2 class="section">More from TheMealDB</h2><ul class="list">${items.map(({ r }) => cardFromTm(r, true)).join('')}</ul>`
    : '';
}

// ---------- Find view ----------

function renderFind() {
  view.innerHTML = `
    <header class="page-head"><h1 class="page-title">Find a recipe</h1></header>
    <form class="add-row" id="find-form" role="search">
      <label for="find-input" class="visually-hidden">Search recipes by name</label>
      <input id="find-input" type="search" enterkeyhint="search" placeholder="Lasagna, curry, pancakes…" autocapitalize="none" autocorrect="off" value="${esc(state.findQuery)}">
    </form>
    ${filtersHtml()}
    ${libraryNotice()}
    <div id="find-results"></div>
    <div id="find-tm"></div>`;
  const input = $('#find-input');
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.findQuery = input.value; state.shown = PAGE; updateFind(); }, 120);
  });
  $('#find-form').addEventListener('submit', (e) => { e.preventDefault(); input.blur(); });
  bindFilters(view, updateFind);
  updateFind();
}

let findTmToken = 0;
function updateFind() {
  const box = $('#find-results');
  if (!box) return;
  const q = state.findQuery.trim().toLowerCase();
  const f = state.filters;
  const anyFilter = f.course || f.veg || f.vegan || f.quick || f.protein;
  if (!q && !anyFilter) {
    box.innerHTML = `<div class="empty"><h3>Search by name or browse</h3>
      <p>Type a dish, or pick a meal type above to browse everything in that group.</p>
      ${state.index ? `<p class="muted">${fmt(state.index.total)} recipes in your library.</p>` : ''}</div>`;
    $('#find-tm').innerHTML = '';
    return;
  }
  if (state.index) {
    const rows = [];
    let hidden = 0;
    const words = q.split(/\s+/).filter(Boolean);
    state.index.recipes.forEach((row, i) => {
      if (!passesFilters(row)) return;
      const title = state.titles[i];
      if (!words.every((w) => title.includes(w))) return;
      if (rowDisliked(row)) { hidden++; return; }
      rows.push({ row, starts: q && title.startsWith(q) ? 0 : 1 });
    });
    rows.sort((a, b) => a.starts - b.starts || (b.row[8] & 4) - (a.row[8] & 4) || a.row[1].localeCompare(b.row[1]));
    box.innerHTML = rows.length
      ? `<p class="result-count">${fmt(rows.length)} recipes.${hiddenNote(hidden)}</p>
         <ul class="list">${rows.slice(0, state.shown).map((r) => cardFromRow(r.row, state.pantry.length > 0)).join('')}</ul>
         ${rows.length > state.shown ? '<div class="more-row"><button class="btn quiet wide" id="show-more" type="button">Show more recipes</button></div>' : ''}`
      : hidden
        ? `<div class="empty"><h3>All hidden</h3><p>${fmt(hidden)} recipes match, but they use foods you're not a fan of. Change that list in Plan, under Edit goals.</p></div>`
        : `<div class="empty"><h3>Nothing called “${esc(state.findQuery.trim())}”</h3><p>Try fewer words, or check the spelling.</p></div>`;
    const more = $('#show-more');
    if (more) more.onclick = () => { state.shown += PAGE; updateFind(); };
  } else {
    box.innerHTML = '';
  }

  const tmBox = $('#find-tm');
  if (q.length < 3) { tmBox.innerHTML = ''; return; }
  const token = ++findTmToken;
  mealdb.byName(q).then((items) => {
    if (token !== findTmToken) return;
    items.forEach((r) => state.tm.set(r.id, r));
    const shown = items.filter((r) => passesFiltersTm(r) && !tmDisliked(r));
    tmBox.innerHTML = shown.length
      ? `<h2 class="section">From TheMealDB</h2><ul class="list">${shown.map((r) => cardFromTm(r, state.pantry.length > 0)).join('')}</ul>`
      : '';
  }).catch(() => { if (token === findTmToken) tmBox.innerHTML = ''; });
}

// ---------- Saved view ----------

function renderSaved() {
  const entries = Object.entries(state.saved).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  view.innerHTML = `
    <header class="page-head"><h1 class="page-title">Saved</h1></header>
    ${entries.length
      ? `<ul class="list">${entries.map(([id, s]) => {
          const row = state.byId.get(id);
          if (row) return cardFromRow(row, state.pantry.length > 0);
          const r = s.full || { id, t: s.t, img: s.img, names: [], cat: '' };
          return id.startsWith('tm-') ? cardFromTm(r, false) : `<li><a class="card" href="#/r/${encodeURIComponent(id)}">${thumbHtml('', s.t)}<span><h3>${esc(s.t)}</h3>${metaHtml(['No longer in your library'])}</span></a></li>`;
        }).join('')}</ul>`
      : `<div class="empty"><h3>Nothing saved yet</h3>
          <p>Tap the bookmark on any recipe to keep it here. Saved recipes open even without signal.</p></div>`}`;
}

// ---------- Kitchen view (staples, sources) ----------

function renderMore() {
  const idx = state.index;
  const built = idx ? new Date(idx.builtAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  view.innerHTML = `
    <header class="page-head"><h1 class="page-title">Kitchen</h1></header>

    <h2 class="section">Always on hand</h2>
    <div class="panel" id="staples">
      <p class="muted">Remi never counts these as missing.</p>
      ${addRowHtml('staple-input', 'Add a staple', 'Add')}
      <div class="chips" id="staple-chips"></div>
    </div>

    <h2 class="section">Recipe library</h2>
    <div class="panel">
      ${idx
        ? `<p><b>${fmt(idx.total)} recipes</b>, updated ${esc(built)}.</p>`
        : `<p>${state.indexStatus === 'missing' ? 'Not built yet. Run “Build recipes” in the repo\'s Actions tab.' : 'Loading…'}</p>`}
      <ul class="source-list">
        ${idx ? Object.entries(idx.sources).map(([code, s]) => `
          <li><b>${esc(s.name)}</b>
            <span class="muted">${fmt(idx.counts[code] || 0)} recipes. ${esc(s.credit)}
            <a href="${esc(s.home)}" target="_blank" rel="noopener">Visit</a>, <a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener">${esc(s.license)}</a></span></li>`).join('') : ''}
        <li><b>TheMealDB</b><span class="muted">Searched live when you cook or search. Nothing from it is stored in Remi.
          <a href="https://www.themealdb.com/" target="_blank" rel="noopener">Visit</a></span></li>
      </ul>
    </div>

    <h2 class="section">Reset</h2>
    <div class="panel">
      <p class="muted">These only affect this phone.</p>
      <button class="btn quiet" type="button" id="reset-staples">Restore default staples</button>
      <button class="btn quiet" type="button" id="clear-saved" style="margin-left:8px">Clear saved</button>
    </div>`;

  const paintStaples = () => {
    $('#staple-chips').innerHTML = state.staples.map((p) =>
      `<span class="chip">${esc(p)}<button class="x" type="button" data-remove="${esc(p)}" aria-label="Remove ${esc(p)}">×</button></span>`).join('');
  };
  bindAddRow($('#staples'), {
    list: () => state.staples,
    placeholder: 'butter, flour, garlic…',
    onAdd: (raw) => { addToList(state.staples, raw); saveState(); paintStaples(); planner.refreshCosts(); },
  });
  $('#staple-chips').onclick = (e) => {
    const rm = e.target.closest('[data-remove]');
    if (!rm) return;
    state.staples = state.staples.filter((p) => p !== rm.dataset.remove);
    saveState();
    paintStaples();
    planner.refreshCosts();
  };
  $('#reset-staples').onclick = () => { state.staples = [...DEFAULT_STAPLES]; saveState(); paintStaples(); planner.refreshCosts(); };
  $('#clear-saved').onclick = () => {
    if (!Object.keys(state.saved).length) return;
    if (confirm('Remove all saved recipes from this phone?')) { state.saved = {}; saveState(); }
  };
  paintStaples();
}

// ---------- recipe sheet ----------

const sheet = $('#recipe');
let currentRecipe = null;

async function openRecipe(id) {
  sheet.hidden = false;
  sheet.classList.remove('enter');
  void sheet.offsetWidth;
  sheet.classList.add('enter');
  document.body.style.overflow = 'hidden';
  sheet.innerHTML = `<div class="sheet-bar"><button class="round" type="button" data-close aria-label="Back">${ICON.back}</button></div>
    <div class="recipe-body"><p class="loading">Loading recipe…</p></div>`;
  sheet.querySelector('[data-close]').onclick = closeRecipe;
  let r = null;
  try { r = await getRecipe(id); } catch { r = null; }
  if (location.hash !== `#/r/${encodeURIComponent(id)}` && location.hash !== `#/r/${id}`) return;
  if (!r) {
    sheet.querySelector('.recipe-body').innerHTML = `<div class="empty"><h3>This recipe didn't load</h3>
      <p>You may be offline, or it's no longer in your library.</p></div>`;
    return;
  }
  currentRecipe = r;
  renderRecipe(r);
}

function renderRecipe(r) {
  const src = sourceInfo(r.src);
  const hero = r.img || '';
  const lines = r.ing.map((line) => {
    const name = normalizeIngredient(line);
    return { line, cover: name ? coverOf(name) : 0 };
  });
  const hasPantry = state.pantry.length > 0;
  const haveCount = lines.filter((l) => l.cover).length;
  const n = r.nut || {};
  const facts = [
    r.min && `<span class="fact"><b>${r.min}</b> min</span>`,
    r.serv && `<span class="fact">Serves <b>${esc(r.serv.replace(/\s*servings?$/i, ''))}</b></span>`,
    n.kcal != null && `<span class="fact"><b>${fmt(n.kcal)}</b> cal</span>`,
    n.protein != null && `<span class="fact"><b>${n.protein} g</b> protein</span>`,
    n.carbs != null && `<span class="fact"><b>${n.carbs} g</b> carbs</span>`,
    n.fat != null && `<span class="fact"><b>${n.fat} g</b> fat</span>`,
  ].filter(Boolean).join('');
  const isSaved = !!state.saved[r.id];

  sheet.innerHTML = `
    <div class="sheet-bar">
      <button class="round" type="button" data-close aria-label="Back">${ICON.back}</button>
      <span class="bar-title" aria-hidden="true">${esc(r.t)}</span>
      <button class="round ${isSaved ? 'saved' : ''}" type="button" data-save aria-pressed="${isSaved}" aria-label="${isSaved ? 'Remove from saved' : 'Save recipe'}">${ICON.save}</button>
    </div>
    ${hero ? `<img class="hero" src="${esc(hero)}" alt="" onerror="this.className='hero-blank';this.removeAttribute('src')">` : '<div class="hero-blank"></div>'}
    <article class="recipe-body">
      <h1>${esc(r.t)}</h1>
      ${metaHtml([r.cat, src.name])}
      ${facts ? `<div class="facts">${facts}</div>` : ''}

      <h2 class="section">Ingredients</h2>
      ${hasPantry ? `<p class="muted">You have ${haveCount} of ${lines.length}. Tap items as you prep.</p>` : '<p class="muted">Tap items as you prep.</p>'}
      <ul class="ing">
        ${lines.map((l, i) => `<li class="${l.cover ? 'have' : ''}"><label>
          <input type="checkbox" id="ing-${i}"><span class="box"></span>
          <span>${esc(l.line)}${hasPantry && !l.cover ? '<span class="tag">need</span>' : ''}</span>
        </label></li>`).join('')}
      </ul>

      <h2 class="section">Steps</h2>
      <ol class="steps">${r.steps.map((s) => `<li><span>${esc(s)}</span></li>`).join('')}</ol>

      ${r.video ? `<p><a href="${esc(r.video)}" target="_blank" rel="noopener">Watch a video of this recipe</a></p>` : ''}

      <p class="credit">${esc(src.credit)}${r.by && r.by !== 'Wikibooks contributors' ? ` Recipe by ${esc(r.by)}.` : ''}
        <a href="${esc(r.url)}" target="_blank" rel="noopener">See the original</a>${src.licenseUrl && r.src !== 'tm' ? `, <a href="${esc(src.licenseUrl)}" target="_blank" rel="noopener">${esc(src.license)}</a>` : ''}.</p>
    </article>
    ${r.steps.length ? '<div class="cook-cta"><button class="btn" type="button" data-cook>Start cooking</button></div>' : ''}`;

  sheet.querySelector('[data-close]').onclick = closeRecipe;
  sheet.querySelector('[data-save]').onclick = (e) => toggleSave(r, e.currentTarget);
  const cookBtn = sheet.querySelector('[data-cook]');
  if (cookBtn) cookBtn.onclick = () => startCooking(r);
  sheet.scrollTop = 0;
  const bar = sheet.querySelector('.sheet-bar');
  const title = sheet.querySelector('.recipe-body h1');
  sheet.onscroll = () => bar.classList.toggle('solid', title.getBoundingClientRect().bottom < bar.offsetHeight);
}

function toggleSave(r, btn) {
  if (state.saved[r.id]) delete state.saved[r.id];
  else state.saved[r.id] = { t: r.t, img: r.img, src: r.src, at: Date.now(), full: r };
  saveState();
  const on = !!state.saved[r.id];
  btn.classList.toggle('saved', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? 'Remove from saved' : 'Save recipe');
}

let cameFromApp = false;
function closeRecipe() {
  if (cameFromApp) history.back();
  else location.hash = `#/${state.tab}`;
}

function hideRecipe() {
  sheet.hidden = true;
  sheet.innerHTML = '';
  document.body.style.overflow = '';
  currentRecipe = null;
}

// ---------- cook mode ----------

const cookEl = $('#cook');
let wakeLock = null;
let cookIndex = 0;
let cookRecipe = null;

async function requestWake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
    const note = cookEl.querySelector('.awake');
    if (note && wakeLock) note.textContent = 'Screen stays on';
  } catch { wakeLock = null; }
}

function startCooking(r) {
  cookRecipe = r;
  cookIndex = 0;
  cookEl.hidden = false;
  paintCook();
  requestWake();
  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('keydown', onCookKey);
}

function stopCooking() {
  cookEl.hidden = true;
  cookEl.innerHTML = '';
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  document.removeEventListener('visibilitychange', onVisible);
  document.removeEventListener('keydown', onCookKey);
}

function onVisible() { if (document.visibilityState === 'visible' && !cookEl.hidden) requestWake(); }
function onCookKey(e) {
  if (e.key === 'ArrowRight') stepCook(1);
  if (e.key === 'ArrowLeft') stepCook(-1);
  if (e.key === 'Escape') stopCooking();
}

function stepCook(d) {
  const next = cookIndex + d;
  if (next >= cookRecipe.steps.length) return stopCooking();
  if (next < 0) return;
  cookIndex = next;
  paintCook();
}

function paintCook() {
  const steps = cookRecipe.steps;
  const last = cookIndex === steps.length - 1;
  cookEl.innerHTML = `
    <div class="cook-top">
      <button class="round" type="button" data-exit aria-label="Exit cooking mode">${ICON.close}</button>
      <span class="awake">${wakeLock ? 'Screen stays on' : ''}</span>
    </div>
    <div class="cook-progress" aria-hidden="true">${steps.map((_, i) => `<i class="${i <= cookIndex ? 'done' : ''}"></i>`).join('')}</div>
    <div class="cook-step" aria-live="polite">
      <div class="n">Step ${cookIndex + 1} of ${steps.length}</div>
      <p>${esc(steps[cookIndex])}</p>
    </div>
    <div class="cook-nav">
      <button class="btn quiet" type="button" data-prev ${cookIndex === 0 ? 'disabled' : ''}>Back</button>
      <button class="btn" type="button" data-next>${last ? 'Done' : 'Next step'}</button>
    </div>`;
  cookEl.querySelector('[data-exit]').onclick = stopCooking;
  cookEl.querySelector('[data-prev]').onclick = () => stepCook(-1);
  cookEl.querySelector('[data-next]').onclick = () => stepCook(1);
}

let touchX = null;
cookEl.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
cookEl.addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 60) stepCook(dx < 0 ? 1 : -1);
});

// ---------- routing ----------

// The planner only treats your Kitchen staples as already bought; what you typed
// into Cook tonight isn't assumed to last a whole week.
const planner = createPlanner({
  store, esc, fmt, view,
  coverOf: (name) => (state.staples.includes(name) ? 1 : 0),
  suggest: suggestionsFor,
  normalize: (raw) => normalizeIngredient(raw) || raw.trim().toLowerCase(),
});

const TABS = { cook: renderCook, find: renderFind, plan: () => planner.render(), saved: renderSaved, more: renderMore };
let renderedTab = null;

function route() {
  const hash = location.hash || '#/cook';
  const recipeMatch = hash.match(/^#\/r\/(.+)$/);
  if (recipeMatch) {
    if (!renderedTab) showTab(state.tab);
    if (!cookEl.hidden) stopCooking();
    openRecipe(decodeURIComponent(recipeMatch[1]));
    return;
  }
  cameFromApp = false;
  if (!sheet.hidden) hideRecipe();
  if (!cookEl.hidden) stopCooking();
  const tab = hash.replace(/^#\//, '');
  showTab(TABS[tab] ? tab : 'cook');
}

function showTab(tab) {
  const changed = renderedTab !== tab;
  state.tab = tab;
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (changed || tab === 'saved') {
    renderedTab = tab;
    state.shown = PAGE;
    TABS[tab]();
    if (changed) window.scrollTo(0, 0);
  }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/r/"]');
  if (a) cameFromApp = true;
});

window.addEventListener('hashchange', route);

// ---------- start ----------

route();
loadIndex().then(() => {
  // Re-render whatever is showing now that the library is available.
  const tab = renderedTab;
  renderedTab = null;
  if (location.hash.startsWith('#/r/')) { renderedTab = tab; TABS[tab]?.(); }
  else showTab(tab || 'cook');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
