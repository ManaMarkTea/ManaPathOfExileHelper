// Parses the plain text Path of Exile puts on the clipboard when you Ctrl+C an item in-game.

const MOD_LIKE = /^[+\-\d]|^[A-Z][a-z]+ (increased|reduced|to|from)|%|^Adds |^Grants |^Gain |^Recover |^You have|^\d/;
const NON_MOD_LINE = /^(Unidentified|Corrupted|Mirrored|Split|Fractured Item)$/i;

// "Advanced Mod Descriptions" appends the roll's range, e.g. "+34(33-37) to Dexterity" - strip it for matching/display.
function stripRollRange(line) {
  return line.replace(/\(\s*[\d.]+\s*-\s*[\d.]+\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}

function stripSections(text) {
  return text
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n-{5,}\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseItem(rawText) {
  const sections = stripSections(rawText);
  if (sections.length === 0) throw new Error('Empty item text');

  const header = sections[0].split('\n').map((l) => l.trim());
  const classLine = header.find((l) => l.startsWith('Item Class:'));
  const rarityLine = header.find((l) => l.startsWith('Rarity:'));
  if (!classLine || !rarityLine) {
    throw new Error('That doesn\'t look like a Path of Exile item (paste with Ctrl+C from in-game).');
  }

  const itemClass = classLine.replace('Item Class:', '').trim();
  const rarity = rarityLine.replace('Rarity:', '').trim();
  const nameLines = header.filter((l) => l && !l.startsWith('Item Class:') && !l.startsWith('Rarity:'));

  let name = nameLines[0] || '';
  let baseType = nameLines[1] || nameLines[0] || '';

  const item = {
    itemClass,
    rarity,
    name,
    baseType,
    corrupted: false,
    unidentified: false,
    mirrored: false,
    itemLevel: null,
    quality: null,
    gemLevel: null,
    links: 0,
    mods: [],
    raw: rawText,
  };

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    // Strip "Advanced Mod Descriptions" tier annotations, e.g. { Suffix Modifier "of the Leopard" (Tier: 4) — Attribute }
    const lines = section
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^[{[].*[}\]]$/.test(l));
    if (lines.length === 0) continue;

    if (lines.some((l) => /^Corrupted$/i.test(l))) item.corrupted = true;
    if (lines.some((l) => /^Unidentified$/i.test(l))) item.unidentified = true;
    if (lines.some((l) => /^Mirrored$/i.test(l))) item.mirrored = true;

    const ilvlLine = lines.find((l) => /^Item Level:\s*\d+/.test(l));
    if (ilvlLine) item.itemLevel = parseInt(ilvlLine.match(/\d+/)[0], 10);

    const qualityLine = lines.find((l) => /^Quality:\s*\+?\d+%/.test(l));
    if (qualityLine) item.quality = parseInt(qualityLine.match(/\d+/)[0], 10);

    const socketsLine = lines.find((l) => /^Sockets:/.test(l));
    if (socketsLine) {
      const groups = socketsLine.replace('Sockets:', '').trim().split(/\s+/);
      item.links = Math.max(0, ...groups.map((g) => g.split('-').length));
    }

    // Skip lines/sections we already handled or that are pure metadata, not mods.
    if (/^Requirements:/.test(lines[0])) continue;
    if (/^Sockets:/.test(lines[0]) || /^Quality:|^Armour:|^Evasion|^Energy Shield|^Ward:|^Block chance|^Stack Size:|^Item Level:|^Level:.*\(Max\)?$/.test(lines[0])) continue;
    if (lines.length === 1 && NON_MOD_LINE.test(lines[0])) continue;

    // Gem level: property block that has both "Level:" and no character-requirement tags.
    if (item.itemClass && /Gems?$/.test(item.itemClass)) {
      const gemLevelLine = lines.find((l) => /^Level:\s*\d+/.test(l) && !/Str:|Dex:|Int:/.test(section));
      if (gemLevelLine) {
        item.gemLevel = parseInt(gemLevelLine.match(/\d+/)[0], 10);
        continue;
      }
    }

    // Only uniques carry prose flavour text, and it's always its own section with no
    // mod-shaped line in it at all - so a section with zero MOD_LIKE lines is flavour,
    // not "a mod section with one weird line in it". Everything else in a mod section
    // is kept, even lines that don't match MOD_LIKE (e.g. "Culling Strike"), so one
    // unusual mod format doesn't silently drop the rest of the item's real mods.
    // Parenthetical reminder text, e.g. "(Elemental Ailments are Ignited, Scorched, ...)",
    // is never a mod line on its own - it's a rules explanation tacked onto the mod above it.
    const candidateLines = lines.filter((l) => !NON_MOD_LINE.test(l) && !/^\(.*\)$/.test(l));
    const looksLikeFlavour = item.rarity.toLowerCase() === 'unique' && !candidateLines.some((l) => MOD_LIKE.test(l));
    if (candidateLines.length > 0 && !looksLikeFlavour) {
      for (const l of candidateLines) item.mods.push(stripRollRange(l));
    }
  }

  item.category = classify(item);
  return item;
}

function classify(item) {
  const r = item.rarity.toLowerCase();
  if (r === 'currency' || /divination card/i.test(item.itemClass)) return 'currency';
  if (r === 'gem') return 'gem';
  if (r === 'unique') return 'unique';
  return 'gear'; // normal / magic / rare equipment
}

module.exports = { parseItem };
