// Turns a raw ingredient line ("2 cups finely chopped fresh tomatoes, seeded")
// into a short canonical name ("tomato"). Shared by the data builder (Node)
// and the app (browser) so pantry input and recipe data match the same way.

const UNICODE_FRACTIONS = /[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g;

const UNITS = new Set(`
  cup cups c tablespoon tablespoons tbsp tbs tbl tb t teaspoon teaspoons tsp ts
  ounce ounces oz fl pound pounds lb lbs gram grams g kilogram kilograms kg
  milliliter milliliters millilitre millilitres ml liter liters litre litres l dl cl
  quart quarts qt pint pints pt gallon gallons gal
  pinch pinches dash dashes drop drops sprig sprigs stalk stalks head heads
  clove cloves can cans tin tins jar jars package packages pkg pkgs packet packets
  bag bags box boxes bottle bottles container containers carton cartons
  slice slices stick sticks bunch bunches handful handfuls piece pieces
  cube cubes strip strips sheet sheets fillet fillets loaf loaves scoop scoops
  envelope envelopes block blocks bar bars ear ears
  inch inches cm mm large medium small big little whole half halves quarter quarters
  heaping heaped level rounded scant generous good few some about approximately
  x of
`.split(/\s+/).filter(Boolean));

// Words that describe preparation or quality, not what the ingredient is.
const DESCRIPTORS = new Set(`
  fresh freshly frozen thawed canned dried dry cooked uncooked raw ripe overripe
  chopped diced minced sliced grated shredded crushed mashed cubed julienned
  quartered halved trimmed peeled unpeeled seeded deseeded pitted cored stemmed
  rinsed drained washed cleaned beaten whisked sifted softened melted cold warm
  chilled boiling lukewarm room temperature finely coarsely roughly thinly thickly
  lightly firmly loosely packed divided optional plus more extra additional
  boneless skinless bone-in skin-on lean trimmed
  low-fat lowfat reduced-fat fat-free nonfat non-fat skim part-skim light
  low-sodium reduced-sodium no-salt-added unsalted salted sodium-free
  sugar-free unsweetened sweetened organic natural plain prepared store-bought homemade
  virgin cut into pieces bite-size bite-sized size sized taste needed desired
  serving garnish for to and or the a an your favorite good-quality quality
`.split(/\s+/).filter(Boolean));

const MEATS = new Set(['beef', 'turkey', 'pork', 'chicken', 'lamb', 'veal', 'sausage', 'bison']);

// Words that look plural but aren't (or shouldn't be singularized).
const KEEP_S = new Set(`
  asparagus hummus couscous molasses swiss grits oats lentils brussels
  citrus octopus hibiscus series watercress cress bass bus gas chess
  greens jus quinoa tahini
`.split(/\s+/).filter(Boolean));

// Common spelling variants mapped to one name.
const ALIASES = {
  'scallion': 'green onion',
  'spring onion': 'green onion',
  'garbanzo bean': 'chickpea',
  'garbanzo': 'chickpea',
  'cilantro leaf': 'cilantro',
  'coriander leaf': 'cilantro',
  'courgette': 'zucchini',
  'aubergine': 'eggplant',
  'capsicum': 'bell pepper',
  'green bell pepper': 'bell pepper',
  'red bell pepper': 'bell pepper',
  'yellow bell pepper': 'bell pepper',
  'orange bell pepper': 'bell pepper',
  'sweet pepper': 'bell pepper',
  'all-purpose flour': 'flour',
  'all purpose flour': 'flour',
  'plain flour': 'flour',
  'white flour': 'flour',
  'granulated sugar': 'sugar',
  'white sugar': 'sugar',
  'caster sugar': 'sugar',
  'black pepper': 'black pepper',
  'ground black pepper': 'black pepper',
  'pepper': 'black pepper',
  'kosher salt': 'salt',
  'sea salt': 'salt',
  'table salt': 'salt',
  'salt and pepper': 'salt',
  'salt and black pepper': 'salt',
  'salt pepper': 'salt',
  'salt black pepper': 'salt',
  'hot water': 'water',
  'extra virgin olive oil': 'olive oil',
  'canola oil': 'vegetable oil',
  'cooking oil': 'vegetable oil',
  'egg yolk': 'egg',
  'egg white': 'egg white',
  'large egg': 'egg',
  'whole milk': 'milk',
  '2% milk': 'milk',
  'skim milk': 'milk',
  'chicken breast half': 'chicken breast',
  'chicken stock': 'chicken broth',
  'beef stock': 'beef broth',
  'vegetable stock': 'vegetable broth',
  'nonstick cooking spray': 'cooking spray',
  'vegetable cooking spray': 'cooking spray',
  'confectioners sugar': 'powdered sugar',
  "confectioners' sugar": 'powdered sugar',
  'icing sugar': 'powdered sugar',
};

function singular(word) {
  if (word.length < 4 || KEEP_S.has(word)) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('ves') && !word.endsWith('olives')) return word.slice(0, -3) + 'f';
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

export function normalizeIngredient(raw) {
  if (!raw) return '';
  let s = String(raw).toLowerCase();
  s = s.replace(/half[- ]and[- ]half/g, 'half-and-half');
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  // Drop "or ..." alternatives and anything after the first comma or semicolon.
  s = s.split(/[,;:]| - | – | — /)[0];
  s = s.replace(/\bor\b.*$/, ' ');
  s = s.replace(UNICODE_FRACTIONS, ' ');
  s = s.replace(/\d+([\/.,-]\d+)*(%)?/g, (m) => (m.endsWith('%') ? m : ' '));
  s = s.replace(/[^a-z%'\s-]/g, ' ');
  let words = s.split(/\s+/).filter(Boolean).map((w) => w.replace(/^['-]+|['-]+$/g, ''));
  words = words.filter((w, i) => {
    if (!w) return false;
    if (UNITS.has(w)) return false;
    if (w === 'ground') return MEATS.has(words[i + 1]);
    if (DESCRIPTORS.has(w)) return false;
    return true;
  });
  if (!words.length) return '';
  // Keep at most the last three words — the ingredient's name usually ends the phrase.
  words = words.slice(-3);
  words[words.length - 1] = singular(words[words.length - 1]);
  let name = words.join(' ').trim();
  if (ALIASES[name]) name = ALIASES[name];
  return name.length >= 2 ? name : '';
}

// Does a pantry term ("chicken") cover a recipe ingredient ("chicken breast")?
// Every word of the pantry term must appear in the ingredient as a whole word.
export function pantryCovers(term, ingredient) {
  if (term === ingredient) return true;
  const have = ingredient.split(' ');
  return term.split(' ').every((w) => have.includes(w));
}

const MEAT_WORDS = /\b(beef|steak|pork|bacon|ham|sausage|chicken|turkey|duck|lamb|veal|venison|bison|goat|rabbit|chorizo|pepperoni|salami|prosciutto|pancetta|meat|fish|salmon|tuna|cod|tilapia|trout|halibut|sardine|anchov|shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|squid|octopus|gelatin|lard|broth|stock|bouillon|worcestershire)\b/;
const ANIMAL_WORDS = /\b(milk|butter|cheese|cream|yogurt|yoghurt|egg|honey|ghee|buttermilk|mayonnaise|whey|custard)\b/;
const PLANT_OK = /\b(vegetable broth|vegetable stock|almond milk|soy milk|oat milk|coconut milk|rice milk|peanut butter|almond butter|cocoa butter|coconut cream|vegan|cashew cream|nut butter|apple butter|butternut|butter bean|eggplant)\b/;

export function dietTags(ingredientNames) {
  const meaty = ingredientNames.some((n) => MEAT_WORDS.test(n) && !PLANT_OK.test(n));
  const animal = ingredientNames.some((n) => ANIMAL_WORDS.test(n) && !PLANT_OK.test(n));
  return { vegetarian: !meaty, vegan: !meaty && !animal };
}
