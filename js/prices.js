// Starting grocery prices for the shopping list, Northeast U.S.
//
// Where the Bureau of Labor Statistics publishes an average retail price, that
// number is used (Northeast, Aug 2026: bread, ground beef, chuck roast, bacon,
// pork chops, ham, whole chicken, chicken breast, bananas, lemons, potatoes,
// tomatoes, romaine; U.S. city average for eggs, milk, cheddar, flour, rice,
// pasta, sugar, dried beans). Everything else is a typical-store estimate.
// They're all estimates — tap any price in the app to set what you really pay.
//
// Fields
//   n      ingredient name it covers (matched by whole words)
//   a      store aisle
//   p      price in dollars
//   by     'lb' sold by weight, 'each' sold by the piece, 'pkg' sold in a package
//   pkg    package size: { q, u: 'lb' | 'cup' | 'each', label }
//   cupLb  pounds per cup (to turn cups into pounds)
//   eachLb pounds per piece
//   perCup pieces per cup (e.g. 1 onion ≈ 1 cup chopped)
//   parts  recipe counts are parts of one item (garlic cloves per head)
//   check  pantry basics: listed to check, not priced

export const STORES = {
  walmart: { name: 'Walmart', factor: 0.9 },
  aldi: { name: 'Aldi', factor: 0.8 },
  stopshop: { name: 'Stop & Shop', factor: 1.1 },
  bigy: { name: 'Big Y', factor: 1.05 },
};

export const AISLES = [
  'Produce', 'Meat & seafood', 'Dairy & eggs', 'Bread & bakery', 'Grains & pasta',
  'Canned & jarred', 'Frozen', 'Baking', 'Nuts & dried fruit', 'Condiments & sauces', 'Other',
];

