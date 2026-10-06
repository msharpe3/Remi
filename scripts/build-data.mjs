#!/usr/bin/env node
// Builds Remi's recipe library from free, copyright-safe sources and writes:
//   data/index.json  – compact search index the app loads once
//   data/r/<n>.json  – full recipes, ~150 per file, loaded when you open one
//
// Sources
//   w  Wikibooks Cookbook          CC BY-SA 4.0   (MediaWiki API)
//   m  USDA MyPlate Kitchen        public domain  (preserved at myplate.food)
//   p  Public Domain Recipes       public domain  (GitHub repo, cloned by the workflow)
//
// If a source fails or comes back empty, the recipes it produced last time are
// kept, so one flaky site never wipes out part of your library.
//
//   data/plan.json   – recipes with nutrition, amounts parsed, for the meal planner
//
// Usage: node scripts/build-data.mjs [--only=w,m,p] [--pdr-dir=path] [--limit=N]
//        node scripts/build-data.mjs --plan-only   (rebuild plan.json from the current data)

import { readFile, writeFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeIngredient, dietTags } from '../js/normalize.js';
import { parseQuantity } from '../js/quantity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const CHUNK_SIZE = 150;
const UA = 'RemiRecipeBuilder/1.0 (personal recipe app; https://github.com/msharpe3/Remi)';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const ONLY = args.only ? new Set(args.only.split(',')) : new Set(['w', 'm', 'p']);
const LIMIT = args.limit ? Number(args.limit) : Infinity;

export const SOURCES = {
  w: {
    name: 'Wikibooks Cookbook',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    home: 'https://en.wikibooks.org/wiki/Cookbook:Recipes',
    credit: 'From the Wikibooks Cookbook, by Wikibooks contributors. Shared under CC BY-SA 4.0.',
  },
  m: {
    name: 'USDA MyPlate Kitchen',
    license: 'Public domain',
    licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    home: 'https://myplate.food/recipes',
    credit: 'Recipes from the USDA MyPlate Kitchen collection, preserved at MyPlate.food.',
  },
  p: {
    name: 'Public Domain Recipes',
    license: 'Public domain',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    home: 'https://publicdomainrecipes.com/',
    credit: 'From PublicDomainRecipes.com. Public domain.',
  },
};

// ---------- small helpers ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

