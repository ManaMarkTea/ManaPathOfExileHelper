const { parseItem } = require('./itemParser');
const tradeApi = require('./tradeApi');

const MAX_STAT_FILTERS = 6;
const FETCH_COUNT = 10;
const MIN_RESULTS_TARGET = 3;

function buildQuery(item, matchedStats) {
  const query = { status: { option: 'online' } };

  if (item.category === 'currency') {
    query.type = item.baseType;
    return query;
  }

  if (item.category === 'gem') {
    query.type = item.name;
    if (item.gemLevel) {
      query.filters = { misc_filters: { filters: { gem_level: { min: item.gemLevel } } } };
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
  query.filters = { type_filters: { filters: { rarity: { option: item.rarity.toLowerCase() } } } };
  if (matchedStats.length > 0) {
    query.stats = [{ type: 'and', filters: matchedStats.map((m) => ({ id: m.id, disabled: false })) }];
  }
  return query;
}

async function searchWithBroadening(league, item, matchedStats) {
  if (item.category !== 'gear' || matchedStats.length === 0) {
    const query = buildQuery(item, []);
    const result = await tradeApi.search(league, query);
    return { result, usedStatCount: 0 };
  }

  const capped = matchedStats.slice(0, MAX_STAT_FILTERS);
  for (let k = capped.length; k >= 0; k--) {
    const query = buildQuery(item, capped.slice(0, k));
    const result = await tradeApi.search(league, query);
    if (result.result.length >= MIN_RESULTS_TARGET || k === 0) {
      return { result, usedStatCount: k };
    }
  }
  // unreachable, but keep a fallback
  const query = buildQuery(item, []);
  return { result: await tradeApi.search(league, query), usedStatCount: 0 };
}

function summarizeListings(listings) {
  const priced = listings
    .filter((l) => l.listing && l.listing.price && l.listing.price.amount > 0)
    .map((l) => ({
      amount: l.listing.price.amount,
      currency: l.listing.price.currency,
      account: l.listing.account && l.listing.account.name,
      itemName: l.item.name || l.item.typeLine,
    }));

  const icon = listings.find((l) => l.item && l.item.icon);
  const frameType = icon ? icon.item.frameType : null;

  if (priced.length === 0) return { priced, suggestion: null, icon: icon ? icon.item.icon : null, frameType };

  const suggestionIndex = Math.min(2, priced.length - 1);
  return { priced, suggestion: priced[suggestionIndex], icon: icon.item.icon, frameType };
}

async function checkPrice(rawText, league, statMatcher) {
  const item = parseItem(rawText);

  let matchedStats = [];
  let unmatchedModCount = 0;
  if (item.category === 'gear' && !item.unidentified) {
    for (const mod of item.mods) {
      const m = statMatcher && statMatcher.match(mod);
      if (m) matchedStats.push(m);
      else unmatchedModCount++;
    }
  }

  const { result, usedStatCount } = await searchWithBroadening(league, item, matchedStats);
  const ids = result.result.slice(0, FETCH_COUNT);
  const listings = await tradeApi.fetchListings(ids, result.id);
  const { priced, suggestion, icon, frameType } = summarizeListings(listings);

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
      icon,
      frameType,
    },
    league,
    total: result.total,
    fetched: priced.length,
    statsMatched: usedStatCount,
    statsAvailable: matchedStats.length,
    unmatchedModCount,
    approximate: item.category === 'gear' && (usedStatCount < matchedStats.length || matchedStats.length === 0),
    suggestion,
    listings: priced,
    tradeUrl: `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${result.id}`,
  };
}

module.exports = { checkPrice };
