const { parseItem } = require('./itemParser');
const tradeApi = require('./tradeApi');

const MAX_STAT_FILTERS = 6;
const FETCH_COUNT = 10;
const MIN_RESULTS_TARGET = 5;
const REQUEST_SPACING_MS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// My own avg-damage * APS estimate consistently reads a bit low against the trade site's
// own dps calc (verified against live listings), so shave the threshold down further to
// stay a safe *minimum* rather than risk excluding the item's own tier of weapon.
function estimateWeaponDpsMin(weapon) {
  if (!weapon || !weapon.aps) return null;
  const avg = (r) => (r ? (r[0] + r[1]) / 2 : 0);
  const totalAvg = avg(weapon.phys) + avg(weapon.elem) + avg(weapon.chaos);
  if (totalAvg <= 0) return null;
  return Math.round(totalAvg * weapon.aps * 0.85);
}

function buildQuery(item, matchedStats) {
  // "securable" = the trade site's "Instant Buyout" status: a firm price the site can
  // reserve for you automatically, as opposed to "online"/"any" listings that need
  // whispering the seller and hoping they're around to actually complete an in-person
  // trade. Pricing off buyout-only listings gives a number you could actually pay today.
  //
  // "chaos_divine" restricts results to listings priced in Chaos or Divine Orbs - any
  // other currency isn't worth pricing in anyway, and mixing in obscure currencies just
  // adds noise to the suggested range.
  const query = {
    status: { option: 'securable' },
    filters: { trade_filters: { filters: { price: { option: 'chaos_divine' } } } },
  };

  if (item.category === 'currency') {
    query.type = item.baseType;
    return query;
  }

  if (item.category === 'gem') {
    query.type = item.name;
    if (item.gemLevel) {
      query.filters.misc_filters = { filters: { gem_level: { min: item.gemLevel } } };
    }
    return query;
  }

  if (item.category === 'unique') {
    query.name = item.name;
    query.type = item.baseType;
    return query;
  }

  // rare / magic / normal gear
  query.type = item.baseType;
  query.filters.type_filters = { filters: { rarity: { option: item.rarity.toLowerCase() } } };

  if (item.itemLevel) {
    query.filters.misc_filters = { filters: { ilvl: { min: item.itemLevel } } };
  }

  if (item.slot === 'weapon') {
    // Weapons are matched on DPS, not affixes - a specific mod combo rarely repeats,
    // but comparable damage output is what actually drives a weapon's price.
    const dpsMin = estimateWeaponDpsMin(item.weapon);
    if (dpsMin) query.filters.weapon_filters = { filters: { dps: { min: dpsMin } } };
    return query;
  }

  if (item.slot === 'chest' && item.links > 0) {
    // Links matter enough on chests (a 6-link is a huge value jump) to always require,
    // independent of how many affix filters we end up broadening away.
    query.filters.socket_filters = { filters: { links: { min: item.links } } };
  }

  if (matchedStats.length > 0) {
    query.stats = [{ type: 'and', filters: matchedStats.map((m) => ({ id: m.id, disabled: false })) }];
  }
  return query;
}

