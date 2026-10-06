// Weekly meal plan + shopping list.
// Picks recipes with nutrition (USDA MyPlate) to hit your daily targets, cooks
// each one as a batch that covers a few meals (leftovers), favors recipes that
// share ingredients, and keeps the estimated total under your budget.

import { STORES, AISLES, priceEntry, guessAisle } from './prices.js';
import { pantryCovers } from './normalize.js';

const GOALS = {
  lose: { label: 'Lose fat', kcal: 0.8, protein: 1.0 },
  recomp: { label: 'Recomp', kcal: 0.9, protein: 1.0 },
  build: { label: 'Build muscle', kcal: 1.1, protein: 0.9 },
  maintain: { label: 'Maintain', kcal: 1.0, protein: 0.7 },
};
const ACTIVITY = {
  low: [1.2, 'Mostly sitting, little exercise'],
  light: [1.375, 'Light: 1–3 workouts a week'],
  moderate: [1.55, 'Moderate: 3–5 workouts a week'],
  high: [1.725, 'Hard: 6–7 workouts a week'],
};
const SHARE = { b: 0.25, l: 0.35, d: 0.4 };
const SHAKE = { kcal: 120, protein: 25 };
const DAYS = 7;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_PROFILE = {
  goal: 'recomp', sex: 'male', age: 20, heightIn: 70, weightLb: 175, activity: 'moderate',
  diet: 'any', store: 'aldi', budget: 100, shake: false, kcal: null, protein: null, avoid: [],
};
const NOPE_IDEAS = ['mushroom', 'olive', 'cilantro', 'eggplant', 'greek yogurt', 'tuna', 'shrimp', 'beet', 'coconut', 'blue cheese'];

