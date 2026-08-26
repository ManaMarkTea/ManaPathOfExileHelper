// Magic-rarity items show as a single combined line - "[Prefix] BaseType[ of Suffix]" -
// e.g. "Rotund Crusader Plate of the Seal" for base type "Crusader Plate". There's no
// reliable way to strip the affix words without knowing which substring is actually a
// real base type, so this fetches the trade site's own canonical item list to check
// against, the same way statMatcher checks mod text against the site's own stat list.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ITEMS_URL = 'https://www.pathofexile.com/api/trade/data/items';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

class BaseTypeResolver {
  constructor() {
    this.baseTypes = new Set();
    this.ready = false;
  }

  async init() {
    const cachePath = path.join(app.getPath('userData'), 'trade-items-cache.json');
    let data = null;
    try {
      const res = await fetch(ITEMS_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (res.ok) {
        data = await res.json();
        fs.writeFile(cachePath, JSON.stringify(data), () => {});
      }
    } catch (err) {
      // network hiccup - fall back to cache below
    }

    if (!data) {
      try {
        data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      } catch (err) {
        this.ready = false;
        return false;
      }
    }

    for (const group of data.result) {
      for (const entry of group.entries) {
        if (entry.type) this.baseTypes.add(entry.type);
      }
    }
    this.ready = true;
    return true;
  }

  // Given a magic item's single combined name line, returns the real base type by
  // stripping the " of <suffix>" tail and then trying progressively shorter word
  // sequences from the front until one matches a known base type exactly. Falls back
  // to the original string if nothing matches (better than failing the search outright).
  resolve(rawName) {
    if (!this.ready) return rawName;

    const withoutSuffix = rawName.replace(/\s+of\s+.+$/i, '').trim();
    const words = withoutSuffix.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const candidate = words.slice(i).join(' ');
      if (this.baseTypes.has(candidate)) return candidate;
    }
    return rawName;
  }
}

module.exports = { BaseTypeResolver };
