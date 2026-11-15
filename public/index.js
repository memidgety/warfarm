const IMG = 'https://warframe.market/static/assets/';
let data = [];
const rows = document.getElementById('rows');
const search = document.getElementById('search');
const typeFilters = document.querySelectorAll('.type-btn');
const typeTags = {
  mod: ['mod'],
  arcane: ['arcane_enhancement', 'arcane_helmet'],
  relic: ['relic'],
  weapon: ['weapon'],
  warframe: ['warframe'],
  component: ['component'],
  blueprint: ['blueprint'],
  set: ['set'],
  resource: ['fish', 'gem', 'ore', 'resource', 'mineral'],
  cosmetic: ['scene', 'skin', 'emote', 'simulacrum', 'glyph'],
};
const categorizedTags = new Set(Object.values(typeTags).flat());
const wikiLinks = new Map();
let staticDetails;

async function loadWikiLink(slug) {
  if (!wikiLinks.has(slug)) {
    const request = (async () => {
      const base = window.WARFARMER_DATA;
      if (base && !staticDetails) {
        staticDetails = fetch(`${base}/details.json`).then((response) => {
          if (!response.ok) throw new Error(`Item details request failed (${response.status})`);
          return response.json();
        }).catch((error) => { staticDetails = null; throw error; });
      }
      let detail;
      if (base) detail = (await staticDetails)[slug];
      else {
        const response = await fetch(`/api/item/${encodeURIComponent(slug)}`);
        if (!response.ok) throw new Error(`Item details request failed (${response.status})`);
        detail = await response.json();
      }
      if (!detail) throw new Error('Item details not found');
      if (!detail.wikiLink) return null;
      const url = new URL(detail.wikiLink);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid wiki URL');
      return url.href;
    })().catch((error) => {
      wikiLinks.delete(slug);
      throw error;
    });
    wikiLinks.set(slug, request);
  }
  return wikiLinks.get(slug);
}

async function openPendingWiki(slug) {
  const tab = window.open('about:blank', '_blank');
  if (!tab) throw new Error('Pop-up blocked. Allow pop-ups to open the wiki.');
  tab.opener = null;
  try {
    const url = await loadWikiLink(slug);
    if (!url) throw new Error('No wiki link is available for this item.');
    if (!tab.closed) tab.location.href = url;
  } catch (error) {
    if (!tab.closed) tab.close();
    throw error;
  }
}

let sortKey = 'volume';
let sortDir = -1; // -1 descending, 1 ascending

const sortValue = (i, key) => (key === 'maxAvg' ? i.maxRank?.avg : i[key]);

// Rating = (volume / highest volume across all items) * average price (lowest rank).
function computeRatings() {
  const maxVolume = Math.max(0, ...data.map((i) => i.volume || 0));
  data.forEach((i) => {
    const hasValues = i.volume !== null && i.volume !== undefined && i.avg !== null && i.avg !== undefined;
    i.rating = maxVolume && hasValues ? (i.volume / maxVolume) * i.avg : null;
  });
}

const fmt = (v) => (v === null || v === undefined ? '-' : v.toFixed(1));

function updateHeaders() {
  document.querySelectorAll('th.sortable').forEach((th) => {
    th.textContent = th.textContent.replace(/ [▲▼]$/, '');
    if (th.dataset.sort === sortKey) th.textContent += sortDir < 0 ? ' ▼' : ' ▲';
  });
}

// Search syntax: space-separated terms must all match. "-term" excludes, "/regex/" is a
// case-insensitive regex, and "quoted phrases" may contain spaces. Combine, e.g. -/prime$/.
function parseSearch(text) {
  const tokens = text.match(/-?\/(?:\\.|[^/\\])+\/|-?"[^"]*"|\S+/g) || [];
  return tokens.map((raw) => {
    const exclude = raw.length > 1 && raw.startsWith('-');
    let term = exclude ? raw.slice(1) : raw;
    if (term.length > 2 && term.startsWith('"') && term.endsWith('"')) term = term.slice(1, -1);
    if (term.length > 2 && term.startsWith('/') && term.endsWith('/')) {
      try {
        const re = new RegExp(term.slice(1, -1), 'i');
        return { exclude, test: (name) => re.test(name) };
      } catch { /* invalid regex: treat as plain text */ }
    }
    const lower = term.toLowerCase();
    return { exclude, test: (name) => name.toLowerCase().includes(lower) };
  });
}

