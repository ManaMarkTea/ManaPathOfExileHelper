# PoE Price Check

A tiny always-on-top Electron app: copy an item in Path of Exile (`Ctrl+C`), paste it
into the app (`Ctrl+V`), and get a live sell price estimate pulled from the official
`pathofexile.com/trade` search API.

No login is required for price checking - only whispering a seller in-game needs an
authenticated session, and this app never does that.

![rarity colors](https://img.shields.io/badge/style-in--game%20colors-af6025)

## How it works

1. **Parse** the clipboard text into item name, base type, rarity, and mods (handles
   both the normal item text and the "Advanced Mod Descriptions" client option).
2. **Match** each rolled mod to its official trade-site stat ID.
3. **Search** live listings requiring those mods. If too few results come back, it
   automatically drops mods one at a time and re-searches until it finds a comparable
   sample - the result is flagged "approximate" whenever it had to broaden.
4. **Suggest** a price using the median of the matched listings (not a fixed "cheapest"
   pick, which is easily skewed by a single outlier), and shows the full low-high range
   alongside it.

Uniques search by exact name, currency/divination cards by name, gems by name + level.

## Running it

```
npm install
npm start
```

Or, in VS Code: **Terminal → Run Task → Run App**.

## Building a standalone .exe

```
npm run package
```

Produces a portable `PoE Price Check <version>.exe` in `dist/` - no installation
needed, just run it. Or, in VS Code: **Terminal → Run Task → Package Standalone .exe**.

A GitHub Actions workflow ([.github/workflows/build.yml](.github/workflows/build.yml))
builds this automatically on every push to `main`, and attaches it to a GitHub Release
whenever a `v*` tag is pushed.

## License

MIT - see [LICENSE](LICENSE).
