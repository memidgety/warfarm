const IMG = 'https://warframe.market/static/assets/';
const container = document.getElementById('missions');
const minPlatInput = document.getElementById('min-plat');
// Min Plat is applied here in the browser; the server only sends unfiltered prices.
minPlatInput.addEventListener('input', () => { if (raw) render(); });
const fmt = (v) => (v === null || v === undefined ? '-' : v.toFixed(1));

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

// Filtered rewards (below Min Plat) show their real price struck through.
function priceCell(filtered, rawPrice, price) {
  const td = el('td', undefined, (price === null || price === undefined) && !filtered ? 'num' : 'num plat');
  if (filtered) td.appendChild(el('s', fmt(rawPrice), 'filtered'));
  else td.textContent = fmt(price);
  return td;
}

const sortStates = new Map(); // table id -> {key, dir}; survives re-renders

function nameCell(r, withIcon) {
  const name = el('td');
  if (withIcon && r.thumb) {
    const icon = el('span', undefined, 'item-thumb');
    const img = el('img');
    img.src = IMG + r.thumb;
    img.alt = '';
    icon.appendChild(img);
    name.appendChild(icon);
  }
  if (r.slug) {
    const a = el('a', r.name);
    a.href = `item.html?slug=${encodeURIComponent(r.slug)}`;
    name.appendChild(a);
  } else {
    name.appendChild(document.createTextNode(r.name));
  }
  if (r.thumb) attachPreview(name, r);
  return name;
}

// Floating hover preview using the full-size icon (falls back to the thumbnail).
const popup = el('img', undefined, 'icon-popup');
popup.hidden = true;
document.body.appendChild(popup);
popup.addEventListener('error', () => {
  if (popup.dataset.fallback && popup.src !== popup.dataset.fallback) popup.src = popup.dataset.fallback;
});

function placePopup(e) {
  const gap = 16;
  const w = popup.offsetWidth;
  const h = popup.offsetHeight;
  let x = e.clientX + gap;
  if (x + w > window.innerWidth) x = Math.max(0, e.clientX - gap - w);
  const y = Math.min(Math.max(0, e.clientY - h / 2), Math.max(0, window.innerHeight - h));
  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;
}

function attachPreview(target, r) {
  target.addEventListener('mouseenter', (e) => {
    popup.dataset.fallback = IMG + r.thumb;
    popup.src = IMG + (r.icon || r.thumb);
    popup.hidden = false;
    placePopup(e);
  });
  target.addEventListener('mousemove', placePopup);
  target.addEventListener('mouseleave', () => { popup.hidden = true; });
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
      tr.appendChild(el('td', r.price === null ? '-' : expected(r).toFixed(2), r.price === null ? 'num' : 'num plat'));
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

let raw = null;

// Rewards priced below Min Plat count as 0 in totals but keep their real price for display.
function priceRow(r, min) {
  const filtered = r.price !== null && r.price > 0 && r.price < min;
  return { ...r, rawPrice: r.price, filtered, price: filtered ? 0 : r.price };
}

function applyMinToTypes(list, min) {
  return list.map((t) => {
    const nodes = t.nodes.map((n) => {
      const rewards = {};
      let payout = 0;
      for (const [rot, rows] of Object.entries(n.rewards)) {
        rewards[rot] = rows.map((r) => priceRow(r, min));
        const ev = rewards[rot].reduce((a, r) => a + (r.chance / 100) * r.price, 0);
        payout += (n.weights[rot] || 0) * ev;
      }
      return { ...n, rewards, payout };
    }).sort((a, b) => b.payout - a.payout);
    return {
      ...t, nodes,
      avg: nodes.reduce((a, n) => a + n.payout, 0) / nodes.length,
      best: { name: nodes[0].name, payout: nodes[0].payout },
    };
  });
}

function applyMinToMissions(list, min) {
  return list.map((m) => ({
    ...m,
    groups: m.groups.map((g) => {
      const rows = g.rows.map((r) => {
        const p = priceRow(r, min);
        return { ...p, expected: p.price === null ? 0 : (p.chance / 100) * p.price };
      }).sort((a, b) => b.expected - a.expected);
      return { ...g, rows, expectedPayout: rows.reduce((a, r) => a + r.expected, 0) };
    }),
  }));
}

async function load() {
  const base = window.WARFARMER_DATA;
  raw = await (await fetch(base ? `${base}/missions.json` : '/api/missions')).json();
  render();
  if (!raw.dropsFetchedAt) setTimeout(load, 5000);
}

function render() {
  const min = parseFloat(minPlatInput.value) || 0;
  const j = { ...raw, types: applyMinToTypes(raw.types, min), missions: applyMinToMissions(raw.missions, min) };
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
  if (t.nodes.length === 1) {
    const n = t.nodes[0];
    const rows = Object.keys(n.rewards).sort().flatMap((rot) => n.rewards[rot].map((r) => ({ ...r, rot })));
    wrap.appendChild(rewardTable(`node|${t.category}|${t.type}|${n.name}`, rows, { rotation: true }));
    return wrap;
  }
  t.nodes.forEach((n) => {
    const d = el('details');
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
      td.colSpan = 3;
      td.appendChild(nodeTable(t));
      detail.appendChild(td);
      typeRows.appendChild(detail);
    }
  });
  document.querySelectorAll('#types th.sortable').forEach((th) => {
    let arrow = th.querySelector('.arrow');
    if (!arrow) { arrow = el('span', '', 'arrow'); th.appendChild(arrow); }
    arrow.textContent = th.dataset.sort === sortKey ? (sortDir < 0 ? ' ▼' : ' ▲') : '';
  });
}

document.querySelectorAll('#types th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    if (sortKey === th.dataset.sort) sortDir = -sortDir;
    else { sortKey = th.dataset.sort; sortDir = th.dataset.sort === 'type' ? 1 : -1; }
    renderTypes();
  });
});
typeSearch.addEventListener('input', renderTypes);

load();
