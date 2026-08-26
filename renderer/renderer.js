const CURRENCY_NAMES = {
  chaos: 'Chaos Orb',
  divine: 'Divine Orb',
  exalted: 'Exalted Orb',
  alch: 'Orb of Alchemy',
  chance: 'Orb of Chance',
  gcp: "Gemcutter's Prism",
  jew: "Jeweller's Orb",
  chrome: 'Chromatic Orb',
  fuse: 'Orb of Fusing',
  alt: 'Orb of Alteration',
  regret: 'Orb of Regret',
  regal: 'Regal Orb',
  vaal: 'Vaal Orb',
  scour: 'Orb of Scouring',
  blessed: 'Blessed Orb',
  chisel: "Cartographer's Chisel",
  mirror: 'Mirror of Kalandra',
  silver: 'Silver Coin',
  annul: 'Orb of Annulment',
  awaken: "Awakener's Orb",
};

function currencyName(code) {
  return CURRENCY_NAMES[code] || code;
}

function formatPrice(p) {
  if (!p) return '';
  const amount = Number.isInteger(p.amount) ? p.amount : p.amount.toFixed(1);
  return `${amount} × ${currencyName(p.currency)}`;
}

// Same colors the PoE client uses for item name/frame by rarity.
const RARITY_COLORS = {
  normal: '#c8c8c8',
  magic: '#8888ff',
  rare: '#ffff77',
  unique: '#af6025',
  gem: '#1ba29b',
  currency: '#aa9e82',
  'divination card': '#cc8fdb',
};

function rarityColor(rarity) {
  return RARITY_COLORS[(rarity || '').toLowerCase()] || RARITY_COLORS.normal;
}

const el = {
  league: document.getElementById('league'),
  input: document.getElementById('itemInput'),
  checkBtn: document.getElementById('checkBtn'),
  status: document.getElementById('status'),
  result: document.getElementById('result'),
  itemCard: document.getElementById('itemCard'),
  itemIcon: document.getElementById('itemIcon'),
  itemName: document.getElementById('itemName'),
  itemBase: document.getElementById('itemBase'),
  itemMods: document.getElementById('itemMods'),
  itemFlags: document.getElementById('itemFlags'),
  suggestionBox: document.getElementById('suggestionBox'),
  suggestionValue: document.getElementById('suggestionValue'),
  suggestionRange: document.getElementById('suggestionRange'),
  suggestionSub: document.getElementById('suggestionSub'),
  noResults: document.getElementById('noResults'),
  listings: document.getElementById('listings'),
  openTrade: document.getElementById('openTrade'),
};

let lastTradeUrl = null;

function setStatus(msg, isError) {
  el.status.textContent = msg || '';
  el.status.classList.toggle('error', !!isError);
}

async function loadLeagues() {
  try {
    const { leagues, current } = await window.api.getLeagues();
    el.league.innerHTML = '';
    for (const l of leagues) {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.text;
      if (l.id === current) opt.selected = true;
      el.league.appendChild(opt);
    }
  } catch (err) {
    setStatus('Could not load league list: ' + err.message, true);
  }
}

