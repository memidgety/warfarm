const slug = new URLSearchParams(location.search).get('slug');

function fill(id, rowsData, cells) {
  const tb = document.getElementById(id);
  tb.innerHTML = '';
  // Each cell takes the class (e.g. "num") of its column header so alignment matches.
  const heads = [...tb.closest('table').querySelectorAll('thead th')];
  for (const r of rowsData) {
    const tr = document.createElement('tr');
    cells(r).forEach((c, i) => {
      const td = document.createElement('td');
      td.textContent = c;
      if (heads[i] && heads[i].className) td.className = heads[i].className;
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  }
}

function renderRelic(data) {
  const rows = data.map((r) => ({
    ...r,
    expIntact: r.price == null || r.intact == null ? null : r.price * r.intact / 100,
    expRadiant: r.price == null || r.radiant == null ? null : r.price * r.radiant / 100,
  }));
  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  fill('relic-ev', [0], () => [+sum('expIntact').toFixed(2), +sum('expRadiant').toFixed(2)]);
  document.querySelectorAll('#relic-ev td').forEach((td) => td.classList.add('plat'));
  const tb = document.getElementById('relic-rows');
  const heads = [...tb.closest('table').querySelectorAll('thead th')];
  let key = 'price';
  let dir = -1;
  const draw = () => {
    heads.forEach((h) => {
      h.textContent = h.textContent.replace(/ [▲▼]$/, '');
      if (h.dataset.key === key) h.textContent += dir < 0 ? ' ▼' : ' ▲';
    });
    const sorted = rows.slice().sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
    });
    tb.innerHTML = '';
    for (const r of sorted) {
      const tr = document.createElement('tr');
      const cell = (content, cls) => {
        const td = document.createElement('td');
        if (cls) td.className = cls;
        if (content instanceof Node) td.appendChild(content); else td.textContent = content;
        tr.appendChild(td);
      };
      let name = r.name;
      if (r.slug) {
        name = document.createElement('a');
        name.href = `item.html?slug=${encodeURIComponent(r.slug)}`;
        name.textContent = r.name;
      }
      const f = (v) => (v == null ? '-' : v);
      cell(name);
      cell(r.rarity);
      const plat = (v, digits) => cell(v == null ? '-' : +v.toFixed(digits), v == null ? 'num' : 'num plat');
      plat(r.price, 1);
      cell(f(r.intact), 'num');
      cell(f(r.radiant), 'num');
      plat(r.expIntact, 2);
      plat(r.expRadiant, 2);
      tb.appendChild(tr);
    }
  };
  heads.forEach((h) => h.addEventListener('click', () => {
    if (key === h.dataset.key) dir = -dir;
    else { key = h.dataset.key; dir = key === 'name' || key === 'rarity' ? 1 : -1; }
    draw();
  }));
  draw();
}

async function loadDetail() {
  const base = window.WARFARMER_DATA;
  if (!base) {
    const res = await fetch(`/api/item/${encodeURIComponent(slug)}`);
    return res.ok ? res.json() : null;
  }
  // Static site: warframe.market blocks browser requests, so live orders are unavailable.
  const detail = (await (await fetch(`${base}/details.json`)).json())[slug];
  if (!detail) return null;
  document.querySelector('.cols').hidden = true;
  return { ...detail, sell: [], buy: [] };
}

(async () => {
  const d = await loadDetail();
  if (!d) { document.getElementById('name').textContent = 'Item not found'; return; }
  document.title = `${d.item.name} - WarFarmer`;
  document.getElementById('name').textContent = d.item.name;
  if (d.wikiLink) {
    const wikiLink = document.createElement('a');
    wikiLink.href = d.wikiLink;
    wikiLink.target = '_blank';
    wikiLink.rel = 'noopener noreferrer';
    wikiLink.className = 'wiki-button';
    wikiLink.textContent = 'Wiki Link';
    const wikiContainer = document.getElementById('wiki-link');
    wikiContainer.appendChild(wikiLink);
    wikiContainer.hidden = false;
  }
  const meta = document.getElementById('meta');
  const parts = [d.rarity && `Rarity: ${d.rarity}`, d.maxRank != null && `Max rank: ${d.maxRank}`,
    d.ducats != null && `Ducats: ${d.ducats}`, d.description].filter(Boolean);
  meta.textContent = parts.join(' | ');
  const link = document.createElement('a');
  link.href = `https://warframe.market/items/${d.item.slug}`;
  link.textContent = ' View on warframe.market';
  meta.appendChild(link);

  const order = (o) => [o.platinum, o.quantity, o.rank ?? '-', `${o.user} (${o.status})`];
  fill('sell',   d.sell.slice(0, 5), order);
    fill('buy', d.buy.slice(0, 5), order);
  if (d.relic) {
    document.getElementById('relic').hidden = false;
    renderRelic(d.relic);
  }
  fill('hist', d.buckets.slice().reverse(), (b) =>
    [b.t.replace('T', ' ').slice(0, 16), b.rank ?? '-', b.volume, b.avg, b.min, b.max]);
})();
