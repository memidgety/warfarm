const IMG = 'https://warframe.market/static/assets/';
const container = document.getElementById('missions');
const minPlatInput = document.getElementById('min-plat');
let minTimer;
minPlatInput.addEventListener('input', () => {
  clearTimeout(minTimer);
  minTimer = setTimeout(load, 300);
});
const fmt = (v) => (v === null || v === undefined ? '-' : v.toFixed(1));

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

// Filtered rewards (below Min Plat) show their real price struck through.
function priceCell(filtered, rawPrice, price) {
  const td = el('td', undefined, 'num');
  if (filtered) td.appendChild(el('s', fmt(rawPrice), 'filtered'));
  else td.textContent = fmt(price);
  return td;
}

const sortStates = new Map(); // table id -> {key, dir}; survives re-renders

function nameCell(r, withIcon) {
  const name = el('td');
  if (withIcon && r.thumb) {
    const icon = el('span', undefined, 'item-icon-preview');
    const img = el('img', undefined, 'item-icon');
    img.src = IMG + r.thumb;
    img.alt = '';
    icon.appendChild(img);
    name.appendChild(icon);
  }
  if (r.slug) {
    const a = el('a', r.name);
    a.href = `/item?slug=${encodeURIComponent(r.slug)}`;
    name.appendChild(a);
  } else {
    name.appendChild(document.createTextNode(r.name));
  }
  return name;
}

// Reward table with sortable Chance / Price / Expected headers.
// rows: [{rot?, name, slug, thumb, chance, price, rawPrice, filtered}]
function rewardTable(id, rows, { rotation = false, icon = false, nameLabel = 'Reward' } = {}) {
  const expected = (r) => (r.chance / 100) * (r.price || 0);
  // Price sorts by the displayed value; unpriced rewards always sort last.
  const values = {
    chance: (r) => r.chance,
    price: (r) => (r.price === null || r.price === undefined ? null : (r.filtered ? r.rawPrice : r.price)),
    expected,
  };
  const table = el('table');
  const head = el('tr');
  if (rotation) head.appendChild(el('th', 'Rotation'));
  head.appendChild(el('th', nameLabel));
  const heads = {};
  [['chance', 'Chance'], ['price', 'Price (p)'], ['expected', 'Expected (p)']].forEach(([key, label]) => {
    const th = el('th', label, 'num sortable');
    th.addEventListener('click', () => {
      const s = sortStates.get(id);
      sortStates.set(id, s && s.key === key ? { key, dir: -s.dir } : { key, dir: -1 });
      render();
    });
    heads[key] = th;
    head.appendChild(th);
  });
  const thead = el('thead');
  thead.appendChild(head);
  table.appendChild(thead);
  const body = el('tbody');
  table.appendChild(body);

  function render() {
    const s = sortStates.get(id);
    const list = [...rows];
    if (s) {
      list.sort((a, b) => {
        const x = values[s.key](a);
        const y = values[s.key](b);
        if (x === null || y === null) return (x === null) - (y === null);
        return (x - y) * s.dir;
      });
    }
    Object.entries(heads).forEach(([key, th]) => {
      th.textContent = th.textContent.replace(/ [▲▼]$/, '');
      if (s && s.key === key) th.textContent += s.dir < 0 ? ' ▼' : ' ▲';
    });
    body.innerHTML = '';
    list.forEach((r) => {
      const tr = el('tr');
      if (rotation) tr.appendChild(el('td', r.rot));
      tr.appendChild(nameCell(r, icon));
      tr.appendChild(el('td', `${r.chance.toFixed(2)}%`, 'num'));
      tr.appendChild(priceCell(r.filtered, r.rawPrice, r.price));
      tr.appendChild(el('td', r.price === null ? '-' : expected(r).toFixed(2), 'num'));
      body.appendChild(tr);
    });
  }
  render();
  return table;
}

function renderGroup(m, g) {
  const wrap = el('section');
  wrap.appendChild(el('h3', `${g.label} - avg payout ${fmt(g.expectedPayout)}p per mission`));
  wrap.appendChild(el('div', `Planets: ${g.locations.join(', ')}`, 'muted'));
  if (g.missingPrices) {
    wrap.appendChild(el('div', `${g.missingPrices} mod(s) have no market price yet; payout is a lower bound.`, 'muted'));
  }
  wrap.appendChild(rewardTable(`mission|${m.id}|${g.key}`, g.rows, { icon: true, nameLabel: 'Mod' }));
  return wrap;
}

