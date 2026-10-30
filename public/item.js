const slug = new URLSearchParams(location.search).get('slug');

function fill(id, rowsData, cells) {
  const tb = document.getElementById(id);
  tb.innerHTML = '';
  for (const r of rowsData) {
    const tr = document.createElement('tr');
    for (const c of cells(r)) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
}

(async () => {
  const res = await fetch(`/api/item/${encodeURIComponent(slug)}`);
  if (!res.ok) { document.getElementById('name').textContent = 'Item not found'; return; }
  const d = await res.json();
  document.title = `${d.item.name} - WarFarmer`;
  document.getElementById('name').textContent = d.item.name;
  const meta = document.getElementById('meta');
  const parts = [d.rarity && `Rarity: ${d.rarity}`, d.maxRank != null && `Max rank: ${d.maxRank}`,
    d.ducats != null && `Ducats: ${d.ducats}`, d.description].filter(Boolean);
  meta.textContent = parts.join(' | ');
  const link = document.createElement('a');
  link.href = `https://warframe.market/items/${d.item.slug}`;
  link.textContent = ' View on warframe.market';
  meta.appendChild(link);

  const order = (o) => [o.platinum, o.quantity, o.rank ?? '-', `${o.user} (${o.status})`];
  fill('sell', d.sell.slice(0, 20), order);
  fill('buy', d.buy.slice(0, 20), order);
  fill('hist', d.buckets.slice().reverse(), (b) =>
    [b.t.replace('T', ' ').slice(0, 16), b.rank ?? '-', b.volume, b.avg, b.min, b.max]);
})();