function render() {
  const terms = parseSearch(search.value);
  const typesIn = (state) => [...typeFilters].filter((b) => b.dataset.state === state).map((b) => b.dataset.type);
  const included = typesIn('include');
  const excluded = typesIn('exclude');
  const matchesType = (i, type) => (type === 'other'
    ? !i.tags?.some((tag) => categorizedTags.has(tag))
    : typeTags[type].some((tag) => i.tags?.includes(tag)));
  const list = data.filter((i) => {
    if (terms.some((t) => t.test(i.name) === t.exclude)) return false;
    if (excluded.some((type) => matchesType(i, type))) return false;
    return !included.length || included.some((type) => matchesType(i, type));
  });
  // Items without a value always sort last.
  list.sort((a, b) => {
    const x = sortValue(a, sortKey);
    const y = sortValue(b, sortKey);
    const xn = x === null || x === undefined;
    const yn = y === null || y === undefined;
    if (xn || yn) return xn - yn;
    return (x - y) * sortDir;
  });
  rows.innerHTML = '';
  list.slice(0, 500).forEach((i, n) => {
    const tr = document.createElement('tr');
    const maxAvg = i.maxRank ? `${fmt(i.maxRank.avg)} <small>(R${i.maxRank.rank})</small>` : '-';
    tr.innerHTML = `<td>${n + 1}</td>
      <td><span class="item-icon-preview"><img class="item-icon" src="${IMG}${i.thumb}" alt=""></span><a></a></td>
      <td class="wiki-cell"><span class="wiki-hover"></span></td>
      <td><button class="add-to-cart" type="button"></button></td>
      <td class="num">${i.volume}</td><td class="num">${fmt(i.avg)}</td><td class="num">${maxAvg}</td>
      <td class="num">${fmt(i.rating)}</td>`;
    const a = tr.querySelector('a');
    a.textContent = i.name;
    a.href = `item.html?slug=${encodeURIComponent(i.slug)}`;
    const wiki = tr.querySelector('.wiki-hover');
    const link = document.createElement('a');
    link.href = '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Wiki';
    link.setAttribute('aria-label', `${i.name} wiki`);
    wiki.appendChild(link);
    const wikiStatus = document.createElement('span');
    wikiStatus.setAttribute('role', 'status');
    wiki.appendChild(wikiStatus);
    let wikiUrl = null;
    let loadingWiki = false;
    let wikiLoaded = false;
    const showWiki = async () => {
      if (loadingWiki || wikiLoaded) return;
      loadingWiki = true;
      wikiStatus.textContent = '';
      try {
        const url = await loadWikiLink(i.slug);
        if (url) {
          wikiUrl = url;
          link.href = url;
        } else wikiStatus.textContent = ' (unavailable)';
        wikiLoaded = true;
      } catch (error) {
        console.error(`Could not load wiki link for ${i.name}:`, error);
        wikiStatus.textContent = ' (unavailable)';
        wiki.title = 'Could not load the wiki link. Leave and return to retry.';
      } finally {
        loadingWiki = false;
      }
    };
    link.addEventListener('click', async (event) => {
      if (wikiUrl) return;
      event.preventDefault();
      try {
        await openPendingWiki(i.slug);
      } catch (error) {
        console.error(`Could not open wiki for ${i.name}:`, error);
        wikiStatus.textContent = ` (${error.message})`;
      }
    });
    tr.addEventListener('mouseenter', showWiki);
    tr.addEventListener('focusin', showWiki);
    const addButton = tr.querySelector('.add-to-cart');
    addButton.appendChild(window.shoppingCart.createIcon());
    addButton.setAttribute('aria-label', `Add ${i.name} to cart`);
    addButton.title = `Add ${i.name} to cart`;
    addButton.addEventListener('click', async () => {
      addButton.disabled = true;
      try {
        await window.shoppingCart.add(i);
      } finally {
        addButton.disabled = false;
      }
    });
    rows.appendChild(tr);
  });
  updateHeaders();
}

document.querySelectorAll('th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    if (sortKey === th.dataset.sort) sortDir = -sortDir;
    else { sortKey = th.dataset.sort; sortDir = -1; }
    render();
  });
});

async function load() {
  const base = window.WARFARMER_DATA;
  const j = await (await fetch(base ? `${base}/items.json` : '/api/items')).json();
  data = j.items;
  computeRatings();
  document.getElementById('status').textContent = j.crawling
    ? `Loading market data: ${j.progress.done}/${j.progress.total} items fetched this pass (${data.length} shown). Refresh later for more.`
    : `${data.length} items with stats.`;
  render();
  if (j.crawling) setTimeout(load, 30000);
}

search.addEventListener('input', render);
const nextTypeState = { off: 'include', include: 'exclude', exclude: 'off' };
typeFilters.forEach((button) => button.addEventListener('click', () => {
  button.dataset.state = nextTypeState[button.dataset.state];
  render();
}));
load();