async function get(url, { json = false, tries = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : '*/*' } });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json ? await res.json() : await res.text();
    } catch (err) {
      lastErr = err;
      await sleep(1000 * 2 ** i);
    }
  }
  throw new Error(`${url}: ${lastErr?.message}`);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (err) {
        out[i] = null;
        log(`  skipped ${String(items[i]).slice(0, 80)}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

const slugify = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 80);

const decodeEntities = (s) =>
  String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&frac12;/g, '½')
    .replace(/&frac14;/g, '¼')
    .replace(/&frac34;/g, '¾')
    .replace(/&deg;/g, '°')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const tidy = (s) => decodeEntities(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function minutesFromText(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  const iso = t.match(/^p(?:t)?(?:(\d+)h)?(?:(\d+)m)?/i);
  if (/^pt/i.test(t) && iso && (iso[1] || iso[2])) return Number(iso[1] || 0) * 60 + Number(iso[2] || 0);
  let mins = 0;
  const h = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  const m = t.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (h) mins += Math.round(Number(h[1]) * 60);
  if (m) mins += Number(m[1]);
  return mins || null;
}

const numberFrom = (v) => {
  if (v == null) return null;
  const m = String(v).replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Math.round(Number(m[0])) : null;
};

const COURSES = [
  ['d', /\b(drink|beverage|smoothie|cocktail|lemonade|punch|milkshake|shake|latte|cocoa|cider|tea|coffee)\b/],
  ['s', /\b(dessert|cake|cupcake|cookie|brownie|pudding|ice cream|sorbet|candy|fudge|tart|cobbler|crumble|custard|frosting|icing|cheesecake|sweet|pastry|pie)\b/],
  ['b', /\b(breakfast|pancake|waffle|omelet|omelette|oatmeal|porridge|granola|french toast|frittata|scrambled|muesli|crepe)\b/],
  ['u', /\b(soup|stew|chili|chilli|chowder|bisque|gumbo|broth|pho|ramen)\b/],
  ['l', /\b(salad|slaw|coleslaw)\b/],
  ['c', /\b(sauce|dressing|dip|salsa|condiment|marinade|gravy|spread|jam|jelly|chutney|pickle|pesto|relish|vinaigrette|seasoning|rub)\b/],
  ['r', /\b(bread|biscuit|roll|bun|dough|scone|loaf|tortilla|flatbread|focaccia|bagel|muffin|cornbread|naan|pita)\b/],
  ['n', /\b(snack|appetizer|starter|finger food|hors d|bites)\b/],
  ['i', /\b(side dish|side|vegetable dish)\b/],
];
function courseOf(...texts) {
  const t = texts.filter(Boolean).join(' ').toLowerCase().replace(/pot pie|shepherd'?s pie|meat pie|cottage pie/g, 'casserole');
  for (const [code, re] of COURSES) if (re.test(t)) return code;
  return 'm';
}

// ---------- Wikibooks ----------

const WB_API = 'https://en.wikibooks.org/w/api.php';

async function wbQuery(params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params });
  return get(`${WB_API}?${qs}`, { json: true });
}

async function wbListAll(params, listKey) {
  const titles = [];
  let cont = {};
  for (;;) {
    const data = await wbQuery({ action: 'query', ...params, ...cont });
    for (const p of data?.query?.[listKey] || []) titles.push(p.title);
    if (!data?.continue) break;
    cont = data.continue;
    await sleep(200);
  }
  return titles;
}

// Split template params on top-level "|" (ignoring pipes inside [[ ]] and {{ }}).
function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if ((two === '}}' || two === ']]') && depth > 0) { depth--; cur += two; i++; continue; }
    if (s[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  parts.push(cur);
  return parts;
}

function extractTemplate(text, nameRe) {
  const m = text.match(new RegExp(`\\{\\{\\s*${nameRe}`, 'i'));
  if (!m) return null;
  let depth = 0;
  for (let i = m.index; i < text.length - 1; i++) {
    if (text.slice(i, i + 2) === '{{') { depth++; i++; } else if (text.slice(i, i + 2) === '}}') {
      depth--; i++;
      if (depth === 0) {
        const inner = text.slice(m.index + 2, i - 1);
        const params = {};
        const positional = ['category', 'servings', 'time', 'difficulty', 'image'];
        let pos = 0;
        for (const part of splitTopLevel(inner).slice(1)) {
          const eq = part.indexOf('=');
          const key = eq > 0 ? part.slice(0, eq).trim().toLowerCase() : '';
          if (key && /^[a-z_ ]+$/.test(key)) params[key] = part.slice(eq + 1).trim();
          else if (positional[pos]) params[positional[pos++]] = part.trim();
        }
        return params;
      }
    }
  }
  return null;
}

function replaceTemplates(s) {
  // Resolve innermost templates first, keeping the text a few common ones carry.
  let prev;
  do {
    prev = s;
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_, body) => {
      const parts = body.split('|').map((x) => x.trim());
      const name = parts[0].toLowerCase();
      if (name === 'frac' || name === 'fraction') {
        if (parts.length === 4) return `${parts[1]} ${parts[2]}/${parts[3]}`;
        if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
        return `1/${parts[1] || ''}`;
      }
      if (name === 'convert' || name === 'cvt') return `${parts[1] || ''} ${parts[2] || ''}`;
      if (/^(nowrap|nobr|small|big|lang|w|wikipedia|wp|nobold|smallcaps|abbr|sic)$/.test(name)) {
        const keep = parts.slice(1).filter((p) => !p.includes('='));
        return keep[keep.length - 1] || keep[0] || '';
      }
      if (name === 'temp' || name === 'temperature') return `${parts[1] || ''}°${parts[2] || 'F'}`;
      return '';
    });
  } while (s !== prev);
  return s;
}

function cleanWikitext(s) {
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  s = replaceTemplates(s);
  let prev;
  do {
    prev = s;
    s = s.replace(/\[\[([^[\]|]*)\|([^[\]]*)\]\]/g, (_, target, label) =>
      /^(file|image|category|media):/i.test(target.trim()) ? '' : label);
    s = s.replace(/\[\[([^[\]|]*)\]\]/g, (_, target) =>
      /^(file|image|category|media):/i.test(target.trim()) ? '' : target.replace(/^cookbook:/i, '').replace(/#.*/, ''));
  } while (s !== prev);
  s = s.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1').replace(/\[https?:\/\/[^\]]+\]/g, '');
  s = s.replace(/'''''|'''|''/g, '');
  s = s.replace(/__\w+__/g, '');
  return tidy(s);
}

function wbSections(text) {
  // Returns [{title, level, body}] for "== Heading ==" style sections.
  const lines = text.split('\n');
  const sections = [{ title: '', level: 0, body: [] }];
  for (const line of lines) {
    const h = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
    if (h) sections.push({ title: cleanWikitext(h[2]).toLowerCase(), level: h[1].length, body: [] });
    else sections[sections.length - 1].body.push(line);
  }
  return sections;
}

function wbCollect(sections, titleRe, linePrefixRe) {
  // Collect list lines from the matching top section and any deeper subsections under it.
  const out = [];
  for (let i = 0; i < sections.length; i++) {
    if (!titleRe.test(sections[i].title)) continue;
    const level = sections[i].level;
    for (let j = i; j < sections.length; j++) {
      if (j > i && sections[j].level <= level) break;
      for (const line of sections[j].body) {
        if (!linePrefixRe.test(line)) continue;
        const cleaned = cleanWikitext(line.replace(linePrefixRe, ''));
        if (cleaned && cleaned.length > 1) out.push(cleaned);
      }
    }
    if (out.length) break;
  }
  return out;
}

function wbImageName(summary, text) {
  let raw = summary?.image || '';
  if (!raw) {
    const m = text.match(/\[\[(?:file|image):([^|\]]+)/i);
    raw = m ? m[1] : '';
  }
  raw = raw.replace(/^\[\[(?:file|image):/i, '').replace(/^(?:file|image):/i, '').split('|')[0].replace(/\]\]$/, '').trim();
  return raw && /\.(jpe?g|png|gif|webp|svg)$/i.test(raw) ? raw : '';
}

function parseWikibooksPage(title, text) {
  if (!text || /^#redirect/i.test(text.trim())) return null;
  const summary = extractTemplate(text, 'recipe[ _]?summary') || {};
  const sections = wbSections(text);
  const ingredients = wbCollect(sections, /^ingredients?\b/, /^\*+\s*/);
  const steps = wbCollect(sections, /^(procedure|method|directions?|instructions?|preparation|steps|cooking|technique)\b/, /^[#*]+\s*/);
  if (ingredients.length < 2 || steps.length < 1) return null;
  const name = title.replace(/^cookbook:/i, '').trim();
  const img = wbImageName(summary, text);
  const category = cleanWikitext(summary.category || '');
  return {
    id: `w-${slugify(name)}`,
    t: name,
    src: 'w',
    url: `https://en.wikibooks.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%3A/g, ':').replace(/%2F/g, '/')}`,
    img: img ? `https://en.wikibooks.org/wiki/Special:FilePath/${encodeURIComponent(img.replace(/ /g, '_'))}?width=640` : '',
    ing: ingredients,
    steps,
    serv: cleanWikitext(summary.servings || summary.yield || '') || '',
    min: minutesFromText(cleanWikitext(summary.time || '')),
    cat: category.replace(/\s*recipes?$/i, ''),
    by: 'Wikibooks contributors',
  };
}

async function buildWikibooks() {
  log('Wikibooks: listing recipe pages…');
  const [embedded, category] = await Promise.all([
    wbListAll({ list: 'embeddedin', eititle: 'Template:Recipe summary', einamespace: '102', eilimit: '500' }, 'embeddedin'),
    wbListAll({ list: 'categorymembers', cmtitle: 'Category:Recipes', cmnamespace: '102', cmlimit: '500' }, 'categorymembers'),
  ]);
  const titles = [...new Set([...embedded, ...category])]
    .filter((t) => t.startsWith('Cookbook:') && !/^Cookbook:(Recipes|Table of Contents|Cuisines)$/i.test(t))
    .slice(0, LIMIT);
  log(`Wikibooks: ${titles.length} candidate pages`);
  const recipes = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await wbQuery({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: batch.join('|') });
    for (const page of data?.query?.pages || []) {
      const text = page?.revisions?.[0]?.slots?.main?.content;
      const r = parseWikibooksPage(page.title, text);
      if (r) recipes.push(r);
    }
    if ((i / 50) % 10 === 0) log(`  …${Math.min(i + 50, titles.length)}/${titles.length} pages read, ${recipes.length} recipes`);
    await sleep(300);
  }
  return recipes;
}

// ---------- schema.org Recipe (JSON-LD) — used for MyPlate ----------

function findRecipeNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) { const f = findRecipeNode(n); if (f) return f; }
    return null;
  }
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  if (node['@graph']) return findRecipeNode(node['@graph']);
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') { const f = findRecipeNode(v); if (f) return f; }
  }
  return null;
}

function extractJsonLdRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const r = findRecipeNode(JSON.parse(b[1].trim()));
      if (r) return r;
    } catch { /* malformed block — try the next one */ }
  }
  return null;
}

function flattenInstructions(ins) {
  if (!ins) return [];
  if (typeof ins === 'string') {
    const text = tidy(ins.replace(/<\/(p|li|br)>|<br\s*\/?>/gi, '\n'));
    return ins.includes('\n') || /<(p|li|br)/i.test(ins)
      ? ins.replace(/<\/(p|li)>|<br\s*\/?>/gi, '\n').split('\n').map(tidy).filter(Boolean)
      : text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean);
  }
  if (Array.isArray(ins)) return ins.flatMap(flattenInstructions);
  if (ins.itemListElement) return flattenInstructions(ins.itemListElement);
  if (ins.text) return [tidy(ins.text)];
  if (ins.name) return [tidy(ins.name)];
  return [];
}

function imageUrl(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return imageUrl(img[0]);
  return img.url || img.contentUrl || '';
}

function recipeFromJsonLd(r, { src, url }) {
  const name = tidy(r.name || '');
  const ing = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : r.ingredients || []).map(tidy).filter(Boolean);
  const steps = flattenInstructions(r.recipeInstructions).map((s) => s.replace(/^\d+[.)]\s*/, '')).filter(Boolean);
  if (!name || ing.length < 2 || !steps.length) return null;
  const n = r.nutrition || {};
  const nut = {
    kcal: numberFrom(n.calories),
    protein: numberFrom(n.proteinContent),
    carbs: numberFrom(n.carbohydrateContent),
    fat: numberFrom(n.fatContent),
    fiber: numberFrom(n.fiberContent),
  };
  const hasNut = Object.values(nut).some((v) => v != null);
  const yieldRaw = Array.isArray(r.recipeYield) ? r.recipeYield[r.recipeYield.length - 1] : r.recipeYield;
  const author = Array.isArray(r.author) ? r.author[0] : r.author;
  const cat = [].concat(r.recipeCategory || []).join(', ');
  return {
    id: `${src}-${slugify(name)}`,
    t: name,
    src,
    url,
    img: imageUrl(r.image),
    ing,
    steps,
    serv: yieldRaw ? tidy(String(yieldRaw)) : '',
    min: minutesFromText(r.totalTime) || (minutesFromText(r.prepTime) || 0) + (minutesFromText(r.cookTime) || 0) || null,
    cat: tidy(cat),
    kw: tidy([].concat(r.keywords || []).join(', ')),
    nut: hasNut ? nut : undefined,
    by: typeof author === 'object' ? tidy(author?.name || '') : tidy(author || ''),
  };
}

