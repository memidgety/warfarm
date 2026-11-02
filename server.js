// Warframe.market reader: Node server with Neon-backed cache persistence.
// Crawls per-item 48h statistics at a polite rate and serves API and static pages.
const http = require('http');
const fs = require('fs');
const path = require('path');

const envFile = ['.env.local', '.env']
  .map((file) => path.join(__dirname, file))
  .find((file) => fs.existsSync(file));
if (envFile && require.main === module) require('dotenv').config({ path: envFile });

// Persistence needs Neon credentials, so it is only loaded when running as the server.
let closePersistence = async () => {};
let verifyPersistence = async () => {};
let writeCache = async () => {};

const PORT = process.env.PORT || 3000;
const API = 'https://api.warframe.market';
const HEADERS = {
  Language: 'en', Platform: 'pc', Accept: 'application/json',
  'User-Agent': 'WarFarmer/0.1 (personal market reader)',
};
const REQ_INTERVAL_MS = 400; // API limit is ~3 req/s
const HIGH_VOLUME_REFRESH_MS = 2 * 60 * 60 * 1000;
const LOW_VOLUME_REFRESH_MS = 24 * 60 * 60 * 1000;
const HIGH_VOLUME_THRESHOLD = 30; // About the 75th percentile in the current cache.
const CACHE_FILE = process.env.CACHE_FILE || path.join(__dirname, 'cache.json');
const PUBLIC = path.join(__dirname, 'public');

const DROP_TABLES_URL = 'https://warframe.com/droptables';
const DROPS_REFRESH_MS = 24 * 60 * 60 * 1000;

let items = []; // {slug,name,thumb,tags,rarity}
let stats = {}; // slug -> {fetchedAt, buckets:[{t,volume,avg,min,max,rank}]}
let drops = {}; // {fetchedAt, entries:[{name,type,category,rotations:{A:[[item,chance]]}}]}

function readLocalCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { items: [], stats: {}, drops: {} };
    throw error;
  }
}

function useCache(cache) {
  items = cache.items;
  stats = cache.stats;
  drops = cache.drops;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastReq = 0;
async function wfm(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastReq + REQ_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastReq = Date.now();
    const res = await fetch(API + url, { headers: HEADERS });
    if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }
  throw new Error(`${url} rate limited`);
}

async function save(snapshotObjectStorage = false) {
  const cache = { items, stats, drops };
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  await writeCache(cache, snapshotObjectStorage);
}

// Mission types. Each group is one reward pool; a mission is a single weighted
// roll from its group's pool (chances in the drop table sum to ~100%).
const MISSION_TYPES = [
  {
    id: 'nightmare',
    name: 'Nightmare Mode Mods',
    dropName: 'Nightmare Mode Rewards',
    wiki: 'https://wiki.warframe.com/w/Nightmare_Mode',
    description: 'One reward roll per mission, from the pool for the planet\'s group. Each Nightmare node can only pay out once per cycle (8 hours).',
    groups: [
      { key: 'A', label: 'Group A', locations: ['Mercury', 'Venus', 'Earth', 'Mars'] },
      { key: 'B', label: 'Group B', locations: ['Phobos', 'Ceres', 'Jupiter', 'Europa', 'Void', 'Lua', 'Kuva Fortress', 'Deimos', 'Saturn'] },
      { key: 'C', label: 'Group C', locations: ['Uranus', 'Neptune', 'Pluto', 'Eris', 'Sedna'] },
    ],
    notes: [
      'Rescue missions on any planet use the pool for objectives completed: A = one, B = two, C = all three (rescue hostage, stealth rescue, kill all Wardens).',
      'Mods are priced at rank 0 (how they drop).',
    ],
  },
];

const decodeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"');

