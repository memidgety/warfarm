const IMG = 'https://warframe.market/static/assets/';
const container = document.getElementById('missions');
const fmt = (v) => (v === null || v === undefined ? '-' : v.toFixed(1));

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function renderGroup(g) {
  const wrap = el('section');
  wrap.appendChild(el('h3', `${g.label} - avg payout ${fmt(g.expectedPayout)}p per mission`));
  wrap.appendChild(el('div', `Planets: ${g.locations.join(', ')}`, 'muted'));
  if (g.missingPrices) {
    wrap.appendChild(el('div', `${g.missingPrices} mod(s) have no market price yet; payout is a lower bound.`, 'muted'));
  }
  const table = el('table');
  table.innerHTML = '<thead><tr><th>Mod</th><th class="num">Chance</th><th class="num">Price (p)</th><th class="num">Expected (p)</th></tr></thead>';
  const body = el('tbody');
  g.rows.forEach((r) => {
    const tr = el('tr');
    const name = el('td');
    if (r.thumb) {
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
    tr.appendChild(name);
    tr.appendChild(el('td', `${r.chance.toFixed(2)}%`, 'num'));
    tr.appendChild(el('td', fmt(r.price), 'num'));
    tr.appendChild(el('td', r.price === null ? '-' : r.expected.toFixed(2), 'num'));
    body.appendChild(tr);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  return wrap;
}

async function load() {
  const j = await (await fetch('/api/missions')).json();
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
    m.groups.forEach((g) => sec.appendChild(renderGroup(g)));
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
    const table = el('table');
    table.innerHTML = '<thead><tr><th>Rotation</th><th>Reward</th><th class="num">Chance</th><th class="num">Price (p)</th><th class="num">Expected (p)</th></tr></thead>';
    const body = el('tbody');
    Object.keys(n.rewards).sort().forEach((rot) => {
      n.rewards[rot].forEach((r) => {
        const tr = el('tr');
        tr.appendChild(el('td', rot));
        const name = el('td');
        if (r.slug) {
          const a = el('a', r.name);
          a.href = `/item?slug=${encodeURIComponent(r.slug)}`;
          name.appendChild(a);
        } else {
          name.textContent = r.name;
        }
        tr.appendChild(name);
        tr.appendChild(el('td', `${r.chance.toFixed(2)}%`, 'num'));
        tr.appendChild(el('td', r.price.toFixed(1), 'num'));
        tr.appendChild(el('td', ((r.chance / 100) * r.price).toFixed(2), 'num'));
        body.appendChild(tr);
      });
    });
    table.appendChild(body);
    d.appendChild(table);
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
