# Remi: https://msharpe3.github.io/Remi/

Cook with what you have. Add the ingredients in your kitchen and Remi ranks recipes by how few things you'd need to buy.

Free, no AI, runs entirely on GitHub Pages. Add it to your iPhone Home Screen and it works like an app, including offline for recipes you've saved.

## Setup

1. **Build the recipe library.** Open the **Actions** tab, choose **Build recipes**, and tap **Run workflow**. It takes about 10–20 minutes and commits the recipes into `data/`. It also refreshes itself on the 1st of each month.
2. **Turn on Pages.** Settings → Pages → Source: *Deploy from a branch*, Branch: `main`, folder `/ (root)`.
3. **Install on iPhone.** Open the Pages link in Safari, tap Share, then **Add to Home Screen**.

## Where the recipes come from

| Source | License | How |
| --- | --- | --- |
| [Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook:Recipes) | CC BY-SA 4.0 | Downloaded by the Action and credited on every recipe |
| [USDA MyPlate Kitchen](https://myplate.food/recipes) | Public domain | Downloaded by the Action; includes nutrition |
| [Public Domain Recipes](https://publicdomainrecipes.com/) | Public domain | Downloaded by the Action |
| [TheMealDB](https://www.themealdb.com/) | — | Searched live from your phone; nothing stored here |

Recipe text in `data/` stays under its source's license (Wikibooks recipes remain CC BY-SA 4.0). Each recipe links back to its original page.

## Files

- `index.html`, `css/`, `js/` — the app
- `js/normalize.js` — ingredient cleanup shared by the app and the builder
- `scripts/build-data.mjs` — downloads and packages the recipes
- `.github/workflows/build-recipes.yml` — runs the builder
- `sw.js` — offline support

## Releasing an update

Bump `APP_VERSION` in `js/app.js` and the `v` in `version.json` to the same new value (format `YYYY.MM.DD.N`). Remi checks `version.json` when it opens and whenever you return to it, and shows an **Update** button when the live version is newer.