// ---------- MyPlate ----------

const MP = 'https://myplate.food';
const MP_RECIPE_URL = /^https?:\/\/(?:www\.)?myplate\.food\/recipes\/[a-z0-9][a-z0-9-]*\/?$/i;

async function mpSitemapUrls() {
  const seen = new Set();
  const found = new Set();
  const queue = [`${MP}/sitemap.xml`, `${MP}/sitemap_index.xml`, `${MP}/sitemap-index.xml`];
  const robots = await get(`${MP}/robots.txt`).catch(() => null);
  for (const m of (robots || '').matchAll(/^sitemap:\s*(\S+)/gim)) queue.unshift(m[1]);
  while (queue.length && seen.size < 60) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const xml = await get(url).catch(() => null);
    if (!xml) continue;
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      const loc = decodeEntities(m[1]);
      if (/\.xml(\.gz)?$/i.test(loc)) queue.push(loc);
      else if (MP_RECIPE_URL.test(loc)) found.add(loc.replace(/\/$/, ''));
    }
  }
  return [...found];
}

async function mpCrawlUrls() {
  const found = new Set();
  for (let page = 1; page <= 150; page++) {
    const html = await get(`${MP}/recipes${page > 1 ? `?page=${page}` : ''}`).catch(() => null);
    if (!html) break;
    const before = found.size;
    for (const m of html.matchAll(/href=["'](\/recipes\/[a-z0-9][a-z0-9-]*)\/?["']/gi)) found.add(MP + m[1]);
    if (found.size === before) break;
    await sleep(250);
  }
  return [...found];
}

async function buildMyPlate() {
  log('MyPlate: finding recipe pages…');
  let urls = await mpSitemapUrls();
  if (urls.length < 50) {
    log(`MyPlate: sitemap gave ${urls.length}; crawling the recipe listing instead`);
    urls = [...new Set([...urls, ...(await mpCrawlUrls())])];
  }
  urls = urls.slice(0, LIMIT);
  log(`MyPlate: ${urls.length} recipe pages`);
  let done = 0;
  const recipes = await mapLimit(urls, 3, async (url) => {
    const html = await get(url);
    await sleep(250);
    if (++done % 100 === 0) log(`  …${done}/${urls.length}`);
    const node = html && extractJsonLdRecipe(html);
    return node ? recipeFromJsonLd(node, { src: 'm', url }) : null;
  });
  return recipes.filter(Boolean);
}

// ---------- Public Domain Recipes (markdown files) ----------

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) out.push(p);
  }
  return out;
}

function parseFrontMatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  let lastKey = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) {
      lastKey = kv[1].toLowerCase();
      let v = kv[2].trim();
      if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      else v = v.replace(/^["']|["']$/g, '');
      fm[lastKey] = v;
    } else if (lastKey && /^\s*-\s+/.test(line)) {
      fm[lastKey] = [].concat(fm[lastKey] || []).filter(Boolean);
      fm[lastKey].push(line.replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, ''));
    }
  }
  return { fm, body: text.slice(m[0].length) };
}

const cleanMd = (s) =>
  tidy(s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, ''));

function mdSection(body, titleRe) {
  const lines = body.split('\n');
  const out = [];
  let inside = false;
  for (const line of lines) {
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) { if (inside && out.length) break; inside = titleRe.test(h[1].toLowerCase()); continue; }
    if (!inside) continue;
    const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (item) { const c = cleanMd(item[1]); if (c) out.push(c); }
  }
  return out;
}

async function buildPublicDomainRecipes() {
  const dir = args['pdr-dir'];
  if (!dir || !existsSync(dir)) throw new Error('Public Domain Recipes folder not found (pass --pdr-dir)');
  const contentDir = existsSync(path.join(dir, 'content')) ? path.join(dir, 'content') : dir;
  const files = (await walk(contentDir)).slice(0, LIMIT);
  log(`Public Domain Recipes: ${files.length} markdown files`);
  const site = 'https://publicdomainrecipes.com';
  const recipes = [];
  for (const file of files) {
    const { fm, body } = parseFrontMatter(await readFile(file, 'utf8'));
    const title = cleanMd(fm.title || '');
    const ing = mdSection(body, /ingredient/);
    const steps = mdSection(body, /direction|instruction|method|procedure|preparation|steps/);
    if (!title || ing.length < 2 || !steps.length) continue;
    const slug = path.basename(file, '.md') === 'index' ? path.basename(path.dirname(file)) : path.basename(file, '.md');
    let img = [].concat(fm.image || fm.cover || fm.thumbnail || [])[0] || (body.match(/!\[[^\]]*\]\(([^)\s]+)/) || [])[1] || '';
    if (img && !/^https?:/.test(img)) img = `${site}/${img.replace(/^\/+/, '')}`;
    const tags = [].concat(fm.tags || []).join(', ');
    recipes.push({
      id: `p-${slugify(title)}`,
      t: title,
      src: 'p',
      url: `${site}/${slug}/`,
      img,
      ing,
      steps,
      serv: String(fm.servings || fm.serves || ''),
      min: minutesFromText(fm.totaltime || fm.total_time || fm.cook || fm.cooktime || ''),
      cat: tidy(tags),
      by: cleanMd([].concat(fm.author || fm.authors || [])[0] || ''),
    });
  }
  return recipes;
}