function renderResult(res) {
  el.result.classList.remove('hidden');

  const color = rarityColor(res.item.rarity);
  el.itemCard.style.setProperty('--rarity', color);
  el.itemName.textContent = res.item.name || res.item.baseType;
  el.itemBase.textContent = res.item.baseType !== res.item.name ? res.item.baseType : '';
  el.itemBase.classList.toggle('hidden', res.item.baseType === res.item.name);

  if (res.item.icon) {
    el.itemIcon.src = res.item.icon;
    el.itemIcon.classList.remove('hidden');
  } else {
    el.itemIcon.classList.add('hidden');
  }

  el.itemMods.innerHTML = '';
  for (const mod of res.item.mods || []) {
    const line = document.createElement('div');
    line.className = 'mod-line';
    line.textContent = mod;
    el.itemMods.appendChild(line);
  }

  el.itemFlags.innerHTML = '';
  if (res.item.corrupted) {
    const f = document.createElement('span');
    f.className = 'flag-corrupted';
    f.textContent = 'Corrupted';
    el.itemFlags.appendChild(f);
  }
  if (res.item.unidentified) {
    const f = document.createElement('span');
    f.className = 'flag-unidentified';
    f.textContent = 'Unidentified';
    el.itemFlags.appendChild(f);
  }

  if (res.suggestion) {
    el.suggestionBox.classList.remove('hidden');
    el.noResults.classList.add('hidden');
    el.suggestionValue.textContent = formatPrice(res.suggestion);

    const sameAsMedian = (a, b) => a && b && a.amount === b.amount && a.currency === b.currency;
    if (res.low && res.high && !(sameAsMedian(res.low, res.suggestion) && sameAsMedian(res.high, res.suggestion))) {
      el.suggestionRange.textContent = `range seen: ${formatPrice(res.low)} – ${formatPrice(res.high)}`;
      el.suggestionRange.classList.remove('hidden');
    } else {
      el.suggestionRange.classList.add('hidden');
    }

    const parts = [`based on ${res.fetched} of ${res.total} live listing${res.total === 1 ? '' : 's'}`];
    if (res.item.slot === 'weapon') {
      parts.push('matched by DPS + item level');
    } else if (res.approximate) {
      const extras = [];
      if (res.item.itemLevel) extras.push('item level');
      if (res.item.slot === 'chest' && res.item.links > 0) extras.push(`${res.item.links}-link`);
      parts.push(
        res.statsMatched > 0
          ? `matched ${res.statsMatched}/${res.statsAvailable} mods - approximate`
          : `${extras.length ? `matched on ${extras.join(' + ')} only` : 'broad match on item type only'} - approximate`
      );
    }
    el.suggestionSub.textContent = parts.join(', ');
  } else {
    el.suggestionBox.classList.add('hidden');
    el.noResults.classList.remove('hidden');
  }

  el.listings.innerHTML = '';
  for (const l of res.listings) {
    const card = document.createElement('div');
    card.className = 'listing-card';

    const row = document.createElement('div');
    row.className = 'listing-row';
    const name = document.createElement('span');
    name.textContent = l.itemName;
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = formatPrice(l);
    row.appendChild(name);
    row.appendChild(price);
    card.appendChild(row);

    const metaBits = [];
    if (l.ilvl) metaBits.push(`ilvl ${l.ilvl}`);
    if (l.links >= 4) metaBits.push(`${l.links}-link`);
    if (l.dps) metaBits.push(`${l.dps} dps`);
    if (metaBits.length) {
      const meta = document.createElement('div');
      meta.className = 'listing-meta';
      meta.textContent = metaBits.join(' · ');
      card.appendChild(meta);
    }

    if (l.mods && l.mods.length) {
      const details = document.createElement('div');
      details.className = 'listing-mods hidden';
      for (const mod of l.mods) {
        const line = document.createElement('div');
        line.textContent = mod;
        details.appendChild(line);
      }
      card.appendChild(details);
      row.classList.add('expandable');
      row.addEventListener('click', () => details.classList.toggle('hidden'));
    }

    el.listings.appendChild(card);
  }

  lastTradeUrl = res.tradeUrl;
}

async function checkPrice() {
  const text = el.input.value.trim();
  if (!text) {
    setStatus('Paste an item first (Ctrl+C in-game, then Ctrl+V here).', true);
    return;
  }
  el.checkBtn.disabled = true;
  el.result.classList.add('hidden');
  setStatus('Starting...');

  const stopProgress = window.api.onProgress((message) => setStatus(message));
  try {
    const res = await window.api.checkPrice(text, el.league.value);
    setStatus('');
    renderResult(res);
  } catch (err) {
    setStatus(err.message || 'Something went wrong.', true);
  } finally {
    stopProgress();
    el.checkBtn.disabled = false;
  }
}

el.checkBtn.addEventListener('click', checkPrice);

el.input.addEventListener('paste', () => {
  setTimeout(checkPrice, 0);
});

el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) checkPrice();
});

el.openTrade.addEventListener('click', () => {
  if (lastTradeUrl) window.api.openExternal(lastTradeUrl);
});

loadLeagues();