// More matched stats -> fewer or equal results, so "does k stats give enough results" is
// monotonic in k. That lets us binary-search for the largest workable k instead of
// scanning every value from full-count down to 0, which cut the trade API's rate limit
// close on heavily-modded items (e.g. 8 matched stats meant up to 7 sequential searches).
//
// Along the way we also remember the highest-k probe that returned *any* listings, even
// if it fell short of MIN_RESULTS_TARGET. Without that, an item whose narrowest workable
// search only turns up 2-4 comparable listings would fall all the way back to zero stat
// filters (i.e. "any rare item of this base type") instead of using that smaller, still
// far more relevant sample.
async function searchWithBroadening(league, item, matchedStats, onProgress) {
  const report = onProgress || (() => {});

  if (item.slot === 'weapon' || item.category !== 'gear' || matchedStats.length === 0) {
    report('Searching listings...');
    const query = buildQuery(item, []);
    const result = await tradeApi.search(league, query, onProgress);
    return { result, usedStatCount: 0 };
  }

  const capped = matchedStats.slice(0, MAX_STAT_FILTERS);

  report(`Searching (${capped.length} mod${capped.length === 1 ? '' : 's'} matched)...`);
  const baseline = await tradeApi.search(league, buildQuery(item, []), onProgress);
  let bestGoodK = 0;
  let bestGoodResult = baseline;
  let bestAnyK = 0;
  let bestAnyResult = baseline;

  let lo = 1;
  let hi = capped.length;
  while (lo <= hi) {
    await sleep(REQUEST_SPACING_MS);
    const mid = Math.floor((lo + hi) / 2);
    report(`Narrowing match (trying ${mid} of ${capped.length} mods)...`);
    const result = await tradeApi.search(league, buildQuery(item, capped.slice(0, mid)), onProgress);

    if (result.result.length > 0 && mid > bestAnyK) {
      bestAnyK = mid;
      bestAnyResult = result;
    }
    if (result.result.length >= MIN_RESULTS_TARGET) {
      bestGoodK = mid;
      bestGoodResult = result;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (bestGoodK > 0) return { result: bestGoodResult, usedStatCount: bestGoodK };
  if (bestAnyK > 0) return { result: bestAnyResult, usedStatCount: bestAnyK };
  return { result: baseline, usedStatCount: 0 };
}

function summarizeListings(listings) {
  const priced = listings
    .filter((l) => l.listing && l.listing.price && l.listing.price.amount > 0)
    .map((l) => ({
      amount: l.listing.price.amount,
      currency: l.listing.price.currency,
      account: l.listing.account && l.listing.account.name,
      itemName: l.item.name || l.item.typeLine,
      ilvl: l.item.ilvl,
      links: (l.item.sockets || []).length
        ? Math.max(...Object.values((l.item.sockets || []).reduce((groups, s) => {
            groups[s.group] = (groups[s.group] || 0) + 1;
            return groups;
          }, {})))
        : 0,
      mods: [...(l.item.implicitMods || []), ...(l.item.explicitMods || []), ...(l.item.craftedMods || []), ...(l.item.fracturedMods || [])].map(
        (m) => (typeof m === 'string' ? m : m.description)
      ),
      dps: l.item.extended ? l.item.extended.dps : null,
    }));

  const icon = listings.find((l) => l.item && l.item.icon);
  const frameType = icon ? icon.item.frameType : null;
  const base = { priced, icon: icon ? icon.item.icon : null, frameType };

  if (priced.length === 0) return { ...base, suggestion: null, low: null, high: null };

  // `priced` is already true-value sorted (server-side price:asc), so the positional
  // median is a real median, not an approximation - and it's far less sensitive to a
  // single oddly-priced listing than always picking a fixed rank like "3rd cheapest".
  const medianIndex = Math.floor((priced.length - 1) / 2);
  return { ...base, suggestion: priced[medianIndex], low: priced[0], high: priced[priced.length - 1] };
}

async function checkPrice(rawText, league, statMatcher, baseTypeResolver, onProgress) {
  const report = onProgress || (() => {});
  report('Parsing item...');
  const item = parseItem(rawText);

  // Magic items show as a single combined line - "Rotund Crusader Plate of the Seal" -
  // so the parser can't split name from base type itself; only "Crusader Plate" here is
  // a real, searchable base type, and querying the raw combined string 400s as unknown.
  if (item.rarity.toLowerCase() === 'magic' && item.baseType === item.name && baseTypeResolver) {
    item.baseType = baseTypeResolver.resolve(item.baseType);
  }

  let matchedStats = [];
  let unmatchedModCount = 0;
  if (item.category === 'gear' && !item.unidentified && item.slot !== 'weapon') {
    for (const mod of item.mods) {
      const m = statMatcher && statMatcher.match(mod);
      if (m) matchedStats.push({ ...m, modText: mod });
      else unmatchedModCount++;
    }
    if (item.slot === 'chest') {
      // A chest with no life roll is the more valuable, more "min-maxed" outcome (all
      // budget went into the primary defence/damage stats instead), so life presence
      // isn't something to match for here - only exclude it, never require it.
      matchedStats = matchedStats.filter((m) => !/to maximum Life$/i.test(m.modText));
    }
  }

  const { result, usedStatCount } = await searchWithBroadening(league, item, matchedStats, onProgress);
  const ids = result.result.slice(0, FETCH_COUNT);
  report(`Fetching ${ids.length} listing${ids.length === 1 ? '' : 's'}...`);
  const listings = await tradeApi.fetchListings(ids, result.id, onProgress);
  const { priced, suggestion, low, high, icon, frameType } = summarizeListings(listings);

  return {
    item: {
      name: item.name,
      baseType: item.baseType,
      rarity: item.rarity,
      category: item.category,
      corrupted: item.corrupted,
      unidentified: item.unidentified,
      itemLevel: item.itemLevel,
      mods: item.mods,
      slot: item.slot,
      links: item.links,
      icon,
      frameType,
    },
    league,
    total: result.total,
    fetched: priced.length,
    statsMatched: usedStatCount,
    statsAvailable: matchedStats.length,
    unmatchedModCount,
    approximate: item.category === 'gear' && item.slot !== 'weapon' && (usedStatCount < matchedStats.length || matchedStats.length === 0),
    suggestion,
    low,
    high,
    listings: priced,
    tradeUrl: `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${result.id}`,
  };
}

module.exports = { checkPrice };