// ---------- previous build (fallback when a source fails) ----------

async function previousRecipes(srcCode) {
  const idxPath = path.join(DATA, 'index.json');
  if (!existsSync(idxPath)) return [];
  try {
    const idx = JSON.parse(await readFile(idxPath, 'utf8'));
    const out = [];
    for (let c = 0; c < idx.chunks; c++) {
      const chunk = JSON.parse(await readFile(path.join(DATA, 'r', `${c}.json`), 'utf8'));
      out.push(...chunk.filter((r) => r.src === srcCode));
    }
    return out;
  } catch {
    return [];
  }
}

// Shortens image URLs in the index; the app expands the prefixes back.
const IMAGE_PREFIXES = [
  ['~w', 'https://en.wikibooks.org/wiki/Special:FilePath/'],
  ['~m', 'https://myplate.food/'],
  ['~p', 'https://publicdomainrecipes.com/'],
];
function compactImage(url) {
  if (!url) return '';
  for (const [code, prefix] of IMAGE_PREFIXES) {
    if (url.startsWith(prefix)) return code + url.slice(prefix.length).replace(/\?width=\d+$/, '');
  }
  return url;
}

// ---------- meal planner data ----------

const PLAN_COURSES = new Set(['b', 'm', 'u', 'l', 'i', 'n']);
function servingsOf(s) {
  const m = String(s || '').match(/\d+/);
  const n = m ? Number(m[0]) : 0;
  return n >= 1 && n <= 24 ? n : 0;
}

function planData(recipes) {
  const out = [];
  for (const r of recipes) {
    if (!r.nut || r.nut.kcal == null || r.nut.kcal < 20 || !PLAN_COURSES.has(r.course)) continue;
    const s = servingsOf(r.serv);
    if (!s) continue;
    const ing = [];
    for (const line of r.ing) {
      const n = normalizeIngredient(line);
      if (!n) continue;
      const { q, u, size } = parseQuantity(line);
      ing.push(size ? [n, q, u, size.q, size.u] : q != null ? [n, q, u] : [n]);
    }
    if (ing.length < 2) continue;
    out.push({
      id: r.id, t: r.t, c: r.course, s,
      k: r.nut.kcal, p: r.nut.protein ?? 0, cb: r.nut.carbs ?? null, f: r.nut.fat ?? null,
      v: (r.diet.vegetarian ? 1 : 0) | (r.diet.vegan ? 2 : 0),
      ing,
    });
  }
  return out;
}

async function writePlan(recipes) {
  const plan = planData(recipes);
  await writeFile(path.join(DATA, 'plan.json'), JSON.stringify({ version: 1, builtAt: new Date().toISOString(), recipes: plan }));
  const size = (await stat(path.join(DATA, 'plan.json'))).size;
  log(`plan.json ${(size / 1024).toFixed(0)} KB, ${plan.length} recipes with nutrition`);
}

async function planOnly() {
  const idx = JSON.parse(await readFile(path.join(DATA, 'index.json'), 'utf8'));
  const rows = new Map(idx.recipes.map((r) => [r[0], r]));
  const recipes = [];
  for (let c = 0; c < idx.chunks; c++) {
    for (const r of JSON.parse(await readFile(path.join(DATA, 'r', `${c}.json`), 'utf8'))) {
      const row = rows.get(r.id);
      if (row) recipes.push({ ...r, course: row[9], diet: dietTags([...new Set(r.ing.map(normalizeIngredient).filter(Boolean))], r.t) });
    }
  }
  await writePlan(recipes);
}

// ---------- assemble ----------