// Mission type label from a drop table title. Star Chart nodes look like
// "Mercury/Apollodorus (Survival)"; "(Extra)" tables are bonus rewards.
function missionTypeOf(title) {
  const extra = / Extra$/.test(title);
  const base = title.replace(/ Extra$/, '').trim();
  const m = base.match(/\(([^()]+)\)\s*$/);
  let type;
  if (m) type = /^(Normal|Hard)$/.test(m[1]) ? `Duviri Endless (${m[1]})` : m[1];
  else type = base.replace(/ Week \d+$/, '').replace(/^.*\//, '');
  return extra ? `${type} (Extra)` : type;
}

// Parses the Missions and Dynamic Location regions of the drop table page into
// [{name, type, category, rotations: {A: [[item, chance]]}}]. Tables without
// rotation headers are stored as a single rotation "A".
function parseDropPage(html) {
  const regions = [
    { from: 'id="missionRewards"', to: 'id="relicRewards"', category: 'Missions' },
    { from: 'id="transientRewards"', to: 'id="sortieRewards"', category: 'Dynamic locations' },
  ];
  const entries = [];
  for (const r of regions) {
    const start = html.indexOf(r.from);
    const end = html.indexOf(r.to, start);
    if (start < 0 || end < 0) continue;
    for (const block of html.slice(start, end).split('<tr class="blank-row">')) {
      let name = null;
      let current = 'A';
      const rotations = {};
      for (const row of block.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)) {
        const th = row[1].match(/<th[^>]*>([^<]*)<\/th>/);
        const td = [...row[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((x) => x[1]);
        if (th) {
          const rot = th[1].match(/^Rotation (\w+)$/);
          if (rot) current = rot[1];
          else if (name === null && !td.length && !/^(Missions|Dynamic Location Rewards):$/.test(th[1])) name = decodeHtml(th[1]);
        } else if (td.length >= 2) {
          const chance = td[1].match(/\(([\d.]+)%\)/);
          if (chance) (rotations[current] = rotations[current] || []).push([decodeHtml(td[0]), parseFloat(chance[1])]);
        }
      }
      if (name && Object.keys(rotations).length) {
        entries.push({
          name, category: r.category,
          type: r.category === 'Missions' ? missionTypeOf(name) : name,
          rotations,
        });
      }
    }
  }
  return entries;
}

// Relic tables: { "Axi A1": { Intact: [[item, chance, rarity]], Radiant: [...] } }
function parseRelics(html) {
  const start = html.indexOf('id="relicRewards"');
  const end = html.indexOf('id="transientRewards"', start);
  const relics = {};
  if (start < 0) return relics;
  const region = html.slice(start, end < 0 ? undefined : end);
  for (const block of region.split('<tr class="blank-row">')) {
    let key = null;
    let refine = null;
    const rows = [];
    for (const row of block.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)) {
      const th = row[1].match(/<th[^>]*>([^<]*)<\/th>/);
      if (th) {
        const m = decodeHtml(th[1]).match(/^(.+) Relic \((\w+)\)$/);
        if (m) { key = m[1]; refine = m[2]; }
        continue;
      }
      const td = [...row[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((x) => x[1]);
      const m = td.length >= 2 && td[1].match(/^(\w+) \(([\d.]+)%\)/);
      if (m) rows.push([decodeHtml(td[0]), parseFloat(m[2]), m[1]]);
    }
    if (key) (relics[key] = relics[key] || {})[refine] = rows;
  }
  return relics;
}

let dropsLoading = false;
async function refreshDrops() {
  if (dropsLoading) return;
  if (drops.entries && drops.relics && Date.now() - drops.fetchedAt <= DROPS_REFRESH_MS) return;
  dropsLoading = true;
  try {
    const res = await fetch(DROP_TABLES_URL, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
    if (!res.ok) throw new Error(`drop tables -> ${res.status}`);
    const html = await res.text();
    const entries = parseDropPage(html);
    if (!entries.length) throw new Error('no drop tables parsed');
    drops = { fetchedAt: Date.now(), entries, relics: parseRelics(html) };
    await save(true);
  } catch (e) {
    console.error('drop refresh failed:', e.message);
  } finally {
    dropsLoading = false;
  }
}

async function loadItems() {
  const j = await wfm('/v2/items');
  items = j.data.map((i) => ({
    slug: i.slug,
    name: i.i18n.en.name,
    thumb: i.i18n.en.thumb,
    icon: i.i18n.en.icon,
    tags: i.tags || [],
    gameRef: i.gameRef,
  }));
}

function toBuckets(json) {
  const rows = (json && json.payload && json.payload.statistics_closed['48hours']) || [];
  return rows.map((r) => ({
    t: r.datetime, volume: r.volume, avg: r.avg_price,
    min: r.min_price, max: r.max_price, rank: r.mod_rank ?? null,
  }));
}

function recentBuckets(s) {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  return s.buckets.filter((x) => Date.parse(x.t) >= cutoff);
}

function recentVolume(s) {
  return recentBuckets(s).reduce((a, x) => a + x.volume, 0);
}

async function refreshItem(slug) {
  const j = await wfm(`/v1/items/${slug}/statistics`);
  stats[slug] = { fetchedAt: Date.now(), buckets: toBuckets(j) };
}

let crawling = false;
let progress = { done: 0, total: 0 };
async function crawl() {
  if (crawling) return;
  crawling = true;
  try {
    if (!items.length || !items[0].icon) await loadItems();
    // Stalest first; never-fetched items go first.
    const queue = items
      .map((i) => i.slug)
      .filter((s) => {
        if (!stats[s]) return true;
        const refreshMs = recentVolume(stats[s]) >= HIGH_VOLUME_THRESHOLD
          ? HIGH_VOLUME_REFRESH_MS
          : LOW_VOLUME_REFRESH_MS;
        return Date.now() - stats[s].fetchedAt > refreshMs;
      })
      .sort((a, b) => (stats[a]?.fetchedAt || 0) - (stats[b]?.fetchedAt || 0));
    progress = { done: 0, total: queue.length };
    for (const slug of queue) {
      try { await refreshItem(slug); } catch (e) { console.error(e.message); }
      progress.done++;
      if (progress.done % 50 === 0) await save();
    }
    if (queue.length) await save(true);
  } catch (e) {
    console.error('crawl failed:', e.message);
  } finally {
    crawling = false;
  }
}

function summarize(slug, tags = []) {
  const s = stats[slug];
  if (!s) return null;
  const b = recentBuckets(s);
  const volume = b.reduce((a, x) => a + x.volume, 0);
  const ranks = b.map((x) => x.rank).filter((r) => r !== null && r !== undefined);
  const ranked = ranks.length > 0;
  // Arcanes may have no rank 0 trades, so use the lowest rank that traded.
  const baseRank = tags.includes('arcane_enhancement') ? Math.min(...ranks) : 0;
  const rankZero = ranked ? b.filter((x) => x.rank === baseRank) : b;
  const average = (buckets) => {
    const rankVolume = buckets.reduce((a, x) => a + x.volume, 0);
    return rankVolume ? buckets.reduce((a, x) => a + x.avg * x.volume, 0) / rankVolume : null;
  };
  const maxRank = ranked ? Math.max(...ranks) : 0;
  const maxRankBuckets = maxRank > baseRank ? b.filter((x) => x.rank === maxRank) : [];
  return {
    volume,
    avg: average(rankZero),
    maxRank: maxRankBuckets.length ? {
      rank: maxRank,
      volume: maxRankBuckets.reduce((a, x) => a + x.volume, 0),
      avg: average(maxRankBuckets),
    } : null,
  };
}

// Rank 0 average price: last 24h, falling back to the full 48h window.
function rankZeroPrice(slug) {
  const s = stats[slug];
  if (!s) return null;
  const avg = (buckets) => {
    const v = buckets.reduce((a, x) => a + x.volume, 0);
    return v ? buckets.reduce((a, x) => a + x.avg * x.volume, 0) / v : null;
  };
  const zero = (b) => b.filter((x) => x.rank === 0 || x.rank === null || x.rank === undefined);
  return avg(zero(recentBuckets(s))) ?? avg(zero(s.buckets));
}

// Market value of a drop table item name (rank 0 price x quantity), or null if
// it isn't tradable (Endo, Credits, most resources, ...).
// The Min Plat filter is applied in the browser (public/missions.js).
function makeDropPricer() {
  const byName = new Map(items.map((i) => [i.name.toLowerCase(), i]));
  const memo = new Map();
  return (name) => {
    if (memo.has(name)) return memo.get(name);
    const q = name.match(/^([\d,]+)X (.+)$/);
    const item = byName.get((q ? q[2] : name).toLowerCase());
    const unit = item ? rankZeroPrice(item.slug) : null;
    const price = unit === null ? null : unit * (q ? parseInt(q[1].replace(/,/g, ''), 10) : 1);
    const r = { slug: item ? item.slug : null, thumb: item ? item.thumb : null, icon: item ? item.icon : null, price };
    memo.set(name, r);
    return r;
  };
}

// How many reward rolls a node pays and from which rotation (see wiki Mission Rewards):
// endless missions cycle A,A,B,C; Spy vaults and Caches pay A then B then C;
// Rescue pays the pool for objectives completed (best = C).
// weights[rotation] multiplies that rotation's expected value; the browser reuses them
// to recompute payouts when Min Plat changes.
function nodePayout(type, rotationEv) {
  const keys = Object.keys(rotationEv).sort();
  const weigh = (basis, fn) => {
    const weights = {};
    keys.forEach((k) => { weights[k] = fn(k); });
    return { payout: keys.reduce((a, k) => a + weights[k] * rotationEv[k], 0), basis, weights };
  };
  if (type === 'Nightmare Mode Rewards') return weigh('Mean of the A/B/C pools (depends on planet)', () => 1 / keys.length);
  if (type === 'Spy' || type === 'Caches') return weigh('All rotations (one reward each)', () => 1);
  if (type === 'Rescue') return weigh('All objectives (highest rotation)', (k) => (k === keys[keys.length - 1] ? 1 : 0));
  if (['A', 'B', 'C'].every((k) => k in rotationEv)) {
    return weigh('Per reward, AABC cycle', (k) => ({ A: 0.5, B: 0.25, C: 0.25 }[k] ?? 0));
  }
  if (keys.length === 1) return weigh('Single reward', () => 1);
  return weigh('Sum of rotations', () => 1);
}

function missionTypeTable() {
  const price = makeDropPricer();
  const groups = new Map();
  for (const e of drops.entries || []) {
    const rotationEv = {};
    const rewards = {};
    for (const [k, rows] of Object.entries(e.rotations)) {
      rewards[k] = rows.map(([name, chance]) => {
        const p = price(name);
        return { name, slug: p.slug, thumb: p.thumb, icon: p.icon, chance, price: p.price ?? 0 };
      });
      rotationEv[k] = rewards[k].reduce((a, r) => a + (r.chance / 100) * r.price, 0);
    }
    const node = { name: e.name, rotationEv, rewards, ...nodePayout(e.type, rotationEv) };
    const key = `${e.category}|${e.type}`;
    if (!groups.has(key)) groups.set(key, { type: e.type, category: e.category, nodes: [] });
    groups.get(key).nodes.push(node);
  }
  return [...groups.values()].map((g) => {
    g.nodes.sort((a, b) => b.payout - a.payout);
    const bases = {};
    g.nodes.forEach((n) => { bases[n.basis] = (bases[n.basis] || 0) + 1; });
    return {
      type: g.type, category: g.category, nodeCount: g.nodes.length,
      basis: Object.entries(bases).sort((a, b) => b[1] - a[1]).map(([b]) => b).join(' / '),
      avg: g.nodes.reduce((a, n) => a + n.payout, 0) / g.nodes.length,
      best: { name: g.nodes[0].name, payout: g.nodes[0].payout },
      nodes: g.nodes,
    };
  }).sort((a, b) => b.avg - a.avg);
}

function missionPayouts() {
  const price = makeDropPricer();
  return MISSION_TYPES.map((t) => {
    const d = (drops.entries || []).find((e) => e.name === t.dropName);
    const groups = t.groups.map((g) => {
      const rows = ((d && d.rotations[g.key]) || []).map(([name, chance]) => {
        const p = price(name);
        return {
          name, slug: p.slug, thumb: p.thumb, icon: p.icon, chance, price: p.price,
          expected: p.price === null ? 0 : (chance / 100) * p.price,
        };
      }).sort((a, b) => b.expected - a.expected);
      return {
        key: g.key, label: g.label, locations: g.locations, rows,
        totalChance: rows.reduce((a, r) => a + r.chance, 0),
        // Unpriced mods contribute 0, so this is a lower bound if any are missing.
        expectedPayout: rows.reduce((a, r) => a + r.expected, 0),
        missingPrices: rows.filter((r) => r.price === null).length,
      };
    });
    return {
      id: t.id, name: t.name, description: t.description, wiki: t.wiki, notes: t.notes,
      dropsFetchedAt: d ? drops.fetchedAt : null, groups,
    };
  });
}

function relicFor(item, price = makeDropPricer()) {
  const rel = (item.tags || []).includes('relic') && (drops.relics || {})[item.name.replace(/ Relic$/, '')];
  if (!rel) return null;
  const names = new Map();
  for (const rows of Object.values(rel)) for (const [n, , rarity] of rows) if (!names.has(n)) names.set(n, rarity);
  return [...names].map(([name, rarity]) => {
    const p = price(name);
    const chance = (k) => ((rel[k] || []).find((r) => r[0] === name) || [])[1] ?? null;
    return { name, rarity, slug: p.slug, price: p.price, intact: chance('Intact'), radiant: chance('Radiant') };
  }).sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
}

// Per-item data for the static site, which cannot call warframe.market for live orders.
function itemDetails() {
  const price = makeDropPricer();
  const details = {};
  for (const item of items) {
    if (!stats[item.slug]) continue;
    details[item.slug] = { item, relic: relicFor(item, price), buckets: stats[item.slug].buckets };
  }
  return details;
}

async function itemDetail(slug) {
  const item = items.find((i) => i.slug === slug);
  if (!item) return null;
  const [orders, set] = await Promise.all([
    wfm(`/v2/orders/item/${slug}`),
    wfm(`/v2/item/${slug}`),
  ]);
  const live = ((orders && orders.data) || [])
    .filter((o) => o.visible && o.user.status !== 'offline')
    .map((o) => ({
      type: o.type, platinum: o.platinum, quantity: o.quantity, rank: o.rank ?? null,
      user: o.user.ingameName, status: o.user.status,
    }));
  const d = (set && set.data) || {};
  return {
    item,
    relic: relicFor(item),
    description: d.i18n?.en?.description || null,
    wikiLink: d.i18n?.en?.wikiLink || null,
    rarity: d.rarity || null,
    maxRank: d.maxRank ?? null,
    ducats: d.ducats ?? null,
    sell: live.filter((o) => o.type === 'sell').sort((a, b) => a.platinum - b.platinum),
    buy: live.filter((o) => o.type === 'buy').sort((a, b) => b.platinum - a.platinum),
    buckets: (stats[slug] && stats[slug].buckets) || [],
  };
}

function itemRows() {
  const rows = items
    .map((i) => ({ ...i, ...(summarize(i.slug, i.tags) || { volume: null, avg: null }) }))
    .filter((r) => r.volume !== null);
  rows.sort((a, b) => b.volume - a.volume);
  return rows;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/health') {
      await verifyPersistence();
      return json(res, 200, { ok: true, postgres: 'connected', objectStorage: 'connected' });
    }
    if (url.pathname === '/api/items') {
      return json(res, 200, { progress, crawling, totalItems: items.length, items: itemRows() });
    }
    if (url.pathname === '/api/missions') {
      return json(res, 200, { missions: missionPayouts(), types: missionTypeTable(), dropsFetchedAt: drops.fetchedAt || null });
    }
    const m = url.pathname.match(/^\/api\/item\/([\w-]+)$/);
    if (m) {
      const d = await itemDetail(m[1]);
      return d ? json(res, 200, d) : json(res, 404, { error: 'not found' });
    }
    const file = url.pathname === '/' ? '/index.html' : url.pathname === '/item' ? '/item.html' : url.pathname === '/missions' ? '/missions.html' : url.pathname;
    const p = path.normalize(path.join(PUBLIC, file));
    if (!p.startsWith(PUBLIC) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

async function start() {
  const persistence = require('./persistence');
  ({ closePersistence, verifyPersistence, writeCache } = persistence);
  const { initializeCache } = persistence;
  useCache(await initializeCache(readLocalCache()));
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ items, stats, drops }));
  server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
  console.log('Persistent cache ready (Neon Postgres and Object Storage)');
  crawl();
  setInterval(crawl, 15 * 60 * 1000);
  refreshDrops();
  setInterval(refreshDrops, 60 * 60 * 1000);
}

if (require.main === module) {
  start().catch((error) => {
    console.error('startup failed:', error);
    process.exitCode = 1;
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(async () => {
        try {
          await closePersistence();
        } catch (error) {
          console.error('shutdown failed:', error);
          process.exitCode = 1;
        }
      });
    });
  }
}

module.exports = {
  useCache,
  crawl,
  refreshDrops,
  itemRows,
  itemDetails,
  missionTypeTable,
  missionPayouts,
  getCache: () => ({ items, stats, drops }),
};
