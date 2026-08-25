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

async function search(league, query) {
  const res = await fetch(`${BASE}/search/${encodeURIComponent(league)}`, {
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
  const res = await fetch(`${BASE}/fetch/${ids.join(',')}?query=${queryId}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (res.status === 429) throw new Error('Trade site rate limit hit - wait a few seconds and try again.');
  if (!res.ok) throw new Error(`Trade fetch failed (HTTP ${res.status})`);
  const data = await res.json();
  return (data.result || []).filter(Boolean);
}

module.exports = { getLeagues, pickCurrentLeague, search, fetchListings };