async function load() {
  const min = parseFloat(minPlatInput.value) || 0;
  const j = await (await fetch(`/api/missions?min=${encodeURIComponent(min)}`)).json();
  types = j.types;
  renderTypes();
  container.innerHTML = '';
  let missing = !j.dropsFetchedAt;
  j.missions.forEach((m) => {
    const best = m.groups.reduce((a, g) => (g.expectedPayout > a.expectedPayout ? g : a), m.groups[0]);
    const sec = el('details');
    sec.appendChild(el('summary', `${m.name} - best ${fmt(best.expectedPayout)}p (${best.label})`));
    const p = el('p', `${m.description} `);
    const link = el('a', 'Wiki');
    link.href = m.wiki;
    p.appendChild(link);
    sec.appendChild(p);
    const ul = el('ul');
    m.notes.forEach((n) => ul.appendChild(el('li', n)));
    sec.appendChild(ul);
    m.groups.forEach((g) => sec.appendChild(renderGroup(m, g)));
    container.appendChild(sec);
  });
  document.getElementById('status').textContent = missing
    ? 'Drop tables are still loading from warframe.com/droptables...'
    : '';
  if (missing) setTimeout(load, 5000);
}

let types = [];
let sortKey = 'avg';
let sortDir = -1;
const expanded = new Set();
const typeRows = document.getElementById('type-rows');
const typeSearch = document.getElementById('search');

const typeValue = (t, key) => (key === 'best' ? t.best.payout : t[key]);

function nodeTable(t) {
  const wrap = el('div');
  t.nodes.forEach((n) => {
    const d = el('details');
    d.open = t.nodes.length === 1;
    d.appendChild(el('summary', `${n.name} - ${n.payout.toFixed(2)}p (${n.basis})`));
    const rows = Object.keys(n.rewards).sort().flatMap((rot) => n.rewards[rot].map((r) => ({ ...r, rot })));
    d.appendChild(rewardTable(`node|${t.category}|${t.type}|${n.name}`, rows, { rotation: true }));
    wrap.appendChild(d);
  });
  return wrap;
}

function renderTypes() {
  const q = typeSearch.value.trim().toLowerCase();
  const list = types.filter((t) => !q || t.type.toLowerCase().includes(q));
  list.sort((a, b) => {
    const x = typeValue(a, sortKey);
    const y = typeValue(b, sortKey);
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sortDir;
  });
  typeRows.innerHTML = '';
  list.forEach((t) => {
    const key = `${t.category}|${t.type}`;
    const tr = el('tr', undefined, 'clickable');
    tr.appendChild(el('td', `${expanded.has(key) ? '\u25BE' : '\u25B8'} ${t.type}`));
    tr.appendChild(el('td', t.category));
    tr.appendChild(el('td', String(t.nodeCount), 'num'));
    tr.appendChild(el('td', t.basis, 'muted'));
    tr.appendChild(el('td', t.avg.toFixed(2), 'num'));
    tr.appendChild(el('td', t.nodeCount > 1 ? `${t.best.payout.toFixed(2)} (${t.best.name})` : t.best.payout.toFixed(2), 'num'));
    tr.addEventListener('click', () => {
      if (!expanded.delete(key)) expanded.add(key);
      renderTypes();
    });
    typeRows.appendChild(tr);
    if (expanded.has(key)) {
      const detail = el('tr');
      const td = el('td');
      td.colSpan = 6;
      td.appendChild(nodeTable(t));
      detail.appendChild(td);
      typeRows.appendChild(detail);
    }
  });
  document.querySelectorAll('#types th.sortable').forEach((th) => {
    th.textContent = th.textContent.replace(/ [▲▼]$/, '');
    if (th.dataset.sort === sortKey) th.textContent += sortDir < 0 ? ' ▼' : ' ▲';
  });
}

document.querySelectorAll('#types th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    if (sortKey === th.dataset.sort) sortDir = -sortDir;
    else { sortKey = th.dataset.sort; sortDir = th.dataset.sort === 'type' || th.dataset.sort === 'category' ? 1 : -1; }
    renderTypes();
  });
});
typeSearch.addEventListener('input', renderTypes);

load();
