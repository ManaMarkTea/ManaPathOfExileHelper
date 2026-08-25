// Thin wrapper around the official pathofexile.com/trade public search API.
// No login/session is required for searching or fetching listings - only whispering
// a seller in-game requires an authenticated POESESSID, which this app never touches.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BASE = 'https://www.pathofexile.com/api/trade';

async function getLeagues() {
  const res = await fetch(`${BASE}/data/leagues`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load leagues (HTTP ${res.status})`);
  const data = await res.json();
  return data.result.filter((l) => l.realm === 'pc');
}

function pickCurrentLeague(leagues) {
  const softcoreTrade = leagues.find((l) => !/hardcore|ruthless/i.test(l.text) && l.id !== 'Standard');
  return (softcoreTrade || leagues.find((l) => l.id === 'Standard') || leagues[0])?.id;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The trade API's rate limit resets fast (a handful of seconds), so one honest wait-and-
// retry - using the Retry-After header when present - clears a transient 429 instead of
// just failing a whole price check that made several requests (broadening, then fetch).
async function fetchWithRateLimitRetry(url, options) {
  const res = await fetch(url, options);
  if (res.status !== 429) return res;

  const retryAfter = parseFloat(res.headers.get('retry-after'));
  await sleep((Number.isFinite(retryAfter) ? retryAfter : 3) * 1000);
  return fetch(url, options);
}

async function search(league, query) {
  const res = await fetchWithRateLimitRetry(`${BASE}/search/${encodeURIComponent(league)}`, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, sort: { price: 'asc' } }),
  });
  if (res.status === 429) throw new Error('Trade site rate limit hit - wait a few seconds and try again.');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Trade search failed (HTTP ${res.status}). ${body.slice(0, 200)}`);
  }
  return res.json(); // { id, complexity, result: [itemId, ...], total }
}

async function fetchListings(ids, queryId) {
  if (ids.length === 0) return [];
  const res = await fetchWithRateLimitRetry(`${BASE}/fetch/${ids.join(',')}?query=${queryId}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (res.status === 429) throw new Error('Trade site rate limit hit - wait a few seconds and try again.');
  if (!res.ok) throw new Error(`Trade fetch failed (HTTP ${res.status})`);
  const data = await res.json();
  return (data.result || []).filter(Boolean);
}

module.exports = { getLeagues, pickCurrentLeague, search, fetchListings };
