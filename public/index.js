const IMG = 'https://warframe.market/static/assets/';
let data = [];
const rows = document.getElementById('rows');
const search = document.getElementById('search');

let sortKey = 'volume';
let sortDir = -1; // -1 descending, 1 ascending

const sortValue = (i, key) => (key === 'maxAvg' ? i.maxRank?.avg : i[key]);
const fmt = (v) => (v === null || v === undefined ? '-' : v.toFixed(1));

function updateHeaders() {
  document.querySelectorAll('th.sortable').forEach((th) => {
    th.textContent = th.textContent.replace(/ [▲▼]$/, '');
    if (th.dataset.sort === sortKey) th.textContent += sortDir < 0 ? ' ▼' : ' ▲';
  });
}

function render() {
  const q = search.value.trim().toLowerCase();
  const list = data.filter((i) => !q || i.name.toLowerCase().includes(q));
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
      <td class="num">${i.volume}</td><td class="num">${fmt(i.avg)}</td><td class="num">${maxAvg}</td>`;
    const a = tr.querySelector('a');
    a.textContent = i.name;
    a.href = `/item?slug=${encodeURIComponent(i.slug)}`;
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
  const j = await (await fetch('/api/items')).json();
  data = j.items;
  document.getElementById('status').textContent = j.crawling
    ? `Loading market data: ${j.progress.done}/${j.progress.total} items fetched this pass (${data.length} shown). Refresh later for more.`
    : `${data.length} items with stats.`;
  render();
  if (j.crawling) setTimeout(load, 30000);
}

search.addEventListener('input', render);
load();