function finalize(all) {
  // De-duplicate: same id within a source gets a numeric suffix; same title
  // across sources keeps the version with nutrition info (or the first one).
  const byTitle = new Map();
  for (const r of all) {
    const key = r.t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const existing = byTitle.get(key);
    if (!existing) byTitle.set(key, r);
    else if (!existing.nut && r.nut) byTitle.set(key, r);
  }
  const ids = new Set();
  const recipes = [];
  for (const r of byTitle.values()) {
    let id = r.id;
    for (let n = 2; ids.has(id); n++) id = `${r.id}-${n}`;
    ids.add(id);
    const names = [...new Set(r.ing.map(normalizeIngredient).filter(Boolean))];
    if (names.length < 2) continue;
    const diet = dietTags(names, r.t);
    recipes.push({ ...r, id, names, diet, course: courseOf(r.cat, r.kw, r.t) });
  }
  recipes.sort((a, b) => a.t.localeCompare(b.t));
  return recipes;
}

async function main() {
  const builders = { w: buildWikibooks, m: buildMyPlate, p: buildPublicDomainRecipes };
  const counts = {};
  let all = [];
  for (const code of ['w', 'm', 'p']) {
    let recipes = [];
    if (ONLY.has(code)) {
      try {
        recipes = await builders[code]();
        log(`${SOURCES[code].name}: ${recipes.length} recipes`);
      } catch (err) {
        log(`${SOURCES[code].name}: FAILED — ${err.message}`);
      }
    }
    if (!recipes.length) {
      recipes = await previousRecipes(code);
      if (recipes.length) log(`${SOURCES[code].name}: kept ${recipes.length} recipes from the last build`);
    }
    counts[code] = recipes.length;
    all = all.concat(recipes);
  }

  const recipes = finalize(all);
  if (!recipes.length) {
    console.error('No recipes were built. Leaving existing data untouched.');
    process.exit(1);
  }

  // Ingredient vocabulary, most common first.
  const freq = new Map();
  for (const r of recipes) for (const n of r.names) freq.set(n, (freq.get(n) || 0) + 1);
  const vocab = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const vocabIndex = new Map(vocab.map(([n], i) => [n, i]));

  const rows = [];
  const chunks = [];
  recipes.forEach((r, i) => {
    const chunk = Math.floor(i / CHUNK_SIZE);
    (chunks[chunk] ||= []).push({
      id: r.id, t: r.t, src: r.src, url: r.url, img: r.img, ing: r.ing, steps: r.steps,
      serv: r.serv || undefined, min: r.min || undefined, cat: r.cat || undefined,
      nut: r.nut, by: r.by || undefined,
    });
    const flags = (r.diet.vegetarian ? 1 : 0) | (r.diet.vegan ? 2 : 0) | (r.img ? 4 : 0);
    rows.push([
      r.id, r.t, r.src, chunk,
      r.names.map((n) => vocabIndex.get(n)),
      r.nut?.kcal ?? null, r.nut?.protein ?? null, r.min ?? null,
      flags, r.course, compactImage(r.img),
    ]);
  });

  await rm(path.join(DATA, 'r'), { recursive: true, force: true });
  await mkdir(path.join(DATA, 'r'), { recursive: true });
  await Promise.all(chunks.map((c, i) => writeFile(path.join(DATA, 'r', `${i}.json`), JSON.stringify(c))));

  const finalCounts = {};
  for (const r of recipes) finalCounts[r.src] = (finalCounts[r.src] || 0) + 1;
  const index = {
    version: 1,
    builtAt: new Date().toISOString(),
    total: recipes.length,
    chunks: chunks.length,
    counts: finalCounts,
    sources: SOURCES,
    ings: vocab.map(([n, c]) => [n, c]),
    recipes: rows,
  };
  await writeFile(path.join(DATA, 'index.json'), JSON.stringify(index));
  await writePlan(recipes);
  const size = (await stat(path.join(DATA, 'index.json'))).size;
  log(`\nDone: ${recipes.length} recipes (${Object.entries(finalCounts).map(([k, v]) => `${SOURCES[k].name} ${v}`).join(', ')})`);
  log(`index.json ${(size / 1024).toFixed(0)} KB, ${chunks.length} recipe files, ${vocab.length} ingredients`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (args['plan-only'] ? planOnly() : main()).catch((err) => { console.error(err); process.exit(1); });
}

export { parseWikibooksPage, extractJsonLdRecipe, recipeFromJsonLd, parseFrontMatter, mdSection, courseOf };