export const PRICES = [
  // Produce
  { n: 'onion', a: 'Produce', p: 1.29, by: 'lb', eachLb: 0.5, cupLb: 0.35 },
  { n: 'red onion', a: 'Produce', p: 1.69, by: 'lb', eachLb: 0.5, cupLb: 0.35 },
  { n: 'green onion', a: 'Produce', p: 1.19, by: 'pkg', pkg: { q: 7, u: 'each', label: 'bunch' }, perCup: 8 },
  { n: 'garlic', a: 'Produce', p: 0.69, by: 'each', parts: 10, perCup: 30 },
  { n: 'tomato', a: 'Produce', p: 2.55, by: 'lb', eachLb: 0.4, cupLb: 0.4 },
  { n: 'cherry tomato', a: 'Produce', p: 3.49, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'pint' } },
  { n: 'potato', a: 'Produce', p: 1.0, by: 'lb', eachLb: 0.5, cupLb: 0.35 },
  { n: 'sweet potato', a: 'Produce', p: 1.49, by: 'lb', eachLb: 0.6, cupLb: 0.3 },
  { n: 'carrot', a: 'Produce', p: 1.19, by: 'lb', eachLb: 0.15, cupLb: 0.28 },
  { n: 'baby carrot', a: 'Produce', p: 1.79, by: 'pkg', pkg: { q: 1, u: 'lb', label: 'bag (1 lb)' }, cupLb: 0.28 },
  { n: 'celery', a: 'Produce', p: 2.19, by: 'pkg', pkg: { q: 9, u: 'each', label: 'bunch' }, perCup: 2 },
  { n: 'bell pepper', a: 'Produce', p: 1.29, by: 'each', perCup: 1, eachLb: 0.4 },
  { n: 'green pepper', a: 'Produce', p: 1.09, by: 'each', perCup: 1, eachLb: 0.4 },
  { n: 'red pepper', a: 'Produce', p: 1.49, by: 'each', perCup: 1, eachLb: 0.4 },
  { n: 'jalapeno', a: 'Produce', p: 0.15, by: 'each', perCup: 8 },
  { n: 'zucchini', a: 'Produce', p: 1.79, by: 'lb', eachLb: 0.45, cupLb: 0.28 },
  { n: 'yellow squash', a: 'Produce', p: 1.79, by: 'lb', eachLb: 0.45, cupLb: 0.28 },
  { n: 'cucumber', a: 'Produce', p: 0.89, by: 'each', perCup: 0.5 },
  { n: 'broccoli', a: 'Produce', p: 2.29, by: 'lb', eachLb: 1, cupLb: 0.2 },
  { n: 'cauliflower', a: 'Produce', p: 3.49, by: 'each', perCup: 0.2 },
  { n: 'cabbage', a: 'Produce', p: 0.89, by: 'lb', eachLb: 2, cupLb: 0.2 },
  { n: 'spinach', a: 'Produce', p: 3.29, by: 'pkg', pkg: { q: 6, u: 'cup', label: 'bag (5 oz)' } },
  { n: 'kale', a: 'Produce', p: 2.49, by: 'pkg', pkg: { q: 6, u: 'cup', label: 'bunch' } },
  { n: 'romaine lettuce', a: 'Produce', p: 3.05, by: 'lb', eachLb: 0.6, cupLb: 0.1 },
  { n: 'lettuce', a: 'Produce', p: 1.99, by: 'each', perCup: 0.12 },
  { n: 'mushroom', a: 'Produce', p: 2.79, by: 'pkg', pkg: { q: 0.5, u: 'lb', label: 'pack (8 oz)' }, cupLb: 0.16, eachLb: 0.04 },
  { n: 'corn', a: 'Produce', p: 0.6, by: 'each', perCup: 1.5 },
  { n: 'green bean', a: 'Produce', p: 2.49, by: 'lb', cupLb: 0.25 },
  { n: 'avocado', a: 'Produce', p: 1.29, by: 'each', perCup: 1 },
  { n: 'cilantro', a: 'Produce', p: 0.99, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'bunch' } },
  { n: 'parsley', a: 'Produce', p: 0.99, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'bunch' } },
  { n: 'basil', a: 'Produce', p: 2.49, by: 'pkg', pkg: { q: 1, u: 'cup', label: 'pack' } },
  { n: 'ginger', a: 'Produce', p: 4.99, by: 'lb', cupLb: 0.2, eachLb: 0.1 },
  { n: 'banana', a: 'Produce', p: 0.69, by: 'lb', eachLb: 0.4, cupLb: 0.5 },
  { n: 'apple', a: 'Produce', p: 1.89, by: 'lb', eachLb: 0.4, cupLb: 0.3 },
  { n: 'orange', a: 'Produce', p: 1.49, by: 'lb', eachLb: 0.45, cupLb: 0.4 },
  { n: 'lemon', a: 'Produce', p: 0.6, by: 'each', perCup: 6 },
  { n: 'lime', a: 'Produce', p: 0.4, by: 'each', perCup: 8 },
  { n: 'strawberry', a: 'Produce', p: 3.49, by: 'pkg', pkg: { q: 1, u: 'lb', label: 'pack (1 lb)' }, cupLb: 0.33 },
  { n: 'blueberry', a: 'Produce', p: 3.99, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'pint' } },
  { n: 'grape', a: 'Produce', p: 2.49, by: 'lb', cupLb: 0.33 },
  { n: 'peach', a: 'Produce', p: 1.99, by: 'lb', eachLb: 0.33, cupLb: 0.35 },
  { n: 'pear', a: 'Produce', p: 1.79, by: 'lb', eachLb: 0.4, cupLb: 0.35 },
  { n: 'mango', a: 'Produce', p: 1.19, by: 'each', perCup: 0.6 },
  { n: 'pineapple', a: 'Produce', p: 2.99, by: 'each', perCup: 0.2 },
  { n: 'butternut squash', a: 'Produce', p: 1.49, by: 'lb', eachLb: 2.5, cupLb: 0.3 },
  { n: 'eggplant', a: 'Produce', p: 1.99, by: 'lb', eachLb: 1.2, cupLb: 0.2 },
  { n: 'asparagus', a: 'Produce', p: 3.99, by: 'lb', cupLb: 0.3 },
  { n: 'brussels sprout', a: 'Produce', p: 3.49, by: 'lb', cupLb: 0.2 },

  // Meat & seafood
  { n: 'chicken breast', a: 'Meat & seafood', p: 3.83, by: 'lb', eachLb: 0.5, cupLb: 0.31 },
  { n: 'chicken thigh', a: 'Meat & seafood', p: 2.99, by: 'lb', eachLb: 0.3, cupLb: 0.31 },
  { n: 'chicken', a: 'Meat & seafood', p: 3.29, by: 'lb', eachLb: 0.5, cupLb: 0.31 },
  { n: 'ground turkey', a: 'Meat & seafood', p: 4.99, by: 'lb', cupLb: 0.5 },
  { n: 'turkey', a: 'Meat & seafood', p: 7.99, by: 'lb', cupLb: 0.31 },
  { n: 'ground beef', a: 'Meat & seafood', p: 6.99, by: 'lb', cupLb: 0.5 },
  { n: 'beef', a: 'Meat & seafood', p: 9.32, by: 'lb', cupLb: 0.4 },
  { n: 'steak', a: 'Meat & seafood', p: 11.99, by: 'lb', eachLb: 0.6 },
  { n: 'pork', a: 'Meat & seafood', p: 4.15, by: 'lb', eachLb: 0.4, cupLb: 0.31 },
  { n: 'ham', a: 'Meat & seafood', p: 5.15, by: 'lb', cupLb: 0.31, eachLb: 0.06 },
  { n: 'bacon', a: 'Meat & seafood', p: 5.66, by: 'pkg', pkg: { q: 12, u: 'each', label: 'pack (12 oz)' } },
  { n: 'sausage', a: 'Meat & seafood', p: 4.99, by: 'pkg', pkg: { q: 1, u: 'lb', label: 'pack (1 lb)' }, eachLb: 0.2 },
  { n: 'salmon', a: 'Meat & seafood', p: 10.99, by: 'lb', eachLb: 0.38 },
  { n: 'cod', a: 'Meat & seafood', p: 8.99, by: 'lb', eachLb: 0.38 },
  { n: 'tilapia', a: 'Meat & seafood', p: 5.99, by: 'lb', eachLb: 0.33 },
  { n: 'fish', a: 'Meat & seafood', p: 7.99, by: 'lb', eachLb: 0.38 },
  { n: 'shrimp', a: 'Meat & seafood', p: 8.99, by: 'lb', cupLb: 0.4 },
  { n: 'tuna', a: 'Canned & jarred', p: 1.29, by: 'pkg', pkg: { q: 0.31, u: 'lb', label: 'can (5 oz)' }, cupLb: 0.45 },
  { n: 'tofu', a: 'Dairy & eggs', p: 2.49, by: 'pkg', pkg: { q: 0.875, u: 'lb', label: 'block (14 oz)' }, cupLb: 0.55 },

  // Dairy & eggs
  { n: 'egg', a: 'Dairy & eggs', p: 3.59, by: 'pkg', pkg: { q: 12, u: 'each', label: 'dozen' }, perCup: 5 },
  { n: 'egg white', a: 'Dairy & eggs', p: 3.99, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'carton (16 oz)' }, perCup: 8 },
  { n: 'milk', a: 'Dairy & eggs', p: 4.17, by: 'pkg', pkg: { q: 16, u: 'cup', label: 'gallon' } },
  { n: 'buttermilk', a: 'Dairy & eggs', p: 2.29, by: 'pkg', pkg: { q: 4, u: 'cup', label: 'quart' } },
  { n: 'evaporated milk', a: 'Canned & jarred', p: 1.49, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'can (12 oz)' } },
  { n: 'butter', a: 'Dairy & eggs', p: 4.99, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'pound (4 sticks)' } },
  { n: 'margarine', a: 'Dairy & eggs', p: 2.99, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'tub (15 oz)' } },
  { n: 'yogurt', a: 'Dairy & eggs', p: 3.79, by: 'pkg', pkg: { q: 4, u: 'cup', label: 'tub (32 oz)' } },
  { n: 'greek yogurt', a: 'Dairy & eggs', p: 5.49, by: 'pkg', pkg: { q: 4, u: 'cup', label: 'tub (32 oz)' } },
  { n: 'sour cream', a: 'Dairy & eggs', p: 2.29, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'tub (16 oz)' } },
  { n: 'cream cheese', a: 'Dairy & eggs', p: 2.49, by: 'pkg', pkg: { q: 1, u: 'cup', label: 'brick (8 oz)' } },
  { n: 'cottage cheese', a: 'Dairy & eggs', p: 3.49, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'tub (16 oz)' } },
  { n: 'ricotta cheese', a: 'Dairy & eggs', p: 3.99, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'tub (15 oz)' } },
  { n: 'cheddar cheese', a: 'Dairy & eggs', p: 3.06, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'bag (8 oz)' } },
  { n: 'mozzarella', a: 'Dairy & eggs', p: 2.99, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'bag (8 oz)' } },
  { n: 'parmesan cheese', a: 'Dairy & eggs', p: 3.99, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'container (8 oz)' } },
  { n: 'feta cheese', a: 'Dairy & eggs', p: 3.99, by: 'pkg', pkg: { q: 1, u: 'cup', label: 'container (6 oz)' } },
  { n: 'cheese', a: 'Dairy & eggs', p: 3.06, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'bag (8 oz)' } },
  { n: 'heavy cream', a: 'Dairy & eggs', p: 3.49, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'pint' } },
  { n: 'orange juice', a: 'Dairy & eggs', p: 3.99, by: 'pkg', pkg: { q: 6.5, u: 'cup', label: 'carton (52 oz)' } },

  // Bread & bakery
  { n: 'bread', a: 'Bread & bakery', p: 2.26, by: 'pkg', pkg: { q: 20, u: 'each', label: 'loaf' } },
  { n: 'flour tortilla', a: 'Bread & bakery', p: 2.79, by: 'pkg', pkg: { q: 10, u: 'each', label: 'pack of 10' } },
  { n: 'corn tortilla', a: 'Bread & bakery', p: 2.49, by: 'pkg', pkg: { q: 30, u: 'each', label: 'pack of 30' } },
  { n: 'tortilla', a: 'Bread & bakery', p: 2.79, by: 'pkg', pkg: { q: 10, u: 'each', label: 'pack of 10' } },
  { n: 'pita', a: 'Bread & bakery', p: 2.49, by: 'pkg', pkg: { q: 6, u: 'each', label: 'pack of 6' } },
  { n: 'english muffin', a: 'Bread & bakery', p: 2.99, by: 'pkg', pkg: { q: 6, u: 'each', label: 'pack of 6' } },
  { n: 'bread crumb', a: 'Bread & bakery', p: 2.29, by: 'pkg', pkg: { q: 3.5, u: 'cup', label: 'canister (15 oz)' } },

  // Grains & pasta
  { n: 'brown rice', a: 'Grains & pasta', p: 2.49, by: 'pkg', pkg: { q: 2, u: 'lb', label: 'bag (2 lb)' }, cupLb: 0.42 },
  { n: 'rice', a: 'Grains & pasta', p: 2.12, by: 'pkg', pkg: { q: 2, u: 'lb', label: 'bag (2 lb)' }, cupLb: 0.42 },
  { n: 'pasta', a: 'Grains & pasta', p: 1.29, by: 'pkg', pkg: { q: 1, u: 'lb', label: 'box (1 lb)' }, cupLb: 0.25 },
  { n: 'spaghetti', a: 'Grains & pasta', p: 1.29, by: 'pkg', pkg: { q: 1, u: 'lb', label: 'box (1 lb)' }, cupLb: 0.25 },
  { n: 'macaroni', a: 'Grains & pasta', p: 1.29, by: 'pkg', pkg: { q: 1, u: 'lb', label: 'box (1 lb)' }, cupLb: 0.25 },
  { n: 'egg noodle', a: 'Grains & pasta', p: 2.29, by: 'pkg', pkg: { q: 0.75, u: 'lb', label: 'bag (12 oz)' }, cupLb: 0.12 },
  { n: 'quinoa', a: 'Grains & pasta', p: 4.49, by: 'pkg', pkg: { q: 1, u: 'lb', label: 'bag (1 lb)' }, cupLb: 0.38 },
  { n: 'oats', a: 'Grains & pasta', p: 3.49, by: 'pkg', pkg: { q: 10, u: 'cup', label: 'canister (42 oz)' } },
  { n: 'oatmeal', a: 'Grains & pasta', p: 3.49, by: 'pkg', pkg: { q: 10, u: 'cup', label: 'canister (42 oz)' } },
  { n: 'cornmeal', a: 'Baking', p: 2.49, by: 'pkg', pkg: { q: 2, u: 'lb', label: 'bag (2 lb)' }, cupLb: 0.35 },
  { n: 'granola', a: 'Grains & pasta', p: 3.99, by: 'pkg', pkg: { q: 4, u: 'cup', label: 'bag (12 oz)' } },
  { n: 'cereal', a: 'Grains & pasta', p: 3.99, by: 'pkg', pkg: { q: 10, u: 'cup', label: 'box' } },

  // Canned & jarred
  { n: 'black bean', a: 'Canned & jarred', p: 1.09, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'can (15 oz)' } },
  { n: 'kidney bean', a: 'Canned & jarred', p: 1.09, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'can (15 oz)' } },
  { n: 'pinto bean', a: 'Canned & jarred', p: 1.09, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'can (15 oz)' } },
  { n: 'white bean', a: 'Canned & jarred', p: 1.09, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'can (15 oz)' } },
  { n: 'great northern bean', a: 'Canned & jarred', p: 1.09, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'can (15 oz)' } },
  { n: 'chickpea', a: 'Canned & jarred', p: 1.19, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'can (15 oz)' } },
  { n: 'bean', a: 'Canned & jarred', p: 1.09, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'can (15 oz)' } },
  { n: 'lentils', a: 'Grains & pasta', p: 1.79, by: 'pkg', pkg: { q: 1, u: 'lb', label: 'bag (1 lb)' }, cupLb: 0.42 },
  { n: 'tomato sauce', a: 'Canned & jarred', p: 0.99, by: 'pkg', pkg: { q: 1, u: 'cup', label: 'can (8 oz)' } },
  { n: 'tomato paste', a: 'Canned & jarred', p: 0.99, by: 'pkg', pkg: { q: 0.75, u: 'cup', label: 'can (6 oz)' } },
  { n: 'diced tomato', a: 'Canned & jarred', p: 1.29, by: 'pkg', pkg: { q: 1.75, u: 'cup', label: 'can (14.5 oz)' } },
  { n: 'crushed tomato', a: 'Canned & jarred', p: 1.79, by: 'pkg', pkg: { q: 3.5, u: 'cup', label: 'can (28 oz)' } },
  { n: 'salt added tomato', a: 'Canned & jarred', p: 1.29, by: 'pkg', pkg: { q: 1.75, u: 'cup', label: 'can (14.5 oz)' } },
  { n: 'stewed tomato', a: 'Canned & jarred', p: 1.29, by: 'pkg', pkg: { q: 1.75, u: 'cup', label: 'can (14.5 oz)' } },
  { n: 'spaghetti sauce', a: 'Canned & jarred', p: 2.49, by: 'pkg', pkg: { q: 3, u: 'cup', label: 'jar (24 oz)' } },
  { n: 'salsa', a: 'Canned & jarred', p: 2.79, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'jar (16 oz)' } },
  { n: 'chicken broth', a: 'Canned & jarred', p: 2.29, by: 'pkg', pkg: { q: 4, u: 'cup', label: 'carton (32 oz)' } },
  { n: 'vegetable broth', a: 'Canned & jarred', p: 2.29, by: 'pkg', pkg: { q: 4, u: 'cup', label: 'carton (32 oz)' } },
  { n: 'beef broth', a: 'Canned & jarred', p: 2.29, by: 'pkg', pkg: { q: 4, u: 'cup', label: 'carton (32 oz)' } },
  { n: 'soup', a: 'Canned & jarred', p: 1.49, by: 'pkg', pkg: { q: 1.25, u: 'cup', label: 'can (10.5 oz)' } },
  { n: 'corn kernel', a: 'Canned & jarred', p: 0.99, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'can (15 oz)' } },
  { n: 'kernel corn', a: 'Canned & jarred', p: 0.99, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'can (15 oz)' } },
  { n: 'pumpkin', a: 'Canned & jarred', p: 2.29, by: 'pkg', pkg: { q: 1.75, u: 'cup', label: 'can (15 oz)' } },
  { n: 'pineapple chunk', a: 'Canned & jarred', p: 1.79, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'can (20 oz)' } },
  { n: 'mandarin orange', a: 'Canned & jarred', p: 1.49, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'can (15 oz)' } },
  { n: 'applesauce', a: 'Canned & jarred', p: 2.49, by: 'pkg', pkg: { q: 3, u: 'cup', label: 'jar (24 oz)' } },
  { n: 'peanut butter', a: 'Canned & jarred', p: 3.29, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'jar (16 oz)' } },
  { n: 'green chile', a: 'Canned & jarred', p: 1.29, by: 'pkg', pkg: { q: 0.5, u: 'cup', label: 'can (4 oz)' } },

  // Frozen
  { n: 'mixed vegetable', a: 'Frozen', p: 1.79, by: 'pkg', pkg: { q: 3, u: 'cup', label: 'bag (12 oz)' } },
  { n: 'pea', a: 'Frozen', p: 1.79, by: 'pkg', pkg: { q: 2.5, u: 'cup', label: 'bag (12 oz)' } },
  { n: 'frozen spinach', a: 'Frozen', p: 1.49, by: 'pkg', pkg: { q: 1.25, u: 'cup', label: 'box (10 oz)' } },

  // Baking
  { n: 'flour', a: 'Baking', p: 2.79, by: 'pkg', pkg: { q: 5, u: 'lb', label: 'bag (5 lb)' }, cupLb: 0.28 },
  { n: 'wheat flour', a: 'Baking', p: 3.99, by: 'pkg', pkg: { q: 5, u: 'lb', label: 'bag (5 lb)' }, cupLb: 0.27 },
  { n: 'sugar', a: 'Baking', p: 4.16, by: 'pkg', pkg: { q: 4, u: 'lb', label: 'bag (4 lb)' }, cupLb: 0.44 },
  { n: 'brown sugar', a: 'Baking', p: 2.49, by: 'pkg', pkg: { q: 2, u: 'lb', label: 'bag (2 lb)' }, cupLb: 0.48 },
  { n: 'honey', a: 'Baking', p: 4.99, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'bottle (16 oz)' } },
  { n: 'maple syrup', a: 'Baking', p: 6.99, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'bottle (12 oz)' } },
  { n: 'chocolate chip', a: 'Baking', p: 2.99, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'bag (12 oz)' } },
  { n: 'cocoa powder', a: 'Baking', p: 3.99, by: 'pkg', pkg: { q: 3, u: 'cup', label: 'can (8 oz)' } },
  { n: 'cornstarch', a: 'Baking', p: 1.79, by: 'pkg', pkg: { q: 3, u: 'cup', label: 'box (16 oz)' } },

  // Nuts & dried fruit
  { n: 'raisin', a: 'Nuts & dried fruit', p: 3.29, by: 'pkg', pkg: { q: 2.5, u: 'cup', label: 'box (12 oz)' } },
  { n: 'cranberry', a: 'Nuts & dried fruit', p: 3.49, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'bag (6 oz)' } },
  { n: 'walnut', a: 'Nuts & dried fruit', p: 4.99, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'bag (8 oz)' } },
  { n: 'almond', a: 'Nuts & dried fruit', p: 5.49, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'bag (8 oz)' } },
  { n: 'pecan', a: 'Nuts & dried fruit', p: 6.49, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'bag (8 oz)' } },
  { n: 'peanut', a: 'Nuts & dried fruit', p: 3.49, by: 'pkg', pkg: { q: 2.5, u: 'cup', label: 'jar (16 oz)' } },
  { n: 'sunflower seed', a: 'Nuts & dried fruit', p: 2.99, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'bag (8 oz)' } },

  // Condiments & sauces (priced; used up slowly but often not on hand)
  { n: 'mayonnaise', a: 'Condiments & sauces', p: 3.99, by: 'pkg', pkg: { q: 3.75, u: 'cup', label: 'jar (30 oz)' } },
  { n: 'mustard', a: 'Condiments & sauces', p: 1.49, by: 'pkg', pkg: { q: 1.75, u: 'cup', label: 'bottle (14 oz)' } },
  { n: 'ketchup', a: 'Condiments & sauces', p: 2.49, by: 'pkg', pkg: { q: 2.5, u: 'cup', label: 'bottle (20 oz)' } },
  { n: 'barbecue sauce', a: 'Condiments & sauces', p: 2.29, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'bottle (18 oz)' } },
  { n: 'dressing', a: 'Condiments & sauces', p: 2.79, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'bottle (16 oz)' } },
  { n: 'vinaigrette', a: 'Condiments & sauces', p: 2.79, by: 'pkg', pkg: { q: 2, u: 'cup', label: 'bottle (16 oz)' } },
  { n: 'chili sauce', a: 'Condiments & sauces', p: 2.99, by: 'pkg', pkg: { q: 1.5, u: 'cup', label: 'bottle (12 oz)' } },
  { n: 'pizza sauce', a: 'Canned & jarred', p: 1.99, by: 'pkg', pkg: { q: 1.75, u: 'cup', label: 'jar (14 oz)' } },

  // Pantry basics — listed to check, not priced
  ...[
    'salt', 'black pepper', 'pepper', 'water', 'ice', 'vegetable oil', 'olive oil', 'oil', 'cooking spray', 'canola oil',
    'garlic powder', 'onion powder', 'garlic salt', 'cinnamon', 'oregano', 'basil leaf', 'thyme', 'cumin', 'chili powder',
    'paprika', 'cayenne pepper', 'red pepper flake', 'nutmeg', 'italian seasoning', 'curry powder', 'bay leaf', 'sage',
    'rosemary', 'dill', 'allspice', 'pumpkin pie spice', 'parsley flake', 'seasoning', 'baking powder', 'baking soda',
    'vanilla', 'vanilla extract', 'vinegar', 'soy sauce', 'worcestershire sauce', 'hot sauce', 'hot pepper sauce',
    'lemon juice', 'lime juice', 'bouillon', 'dried', 'ground', 'extract', 'spice', 'powder', 'flake',
  ].map((n) => ({ n, a: 'Pantry', check: true })),
];