// Does a recipe use something you're not a fan of? Oils don't count
// ("olive" shouldn't rule out everything cooked in olive oil).
function usesDisliked(r, avoid) {
  if (!avoid?.length) return false;
  const title = r.t.toLowerCase();
  return avoid.some((a) =>
    r.ing.some(([name]) => pantryCovers(a, name) && !(name.endsWith(' oil') && !a.endsWith(' oil')))
    || new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b(?!\\s+oil)`).test(title));
}

export function suggestTargets(p) {
  const kg = p.weightLb * 0.4536;
  const cm = p.heightIn * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const tdee = bmr * (ACTIVITY[p.activity]?.[0] || 1.55);
  const floor = p.sex === 'male' ? 1500 : 1200;
  const kcal = Math.max(floor, Math.round((tdee * GOALS[p.goal].kcal) / 50) * 50);
  const protein = Math.round((p.weightLb * GOALS[p.goal].protein) / 5) * 5;
  return { kcal, protein, floor };
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const roundHalf = (x) => Math.round(x * 2) / 2;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const money = (n) => `$${n.toFixed(2)}`;

export function createPlanner(ctx) {
  const { store, esc, fmt, coverOf, view, suggest, normalize } = ctx;
  let data = null;
  let byId = new Map();
  let loadError = false;
  let profile = store.get('plan:profile', null);
  let week = store.get('plan:week', null);
  let checked = store.get('plan:checked', {});
  let overrides = store.get('plan:prices', {});
  let ui = { mode: profile && week ? 'week' : 'setup', tab: 'meals' };

  const save = () => {
    store.set('plan:profile', profile);
    store.set('plan:week', week);
    store.set('plan:checked', checked);
    store.set('plan:prices', overrides);
  };

  async function load() {
    if (data || loadError) return;
    try {
      const res = await fetch('data/plan.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      data = (await res.json()).recipes;
      byId = new Map(data.map((r) => [r.id, r]));
    } catch { loadError = true; }
  }

  // ---------- targets ----------

  const targets = () => {
    const s = suggestTargets(profile);
    return { kcal: Math.max(s.floor, profile.kcal || s.kcal), protein: profile.protein || s.protein, floor: s.floor };
  };

  // ---------- costs ----------

  const W = { oz: 1 / 16, lb: 1, g: 1 / 453.6, kg: 2.2046 };
  const V = { cup: 1, tbsp: 1 / 16, tsp: 1 / 48, floz: 1 / 8, ml: 1 / 236.6, l: 4.227, qt: 4, pt: 2, gal: 16 };
  const C = { each: 1, clove: 1, slice: 1, stalk: 1, head: 1, bunch: 1, stick: 1 };

  function baseAmount([, q, u, sq, su]) {
    if (q == null) return null;
    if ((u === 'can' || u === 'pkg') && sq && W[su]) return { lb: q * sq * W[su] };
    if (u === 'can') return { can: q };
    if (u === 'pkg') return { pkgs: q };
    if (W[u]) return { lb: q * W[u] };
    if (V[u]) return { cup: q * V[u] };
    if (C[u] != null) return { each: q * C[u] };
    return null;
  }

  // Amount of an ingredient in the units its price is quoted in.
  function amountFor(e, b) {
    if (!b) return 0;
    if (e.by === 'pkg' && (b.can != null || b.pkgs != null)) return (b.can ?? b.pkgs) * e.pkg.q;
    const dim = e.by === 'pkg' ? e.pkg.u : e.by;
    const cupLb = e.cupLb ?? 0.5;
    const eachLb = e.eachLb ?? 0.5;
    const perCup = e.perCup ?? 1;
    if (dim === 'lb') {
      if (b.lb != null) return b.lb;
      if (b.cup != null) return b.cup * cupLb;
      if (b.each != null) return b.each * eachLb;
      return (b.can ?? b.pkgs ?? 0) * 0.94;
    }
    if (dim === 'cup') {
      if (b.cup != null) return b.cup;
      if (b.lb != null) return b.lb / cupLb;
      if (b.each != null) return b.each / perCup;
      return (b.can ?? b.pkgs ?? 0) * 1.75;
    }
    // each
    let n;
    if (b.each != null) n = b.each;
    else if (b.cup != null) n = b.cup * perCup;
    else if (b.lb != null) n = b.lb / eachLb;
    else n = b.can ?? b.pkgs ?? 0;
    return e.parts ? n / e.parts : n;
  }

  const storeFactor = () => STORES[profile.store]?.factor ?? 1;
  function unitPrice(key, e) {
    const o = overrides[profile.store]?.[key];
    if (o != null) return { price: o, custom: true };
    return { price: Math.round((e ? e.p : 3) * storeFactor() * 100) / 100, custom: false };
  }

  function pluralLabel(label, n) {
    if (n === 1) return label;
    return label.replace(/^(\w+)/, (w) => ({ box: 'boxes', bunch: 'bunches', loaf: 'loaves', dozen: 'dozen', pack: 'packs' }[w] || `${w}s`));
  }

  function buyFor(e, amt, key) {
    const { price, custom } = unitPrice(key, e);
    if (!e) return { text: '1', cost: price, unit: 'each, estimated', price, custom, est: true };
    if (e.by === 'lb') {
      const lbs = Math.max(0.25, Math.ceil(amt * 4 - 0.1) / 4);
      return { text: `${fmtQty(lbs)} lb`, cost: lbs * price, unit: 'per lb', price, custom };
    }
    if (e.by === 'each') {
      const n = Math.max(1, Math.ceil(amt - 0.05));
      return { text: `${n}`, cost: n * price, unit: 'each', price, custom };
    }
    const n = Math.max(1, Math.ceil(amt / e.pkg.q - 0.08));
    return { text: `${n} ${pluralLabel(e.pkg.label, n)}`, cost: n * price, unit: `per ${e.pkg.label.replace(/\s*\(.*\)/, '')}`, price, custom };
  }

  function fmtQty(x) {
    const whole = Math.floor(x);
    const frac = x - whole;
    const f = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[Math.round(frac * 4) / 4] || '';
    return `${whole || (f ? '' : '0')}${f}`;
  }

  // Standalone cost of one batch of a recipe (used to score recipes).
  const costCache = new Map();
  function batchCost(r) {
    const key = `${profile.store}|${r.id}`;
    if (costCache.has(key)) return costCache.get(key);
    let total = 0;
    for (const ing of r.ing) {
      const name = ing[0];
      if (coverOf(name)) continue;
      const e = priceEntry(name);
      if (e?.check) continue;
      const amt = e ? amountFor(e, baseAmount(ing)) : 1;
      const { price } = unitPrice(e ? e.n : name, e);
      // Charge only the share of a package a recipe uses, so big packs of
      // flour or sugar don't make a recipe look expensive.
      if (e && e.by === 'pkg') total += Math.max(0.15, amt / e.pkg.q) * price;
      else if (e && e.by === 'lb') total += Math.max(0.25, amt) * price;
      else if (e) total += Math.max(1, amt) * price;
      else total += price * 0.5;
    }
    costCache.set(key, total);
    return total;
  }

  const keysOf = (r) => r.ing.map((i) => i[0]).filter((n) => !coverOf(n) && !priceEntry(n)?.check);

  // ---------- building the week ----------

  function pools() {
    const ok = (r) => (profile.diet === 'vegan' ? r.v & 2 : profile.diet === 'vegetarian' ? r.v & 1 : true);
    const notMeal = /\b(dressing|vinaigrette|sauce|dip|marinade|seasoning|rub|spread|topping|syrup|glaze|stock|broth)\b/i;
    const all = data.filter((r) => ok(r) && !notMeal.test(r.t) && !usesDisliked(r, profile.avoid));
    const treat = /\b(milk|mix|treats?|balls?|bites?|cookies?|bars?|candy|shakes?|smoothies?|bread|bagels?|muffins?|popcorn|cake|pie|pudding|jam|jelly|preserves?|bouquet|snack)\b/i;
    const t = targets();
    const minProtein = (t.protein * 4) / t.kcal > 0.25 ? 10 : 6;
    return {
      b: all.filter((r) => r.c === 'b' && r.k >= 100 && !/\bbread\b/i.test(r.t)),
      m: all.filter((r) => ['m', 'u', 'l'].includes(r.c) && r.k >= 140 && r.p >= minProtein && !treat.test(r.t)),
      s: all.filter((r) => ['i', 'l'].includes(r.c) && r.k >= 80 && r.k <= 450 && !treat.test(r.t)),
    };
  }

  function pick(pool, n, chosen, exclude, rand, kind) {
    const t = targets();
    const wantDensity = (t.protein * 4) / t.kcal; // share of calories from protein
    const proteinW = Math.max(0.6, wantDensity * 6);
    const costW = profile.budget < 70 ? 1.6 : profile.budget < 110 ? 1.0 : 0.5;
    const used = new Set(chosen.flatMap(keysOf));
    const picks = [];
    for (let i = 0; i < n; i++) {
      let best = null;
      let bestScore = -Infinity;
      for (const r of pool) {
        if (exclude.has(r.id) || picks.includes(r) || chosen.includes(r)) continue;
        const keys = keysOf(r);
        const overlap = keys.filter((k) => used.has(k)).length;
        const fresh = keys.length - overlap;
        const density = ((r.p * 4) / r.k) * 10;
        const perServing = batchCost(r) / r.s;
        // Sides are there to fill calories, so heartier ones score higher.
        const filling = kind === 's' ? Math.min(4, r.k / 60) : 0;
        const score = proteinW * density + filling + 1.6 * overlap - 0.5 * fresh - costW * perServing + rand() * 3.5;
        if (score > bestScore) { bestScore = score; best = r; }
      }
      if (!best) break;
      picks.push(best);
      keysOf(best).forEach((k) => used.add(k));
    }
    return picks;
  }

  function generate(seed, keep = {}) {
    const rand = rng(seed);
    const p = pools();
    const exclude = new Set(week?.rejects || []);
    // Tight budgets get fewer different recipes, so fewer packages to buy.
    const tight = profile.budget < 60;
    const b = keep.b || pick(p.b, tight ? 1 : 2, [], exclude, rand, 'b');
    const m = keep.m || pick(p.m, tight ? 4 : 5, b, exclude, rand, 'm');
    const s = keep.s || pick(p.s, tight ? 2 : 3, [...b, ...m], exclude, rand, 's');
    week = { seed, b: b.map((r) => r.id), m: m.map((r) => r.id), s: s.map((r) => r.id), rejects: week?.rejects || [], created: Date.now() };
    fitBudget(p, rand);
    checked = {};
    save();
  }

  function fitBudget(p, rand) {
    for (let tries = 0; tries < 12; tries++) {
      const total = shoppingList().total;
      if (total <= profile.budget) return;
      // Replace the costliest recipe with the cheapest similar alternative.
      const slots = [...week.m.map((id) => ['m', id]), ...week.b.map((id) => ['b', id]), ...week.s.map((id) => ['s', id])];
      slots.sort((x, y) => batchCost(byId.get(y[1])) - batchCost(byId.get(x[1])));
      const [kind, worst] = slots[0];
      const current = new Set([...week.b, ...week.m, ...week.s]);
      const pool = p[kind].filter((r) => !current.has(r.id) && !(week.rejects || []).includes(r.id))
        .sort((x, y) => batchCost(x) / x.s - batchCost(y) / y.s).slice(0, 25);
      let improved = false;
      for (const r of pool) {
        const prev = [...week[kind]];
        week[kind] = week[kind].map((id) => (id === worst ? r.id : id));
        if (shoppingList().total < total) { improved = true; break; }
        week[kind] = prev;
      }
      if (!improved) return;
    }
    void rand;
  }

  function swap(kind, id) {
    const p = pools();
    week.rejects = [...new Set([...(week.rejects || []), id])];
    const chosen = [...week.b, ...week.m, ...week.s].filter((x) => x !== id).map((x) => byId.get(x)).filter(Boolean);
    const [r] = pick(p[kind], 1, chosen, new Set(week.rejects), rng(Date.now()), kind);
    if (r) week[kind] = week[kind].map((x) => (x === id ? r.id : x));
    save();
  }

  // Assign recipes to the 21 meals, with portions sized to the targets.
  function schedule() {
    const t = targets();
    const mealKcal = t.kcal - (profile.shake ? SHAKE.kcal : 0);
    const cap = roundHalf(clamp(mealKcal / 800, 3, 4.5)); // bigger appetites get bigger portions
    const b = week.b.map((id) => byId.get(id)).filter(Boolean);
    const m = week.m.map((id) => byId.get(id)).filter(Boolean);
    const s = week.s.map((id) => byId.get(id)).filter(Boolean);
    const days = Array.from({ length: DAYS }, () => ({ b: [], l: [], d: [] }));
    const used = new Map();
    const use = (r, portions) => used.set(r.id, (used.get(r.id) || 0) + portions);

    // Breakfast: first recipe for the first half of the week, second for the rest.
    days.forEach((day, i) => {
      const r = b[b.length ? Math.min(b.length - 1, Math.floor((i * b.length) / DAYS)) : 0];
      if (!r) return;
      const portions = clamp(roundHalf((mealKcal * SHARE.b) / r.k), 1, cap - 0.5);
      const first = i === 0 || r !== b[Math.min(b.length - 1, Math.floor(((i - 1) * b.length) / DAYS))];
      day.b.push({ r, portions, cook: first });
      use(r, portions);
    });

    // Lunch and dinner: each main covers a run of consecutive meals (cook once, eat leftovers).
    const slots = [];
    for (let i = 0; i < DAYS; i++) slots.push([i, 'l'], [i, 'd']);
    const runs = m.length ? Math.ceil(slots.length / m.length) : slots.length;
    slots.forEach(([i, meal], k) => {
      const r = m[Math.min(m.length - 1, Math.floor(k / runs))];
      if (!r) return;
      const target = mealKcal * SHARE[meal];
      const portions = clamp(roundHalf((target * 0.7) / r.k), 1, cap);
      const cook = k % runs === 0;
      days[i][meal].push({ r, portions, cook });
      use(r, portions);
      const left = target - portions * r.k;
      const side = s[Math.floor(k / Math.ceil(slots.length / Math.max(1, s.length)))] || s[0];
      if (side && left > 80) {
        const sp = clamp(roundHalf(left / side.k), 0.5, 3);
        days[i][meal].push({ r: side, portions: sp, cook: false, side: true });
        use(side, sp);
      }
    });

    const batches = new Map();
    for (const [id, portions] of used) {
      const r = byId.get(id);
      batches.set(id, { r, portions, factor: Math.max(0.5, Math.ceil((portions / r.s) * 2) / 2) });
    }
    // Daily totals.
    const totals = days.map((day) => {
      let kcal = profile.shake ? SHAKE.kcal : 0;
      let protein = profile.shake ? SHAKE.protein : 0;
      for (const meal of ['b', 'l', 'd']) for (const x of day[meal]) { kcal += x.r.k * x.portions; protein += x.r.p * x.portions; }
      return { kcal, protein };
    });
    return { days, batches, totals };
  }

  function shoppingList() {
    const { batches } = schedule();
    const items = new Map();
    const checks = new Set();
    const have = new Set();
    for (const { r, factor } of batches.values()) {
      for (const ing of r.ing) {
        const name = ing[0];
        if (coverOf(name)) { have.add(name); continue; }
        const e = priceEntry(name);
        if (e?.check) { checks.add(name); continue; }
        const key = e ? e.n : name;
        const item = items.get(key) || { key, name: key, e, aisle: e ? e.a : guessAisle(name), amt: 0, recipes: new Set() };
        item.amt += (e ? amountFor(e, baseAmount(ing)) : 1) * factor;
        item.recipes.add(r.t);
        items.set(key, item);
      }
    }
    if (profile.shake) checks.add('protein powder (1 scoop a day)');
    let total = 0;
    for (const item of items.values()) {
      Object.assign(item, buyFor(item.e, item.amt, item.key));
      total += item.cost;
    }
    return { items: [...items.values()], checks: [...checks].sort(), have: [...have].sort(), total };
  }

  // ---------- views ----------

  function render() {
    if (!data && !loadError) {
      view.innerHTML = '<header class="page-head"><h1 class="page-title">Plan</h1></header><p class="loading">Loading recipes…</p>';
      load().then(render);
      return;
    }
    if (loadError) {
      view.innerHTML = `<header class="page-head"><h1 class="page-title">Plan</h1></header>
        <div class="notice"><strong>The planner's recipe file isn't available yet.</strong>
        Run “Build recipes” in the repo's Actions tab, then reopen this page.</div>`;
      return;
    }
    if (!profile || ui.mode === 'setup' || !week) renderSetup();
    else renderWeek();
  }

  function renderSetup() {
    const p = { ...DEFAULT_PROFILE, ...(profile || {}) };
    const s = suggestTargets(p);
    const ft = Math.floor(p.heightIn / 12);
    const inch = p.heightIn % 12;
    const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
    const seg = (name, cur, entries) => `<div class="seg" role="radiogroup">${entries.map(([v, label]) =>
      `<label><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>`;

    view.innerHTML = `
      <header class="page-head">
        <h1 class="page-title">Plan your week</h1>
        <p class="lede">Remi picks breakfast, lunch and dinner for seven days to hit your targets, then builds the shopping list.</p>
      </header>
      <form id="plan-form" class="plan-form">
        <fieldset class="panel">
          <legend>Goal</legend>
          ${seg('goal', p.goal, Object.entries(GOALS).map(([k, g]) => [k, g.label]))}
        </fieldset>

        <fieldset class="panel">
          <legend>About you</legend>
          <p class="muted">Used only to suggest calories and protein. Stays on this phone.</p>
          <div class="grid2">
            <label class="field"><span>Sex</span><select name="sex">${opt('male', p.sex, 'Male')}${opt('female', p.sex, 'Female')}</select></label>
            <label class="field"><span>Age</span><input name="age" type="number" inputmode="numeric" min="14" max="99" value="${p.age}"></label>
            <label class="field"><span>Height</span>
              <span class="pair"><select name="ft" aria-label="Feet">${[4, 5, 6, 7].map((f) => opt(f, ft, `${f} ft`)).join('')}</select>
              <select name="in" aria-label="Inches">${Array.from({ length: 12 }, (_, i) => opt(i, inch, `${i} in`)).join('')}</select></span></label>
            <label class="field"><span>Weight (lb)</span><input name="weightLb" type="number" inputmode="decimal" min="70" max="500" value="${p.weightLb}"></label>
          </div>
          <label class="field"><span>Activity</span><select name="activity">${Object.entries(ACTIVITY).map(([k, a]) => opt(k, p.activity, a[1])).join('')}</select></label>
        </fieldset>

        <fieldset class="panel">
          <legend>Daily targets</legend>
          <p class="muted" id="suggested">Suggested: ${fmt(s.kcal)} calories and ${s.protein} g protein. Change them if your plan says otherwise.</p>
          <div class="grid2">
            <label class="field"><span>Calories</span><input name="kcal" type="number" inputmode="numeric" step="50" value="${p.kcal || s.kcal}"></label>
            <label class="field"><span>Protein (g)</span><input name="protein" type="number" inputmode="numeric" step="5" value="${p.protein || s.protein}"></label>
          </div>
          <p class="muted" id="floor-note" hidden></p>
          <label class="check"><input type="checkbox" name="shake" ${p.shake ? 'checked' : ''}><span>Count a daily protein shake (about ${SHAKE.kcal} cal, ${SHAKE.protein} g protein)</span></label>
          <label class="field"><span>Diet</span><select name="diet">${opt('any', p.diet, 'No restrictions')}${opt('vegetarian', p.diet, 'Vegetarian')}${opt('vegan', p.diet, 'Vegan')}</select></label>
        </fieldset>

        <fieldset class="panel nope-panel">
          <legend>Not a fan</legend>
          <p class="muted">Remi keeps these off your plate. Any recipe that uses them is skipped.</p>
          <div class="add-row nope-add">
            <label for="nope-input" class="visually-hidden">Add a food you're not a fan of</label>
            <input id="nope-input" type="text" enterkeyhint="done" autocapitalize="none" autocorrect="off" spellcheck="false"
              placeholder="mushrooms, olives…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="nope-list">
            <button class="btn" type="button" id="nope-add">Add</button>
            <ul class="suggest" id="nope-list" role="listbox" hidden></ul>
          </div>
          <div class="chips" id="nope-chips" aria-live="polite"></div>
        </fieldset>

        <fieldset class="panel">
          <legend>Shopping</legend>
          ${seg('store', p.store, Object.entries(STORES).map(([k, st]) => [k, st.name]))}
          <label class="field"><span>Weekly budget ($)</span><input name="budget" type="number" inputmode="decimal" min="20" step="5" value="${p.budget}"></label>
        </fieldset>

        <button class="btn wide big" type="submit">${profile ? 'Save and build a new week' : 'Build my week'}</button>
        ${profile && week ? '<button class="btn quiet wide" type="button" id="cancel-setup">Back to my week</button>' : ''}
      </form>`;

    const form = $('#plan-form');
    let customKcal = !!(profile && profile.kcal);
    let customProtein = !!(profile && profile.protein);
    const readProfile = () => {
      const f = new FormData(form);
      return {
        goal: f.get('goal') || 'recomp',
        sex: f.get('sex'),
        age: clamp(Number(f.get('age')) || 20, 14, 99),
        heightIn: Number(f.get('ft')) * 12 + Number(f.get('in')),
        weightLb: clamp(Number(f.get('weightLb')) || 170, 70, 500),
        activity: f.get('activity'),
        diet: f.get('diet'),
        store: f.get('store') || 'aldi',
        budget: Math.max(20, Number(f.get('budget')) || 100),
        shake: f.get('shake') === 'on',
        avoid: [...avoid],
        kcal: Number(f.get('kcal')) || null,
        protein: Number(f.get('protein')) || null,
      };
    };
    const refresh = (e) => {
      if (e?.target?.name === 'kcal') customKcal = true;
      if (e?.target?.name === 'protein') customProtein = true;
      const np = readProfile();
      const sg = suggestTargets(np);
      $('#suggested').textContent = `Suggested: ${fmt(sg.kcal)} calories and ${sg.protein} g protein. Change them if your plan says otherwise.`;
      if (!customKcal) form.kcal.value = sg.kcal;
      if (!customProtein) form.protein.value = sg.protein;
      const note = $('#floor-note');
      const low = Number(form.kcal.value) < sg.floor;
      note.hidden = !low;
      note.textContent = low ? `Remi won't plan below ${fmt(sg.floor)} calories a day. Very low intakes make it hard to keep muscle and get enough nutrients.` : '';
    };
    // Not a fan picker
    const avoid = [...(p.avoid || [])];
    const nopeInput = $('#nope-input');
    const nopeList = $('#nope-list');
    const paintNope = () => {
      const ideas = NOPE_IDEAS.filter((n) => !avoid.includes(n)).slice(0, 6);
      $('#nope-chips').innerHTML = avoid.map((n) =>
        `<span class="chip nope"><s>${esc(n)}</s><button class="x" type="button" data-unnope="${esc(n)}" aria-label="Remove ${esc(n)}">×</button></span>`).join('')
        + ideas.map((n) => `<button class="chip add" type="button" data-nope="${esc(n)}">+ ${esc(n)}</button>`).join('');
    };
    const closeNope = () => { nopeList.hidden = true; nopeList.innerHTML = ''; nopeInput.setAttribute('aria-expanded', 'false'); };
    const addNope = (raw) => {
      for (const part of String(raw).split(/,| and /)) {
        const n = normalize(part);
        if (n && !avoid.includes(n)) avoid.push(n);
      }
      nopeInput.value = '';
      closeNope();
      paintNope();
    };
    nopeInput.addEventListener('input', () => {
      const items = suggest(nopeInput.value, avoid);
      if (!items.length) return closeNope();
      nopeList.innerHTML = items.map(([name, count]) =>
        `<li><button type="button" role="option" data-pick="${esc(name)}"><span>${esc(name)}</span><small>${fmt(count)} recipes</small></button></li>`).join('');
      nopeList.hidden = false;
      nopeInput.setAttribute('aria-expanded', 'true');
    });
    nopeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (nopeInput.value.trim()) addNope(nopeInput.value); }
      if (e.key === 'Escape') closeNope();
    });
    nopeInput.addEventListener('blur', () => setTimeout(closeNope, 150));
    nopeList.addEventListener('pointerdown', (e) => e.preventDefault());
    nopeList.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) addNope(b.dataset.pick); });
    $('#nope-add').onclick = () => { if (nopeInput.value.trim()) addNope(nopeInput.value); };
    $('#nope-chips').onclick = (e) => {
      const un = e.target.closest('[data-unnope]');
      const add = e.target.closest('[data-nope]');
      if (un) avoid.splice(avoid.indexOf(un.dataset.unnope), 1);
      else if (add) avoid.push(add.dataset.nope);
      else return;
      paintNope();
    };
    paintNope();

    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const np = readProfile();
      const sg = suggestTargets(np);
      profile = { ...np, kcal: customKcal ? Math.max(sg.floor, np.kcal || sg.kcal) : null, protein: customProtein ? np.protein : null };
      costCache.clear();
      week = { ...(week || {}), rejects: [] };
      generate(Date.now());
      ui.mode = 'week';
      ui.tab = 'meals';
      render();
      window.scrollTo(0, 0);
    });
    const cancel = $('#cancel-setup');
    if (cancel) cancel.onclick = () => { ui.mode = 'week'; render(); };
  }

  function renderWeek() {
    const t = targets();
    const plan = schedule();
    const list = shoppingList();
    const avg = plan.totals.reduce((a, d) => ({ kcal: a.kcal + d.kcal / DAYS, protein: a.protein + d.protein / DAYS }), { kcal: 0, protein: 0 });
    const over = list.total > profile.budget;
    const pct = Math.min(100, (list.total / profile.budget) * 100);
    const proteinShort = avg.protein < t.protein * 0.9;
    const storeName = STORES[profile.store]?.name || 'your store';
    const remaining = list.items.filter((i) => !checked[i.key]).length;

    view.innerHTML = `
      <header class="page-head">
        <h1 class="page-title">Your week</h1>
        <p class="lede">${esc(GOALS[profile.goal].label)}, ${fmt(t.kcal)} cal and ${t.protein} g protein a day.</p>
      </header>

      <section class="panel summary" aria-label="Plan summary">
        <div class="stat-row">
          <div><b>${fmt(Math.round(avg.kcal / 10) * 10)}</b><span>cal a day</span></div>
          <div class="${proteinShort ? 'short' : ''}"><b>${Math.round(avg.protein)} g</b><span>protein a day</span></div>
          <div class="${over ? 'short' : ''}"><b>${money(list.total)}</b><span>estimated at ${esc(storeName)}</span></div>
        </div>
        <div class="budget" role="img" aria-label="${money(list.total)} of ${money(profile.budget)} budget">
          <i style="width:${pct}%" class="${over ? 'over' : ''}"></i>
        </div>
        <p class="muted">${over
          ? `Over your ${money(profile.budget)} budget by ${money(list.total - profile.budget)}. Try New plan, swap a pricey recipe, or mark things you already have in Kitchen.`
          : `${money(profile.budget - list.total)} under your ${money(profile.budget)} budget.`}</p>
        ${profile.avoid?.length ? `<p class="muted nope-line">Skipping ${profile.avoid.map((a) => `<s>${esc(a)}</s>`).join(', ')}.</p>` : ''}
        ${proteinShort ? `<p class="muted">These recipes fall about ${Math.round(t.protein - avg.protein)} g short on protein a day.${profile.shake ? '' : ' Turning on the daily protein shake in Edit goals closes part of the gap.'}</p>` : ''}
        <div class="row-btns">
          <button class="btn quiet" type="button" id="new-plan">New plan</button>
          <button class="btn quiet" type="button" id="edit-goals">Edit goals</button>
        </div>
      </section>

      <div class="seg tabs2" role="tablist">
        <button type="button" role="tab" data-tab="meals" aria-selected="${ui.tab === 'meals'}">Meals</button>
        <button type="button" role="tab" data-tab="list" aria-selected="${ui.tab === 'list'}">Shopping list${remaining ? ` (${remaining})` : ''}</button>
      </div>

      <div id="plan-body">${ui.tab === 'meals' ? mealsHtml(plan, t) : listHtml(list)}</div>`;

    $('#new-plan').onclick = () => { week.rejects = []; generate(Date.now()); renderWeek(); };
    $('#edit-goals').onclick = () => { ui.mode = 'setup'; render(); window.scrollTo(0, 0); };
    view.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { ui.tab = b.dataset.tab; renderWeek(); }; });
    const body = $('#plan-body');
    body.onclick = (e) => {
      const sw = e.target.closest('[data-swap]');
      if (sw) { swap(sw.dataset.kind, sw.dataset.swap); renderWeek(); return; }
      const pr = e.target.closest('[data-price]');
      if (pr) { editPrice(pr.dataset.price, Number(pr.dataset.current), pr.dataset.unit); return; }
      if (e.target.id === 'share-list') shareList(list);
      if (e.target.id === 'uncheck-all') { checked = {}; save(); renderWeek(); }
    };
    body.onchange = (e) => {
      const cb = e.target.closest('input[data-item]');
      if (!cb) return;
      checked[cb.dataset.item] = cb.checked;
      save();
      const tab = view.querySelector('[data-tab="list"]');
      const left = list.items.filter((i) => !checked[i.key]).length;
      tab.textContent = `Shopping list${left ? ` (${left})` : ''}`;
    };
  }

  function mealsHtml(plan) {
    const kinds = [['b', week.b], ['m', week.m], ['s', week.s]];
    const labels = { b: 'Breakfast', m: 'Lunch & dinner', s: 'Sides' };
    const recipeRows = kinds.map(([kind, ids]) => ids.map((id) => {
      const batch = plan.batches.get(id);
      if (!batch) return '';
      const r = batch.r;
      const makes = Math.round(r.s * batch.factor * 10) / 10;
      return `<li class="cook-row">
        <a href="#/r/${encodeURIComponent(r.id)}"><b>${esc(r.t)}</b>
          <span class="meta"><span>${labels[kind]}</span><span>${batch.factor === 1 ? `Makes ${r.s} servings` : `${batch.factor}× batch, ${makes} servings`}</span><span>${fmt(r.k)} cal, ${r.p} g protein each</span></span></a>
        <button class="btn quiet small" type="button" data-swap="${esc(r.id)}" data-kind="${kind}">Swap</button>
      </li>`;
    }).join('')).join('');

    const start = new Date().getDay();
    const mealName = { b: 'Breakfast', l: 'Lunch', d: 'Dinner' };
    const dayCards = plan.days.map((day, i) => {
      const tot = plan.totals[i];
      const meals = ['b', 'l', 'd'].map((meal) => `
        <div class="meal">
          <span class="meal-name">${mealName[meal]}</span>
          <div>${day[meal].map((x) => `<a class="meal-item" href="#/r/${encodeURIComponent(x.r.id)}">
              ${esc(x.r.t)}<span class="portion">${x.portions === 1 ? '1 serving' : `${fmtQty(x.portions)} servings`}</span>${x.cook ? '<span class="tag cook">Cook</span>' : x.side ? '' : '<span class="tag">Leftovers</span>'}
            </a>`).join('') || '<span class="muted">Your choice</span>'}</div>
        </div>`).join('');
      return `<li class="day">
        <h3>${DAY_NAMES[(start + i) % 7]}<span>${fmt(Math.round(tot.kcal / 10) * 10)} cal, ${Math.round(tot.protein)} g protein</span></h3>
        ${meals}
      </li>`;
    }).join('');

    return `
      <h2 class="section">Recipes to cook</h2>
      <p class="muted">Cook each once and eat it for a few meals. Swap any you don't like.</p>
      <ul class="cook-list">${recipeRows}</ul>
      <h2 class="section">Day by day</h2>
      <ul class="days">${dayCards}</ul>`;
  }

  function listHtml(list) {
    const groups = new Map(AISLES.map((a) => [a, []]));
    for (const item of list.items) (groups.get(item.aisle) || groups.get('Other')).push(item);
    const storeName = STORES[profile.store]?.name || 'store';
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const sections = [...groups.entries()].filter(([, items]) => items.length).map(([aisle, items]) => `
      <h3 class="aisle">${esc(aisle)}</h3>
      <ul class="shop">${items.sort((a, b) => a.name.localeCompare(b.name)).map((it) => `<li>
        <label><input type="checkbox" data-item="${esc(it.key)}" ${checked[it.key] ? 'checked' : ''}><span class="box"></span>
          <span class="shop-name">${esc(cap(it.name))}<small>${esc(it.text)}</small></span></label>
        <button type="button" class="price ${it.custom ? 'custom' : ''}" data-price="${esc(it.key)}" data-current="${it.price}" data-unit="${esc(it.unit)}"
          aria-label="Edit price for ${esc(it.name)}, ${money(it.cost)}">${money(it.cost)}${it.est ? '*' : ''}</button>
      </li>`).join('')}</ul>`).join('');

    return `
      <p class="muted">Estimated ${esc(storeName)} prices. Tap a price to set what you actually pay; Remi remembers it.</p>
      ${sections || '<div class="empty"><h3>Nothing to buy</h3><p>You already have everything for this week.</p></div>'}
      ${list.checks.length ? `<h3 class="aisle">Check your pantry</h3><p class="muted">Small amounts of basics. Grab any you're out of.</p>
        <p class="pantry-check">${list.checks.map((c) => esc(c)).join(', ')}</p>` : ''}
      ${list.have.length ? `<details class="have"><summary>Already in your kitchen (${list.have.length})</summary><p>${list.have.map((c) => esc(c)).join(', ')}</p></details>` : ''}
      <div class="list-total"><span>Estimated total</span><b>${money(list.total)}</b></div>
      <div class="row-btns">
        <button class="btn" type="button" id="share-list">Share list</button>
        <button class="btn quiet" type="button" id="uncheck-all">Uncheck all</button>
      </div>
      ${list.items.some((i) => i.est) ? '<p class="muted">* No price on file yet; set one once you know it.</p>' : ''}`;
  }

  function editPrice(key, current, unit) {
    const value = prompt(`Price ${unit} at ${STORES[profile.store]?.name || 'your store'} for ${key}`, current.toFixed(2));
    if (value == null) return;
    const n = Number(String(value).replace(/[^0-9.]/g, ''));
    overrides[profile.store] = overrides[profile.store] || {};
    if (!value.trim()) delete overrides[profile.store][key];
    else if (n > 0) overrides[profile.store][key] = Math.round(n * 100) / 100;
    costCache.clear();
    save();
    renderWeek();
  }

  async function shareList(list) {
    const lines = [`Remi shopping list (${STORES[profile.store]?.name}), about ${money(list.total)}`, ''];
    const groups = new Map();
    for (const it of list.items) {
      if (checked[it.key]) continue;
      if (!groups.has(it.aisle)) groups.set(it.aisle, []);
      groups.get(it.aisle).push(`☐ ${it.name}, ${it.text}`);
    }
    for (const aisle of AISLES) if (groups.has(aisle)) lines.push(aisle, ...groups.get(aisle), '');
    if (list.checks.length) lines.push('Check pantry', list.checks.join(', '));
    const text = lines.join('\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Shopping list', text });
      else { await navigator.clipboard.writeText(text); alert('Shopping list copied.'); }
    } catch { /* share sheet dismissed */ }
  }

  const $ = (sel) => view.querySelector(sel);

  return { render, load, refreshCosts: () => costCache.clear() };
}
