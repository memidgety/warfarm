const IMG = 'https://warframe.market/static/assets/';
let data = [];
const rows = document.getElementById('rows');
const search = document.getElementById('search');
const typeFilters = document.querySelectorAll('.type-filter input[type="checkbox"]');
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

function render() {
  const q = search.value.trim().toLowerCase();
  const selectedTypes = [...typeFilters].filter((filter) => filter.checked).map((filter) => filter.value);
  const list = data.filter((i) => {
    if (q && !i.name.toLowerCase().includes(q)) return false;
    if (!selectedTypes.length) return true;
    return selectedTypes.some((type) => {
      if (type === 'other') return !i.tags?.some((tag) => categorizedTags.has(tag));
      return typeTags[type].some((tag) => i.tags?.includes(tag));
    });
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
      <td class="num">${i.volume}</td><td class="num">${fmt(i.avg)}</td><td class="num">${maxAvg}</td>
      <td class="num">${fmt(i.rating)}</td>`;
    const a = tr.querySelector('a');
    a.textContent = i.name;
    a.href = `item.html?slug=${encodeURIComponent(i.slug)}`;
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
typeFilters.forEach((filter) => filter.addEventListener('change', render));
load();