const SPLIT = new Map();
for (const e of PRICES) SPLIT.set(e, e.n.split(' '));

// Best matching price entry for an ingredient name: the entry whose words all
// appear in the name, preferring the longest (most specific) one.
const MATCHES = new Map();
export function priceEntry(name) {
  if (MATCHES.has(name)) return MATCHES.get(name);
  const found = findEntry(name);
  MATCHES.set(name, found);
  return found;
}

function findEntry(name) {
  const words = name.split(' ');
  let best = null;
  let bestLen = 0;
  for (const e of PRICES) {
    const ew = SPLIT.get(e);
    if (ew.length < bestLen) continue;
    if (ew.every((w) => words.includes(w) || words.includes(`${w}s`))) {
      const last = words[words.length - 1];
      const headNoun = (x) => { const xw = SPLIT.get(x); return xw[xw.length - 1] === last || `${xw[xw.length - 1]}s` === last; };
      if (ew.length > bestLen || (best?.check && !e.check) || (!headNoun(best) && headNoun(e) && !e.check)) { best = e; bestLen = ew.length; }
    }
  }
  return best;
}

const AISLE_HINTS = [
  [/\b(lettuce|greens|herb|squash|melon|berry|berries|fruit|vegetable|sprout|leaf|leaves|radish|turnip|beet|kiwi|cantaloupe|watermelon|plum|cherry|scallion|shallot|leek|chive)\b/, 'Produce'],
  [/\b(meat|fillet|loin|roast|rib|wing|drumstick|crab|scallop|lamb|veal|chorizo|pepperoni|salami)\b/, 'Meat & seafood'],
  [/\b(cheese|cream|yogurt|milk|kefir)\b/, 'Dairy & eggs'],
  [/\b(bun|roll|bagel|muffin|biscuit|crust|cracker)\b/, 'Bread & bakery'],
  [/\b(noodle|couscous|barley|bulgur|grain)\b/, 'Grains & pasta'],
  [/\b(canned|soup|sauce|paste|olive|pickle|relish|chile)\b/, 'Canned & jarred'],
  [/\b(frozen)\b/, 'Frozen'],
  [/\b(nut|seed|date|apricot|prune)\b/, 'Nuts & dried fruit'],
];
export function guessAisle(name) {
  for (const [re, aisle] of AISLE_HINTS) if (re.test(name)) return aisle;
  return 'Other';
}
