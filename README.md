# PoE Price Check

A tiny always-on-top Electron app: copy an item in Path of Exile (`Ctrl+C`), paste it
into the app (`Ctrl+V`), and get a live sell price estimate pulled from the official
`pathofexile.com/trade` search API.

No login is required for price checking - only whispering a seller in-game needs an
authenticated session, and this app never does that.

![rarity colors](https://img.shields.io/badge/style-in--game%20colors-af6025)

## How it works

1. **Parse** the clipboard text into item name, base type, rarity, item level, sockets,
   and mods (handles both the normal item text and the "Advanced Mod Descriptions"
   client option).
2. **Match** how the item is searched to what actually drives its price, by slot:
   - Always filters by base type, rarity, and a minimum item level.
   - **Weapons** match on estimated DPS instead of individual affixes - a weapon's
     specific mod combo rarely repeats, but comparable damage output does.
   - **Body armour** always requires the item's own link count (a 6-link is worth
     matching for on its own), and never requires a life roll - a chest with *no*
     life is the more min-maxed, more valuable result, so life is excluded from the
     match rather than required.
   - Everything else (helmets/gloves/boots/shields, jewellery) matches life, elemental
     and chaos resistances, and local armour/evasion/energy shield mods - whichever of
     those the item actually rolled.
3. **Search** live listings requiring those mods, binary-searching for the largest set
   of mods that still returns a decent sample (instead of scanning one-by-one, which
   used to risk the trade site's rate limit on heavily-modded items). If no mod count
   reaches a solid sample, it falls back to the best non-empty match it found rather
   than giving up on mod-matching entirely.
4. **Suggest** a price using the median of the matched listings (not a fixed "cheapest"
   pick, which is easily skewed by a single outlier), and shows the full low-high range
   alongside it.

Uniques search by exact name, currency/divination cards by name, gems by name + level.

## Running it

```sh
npm install
npm start
```

Or, in VS Code: **Terminal → Run Task → Run App**.

## Building a standalone .exe

```sh
npm run package
```

Produces a portable `PoE Price Check <version>.exe` in `dist/` - no installation
needed, just run it. Or, in VS Code: **Terminal → Run Task → Package Standalone .exe**.

A GitHub Actions workflow ([.github/workflows/build.yml](.github/workflows/build.yml))
builds this automatically on every push to `main`, and attaches it to a GitHub Release
whenever a `v*` tag is pushed.

The app icon is [build/icon.svg](build/icon.svg) - edit it and run `npm run icon` to
re-render `build/icon.png` (used for both the window icon and the packaged `.exe`).
It renders the SVG through Electron's own Chromium, so no image tools are needed.

## License

MIT - see [LICENSE](LICENSE).
