// Maps mod text lines (e.g. "+45 to maximum Life") to official trade-site stat IDs,
// so we can search the trade API for items with matching modifiers.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const STATS_URL = 'https://www.pathofexile.com/api/trade/data/stats';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Groups roughly in priority order: prefer matching a mod as explicit before implicit, etc.
const GROUP_PRIORITY = ['explicit', 'implicit', 'crafted', 'fractured', 'enchant', 'rune', 'monster', 'pseudo'];

function normalize(text) {
  return text
    .replace(/\s*\((implicit|crafted|fractured|enchant|rune|scourge)\)\s*$/i, '')
    .trim()
    .replace(/\d+(\.\d+)?/g, '#');
}

class StatMatcher {
  constructor() {
    this.byGroup = new Map(); // group label -> Map(normalizedPattern -> id)
    this.ready = false;
  }

  async init() {
    const cachePath = path.join(app.getPath('userData'), 'trade-stats-cache.json');
    let data = null;
    try {
      const res = await fetch(STATS_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
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
      const map = new Map();
      for (const entry of group.entries) {
        if (!entry.text) continue;
        const pattern = normalize(entry.text);
        if (!map.has(pattern)) map.set(pattern, entry.id);
      }
      this.byGroup.set(group.label.toLowerCase(), map);
    }
    this.ready = true;
    return true;
  }

  // Returns { id, group } for the best matching stat, or null.
  match(modLine) {
    if (!this.ready) return null;
    const pattern = normalize(modLine);
    for (const group of GROUP_PRIORITY) {
      const map = this.byGroup.get(group);
      if (map && map.has(pattern)) return { id: map.get(pattern), group };
    }
    // fall back to any group at all
    for (const [group, map] of this.byGroup) {
      if (map.has(pattern)) return { id: map.get(pattern), group };
    }
    return null;
  }
}

module.exports = { StatMatcher };
