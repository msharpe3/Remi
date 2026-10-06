// Reads the amount at the start of an ingredient line:
//   "1 1/2 cups brown rice"            → { q: 1.5, u: 'cup' }
//   "1 can (15.5 ounces) black beans"  → { q: 1, u: 'can', size: { q: 15.5, u: 'oz' } }
//   "2 boneless chicken breasts"       → { q: 2, u: 'each' }
// Used by the data builder to give the meal planner shopping amounts.

const FRACTIONS = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅕': '1/5' };

const UNIT_WORDS = [
  [/^(cups?|c)\b/, 'cup'],
  [/^(tablespoons?|tbsps?|tbs|tbl|t)\b/, 'tbsp'],
  [/^(teaspoons?|tsps?)\b/, 'tsp'],
  [/^(fluid ounces?|fl\.? ?oz)\b/, 'floz'],
  [/^(ounces?|oz)\b/, 'oz'],
  [/^(pounds?|lbs?)\b/, 'lb'],
  [/^(grams?|g)\b/, 'g'],
  [/^(kilograms?|kg)\b/, 'kg'],
  [/^(milliliters?|millilitres?|ml)\b/, 'ml'],
  [/^(liters?|litres?|l)\b/, 'l'],
  [/^(quarts?|qt)\b/, 'qt'],
  [/^(pints?|pt)\b/, 'pt'],
  [/^(gallons?|gal)\b/, 'gal'],
  [/^(cans?|tins?)\b/, 'can'],
  [/^(packages?|pkgs?|packets?|boxes|box|bags?|jars?|bottles?|cartons?|containers?|envelopes?)\b/, 'pkg'],
  [/^(cloves?)\b/, 'clove'],
  [/^(slices?)\b/, 'slice'],
  [/^(stalks?|ribs?)\b/, 'stalk'],
  [/^(heads?)\b/, 'head'],
  [/^(bunch(es)?)\b/, 'bunch'],
  [/^(pinch(es)?|dash(es)?)\b/, 'pinch'],
  [/^(sticks?)\b/, 'stick'],
];

function num(s) {
  s = s.trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(s);
}

const NUM = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`;

export function parseQuantity(raw) {
  let s = String(raw || '').toLowerCase().replace(/[¼½¾⅓⅔⅛⅜⅝⅞⅕]/g, (f) => ` ${FRACTIONS[f]}`).replace(/[–—]/g, '-');
  s = s.replace(/(\d)\s+(\d\/\d)/g, '$1 $2').replace(/^\s+/, '');

  let size = null;
  const inParens = s.match(/\(([^)]*)\)/);
  if (inParens) {
    const m = inParens[1].match(new RegExp(`${NUM}[\\s-]*(fluid ounces?|fl\\.? ?oz|ounces?|oz|pounds?|lbs?|grams?|g)\\b`));
    if (m) size = { q: num(m[1]), u: /pound|lb/.test(m[2]) ? 'lb' : /gram|^g$/.test(m[2]) ? 'g' : 'oz' };
  }

  const lead = s.match(new RegExp(`^${NUM}(?:\\s*(?:-|to)\\s*${NUM})?`));
  if (!lead) return { q: null, u: null, size };
  const q = num(lead[1]);
  let rest = s.slice(lead[0].length).replace(/\([^)]*\)/g, ' ').trim();
  rest = rest.replace(/^(large|medium|small|heaping|level|rounded|scant|generous)\s+/, '');
  for (const [re, unit] of UNIT_WORDS) {
    if (re.test(rest)) return { q, u: unit, size: unit === 'can' || unit === 'pkg' ? size : null };
  }
  return { q, u: 'each', size: null };
}
