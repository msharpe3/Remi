// Live recipes from TheMealDB (free test key "1"). Nothing from here is stored
// in the repo; results are cached on the phone for the session.

import { normalizeIngredient } from './normalize.js';

const BASE = 'https://www.themealdb.com/api/json/v1/1/';
const inflight = new Map();

function getJSON(url) {
  if (inflight.has(url)) return inflight.get(url);
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`TheMealDB ${r.status}`);
    return r.json();
  });
  inflight.set(url, p);
  p.catch(() => inflight.delete(url));
  return p;
}

function splitSteps(text) {
  if (!text) return [];
  let steps = text
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^step\s*\d+[:.]?$/i.test(s) && !/^\d+\.?$/.test(s))
    .map((s) => s.replace(/^(step\s*)?\d+[.):-]?\s+/i, ''));
  if (steps.length === 1) steps = steps[0].split(/(?<=[.!?])\s+(?=[A-Z])/);
  return steps.filter(Boolean);
}

export function toRecipe(m) {
  const ing = [];
  const names = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] || '').trim();
    if (!name) continue;
    const measure = (m[`strMeasure${i}`] || '').trim();
    ing.push(measure ? `${measure} ${name}` : name);
    const n = normalizeIngredient(name) || name.toLowerCase();
    if (!names.includes(n)) names.push(n);
  }
  return {
    id: `tm-${m.idMeal}`,
    t: m.strMeal,
    src: 'tm',
    url: `https://www.themealdb.com/meal/${m.idMeal}`,
    img: m.strMealThumb || '',
    ing,
    names,
    steps: splitSteps(m.strInstructions),
    cat: [m.strArea, m.strCategory].filter(Boolean).join(' '),
    video: m.strYoutube || '',
  };
}

export async function lookup(idMeal) {
  const key = `remi:tm:${idMeal}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch { /* storage unavailable */ }
  const data = await getJSON(`${BASE}lookup.php?i=${encodeURIComponent(idMeal)}`);
  const meal = data?.meals?.[0];
  if (!meal) return null;
  const recipe = toRecipe(meal);
  try { sessionStorage.setItem(key, JSON.stringify(recipe)); } catch { /* full or blocked */ }
  return recipe;
}

// Recipes that use the given pantry items, best overlap first.
export async function forPantry(terms, limit = 12) {
  const lists = await Promise.allSettled(
    terms.slice(0, 3).map((t) => getJSON(`${BASE}filter.php?i=${encodeURIComponent(t.replace(/ /g, '_'))}`)),
  );
  const score = new Map();
  for (const l of lists) {
    if (l.status !== 'fulfilled') continue;
    for (const m of l.value?.meals || []) score.set(m.idMeal, (score.get(m.idMeal) || 0) + 1);
  }
  if (!score.size && lists.every((l) => l.status === 'rejected')) throw new Error('offline');
  const ids = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  const recs = await Promise.allSettled(ids.map(lookup));
  return recs.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
}

export async function byName(q) {
  const data = await getJSON(`${BASE}search.php?s=${encodeURIComponent(q)}`);
  return (data?.meals || []).slice(0, 15).map(toRecipe);
}
