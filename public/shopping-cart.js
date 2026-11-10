(function () {
  const KEY = 'warfarm_shopping_cart';
  const IMG = 'https://warframe.market/static/assets/';

  function detailPrice(detail) {
    const buckets = (detail.buckets || []).filter((b) => Date.parse(b.t) >= Date.now() - 24 * 3600 * 1000);
    const ranks = buckets.map((b) => b.rank).filter((rank) => rank != null);
    const baseRank = detail.item.tags?.includes('arcane_enhancement') && ranks.length ? Math.min(...ranks) : 0;
    const selected = ranks.length ? buckets.filter((b) => b.rank === baseRank) : buckets;
    const volume = selected.reduce((sum, b) => sum + b.volume, 0);
    return volume ? selected.reduce((sum, b) => sum + b.avg * b.volume, 0) / volume : null;
  }

  function validItem(item) {
    return item && typeof item.slug === 'string' && item.slug.length > 0
      && typeof item.name === 'string' && item.name.length > 0
      && (item.price === null || (Number.isFinite(item.price) && item.price >= 0))
      && (item.wikiUrl === null || typeof item.wikiUrl === 'string')
      && Number.isSafeInteger(item.quantity) && item.quantity > 0
      && typeof item.include === 'boolean'
      && (item.obtained === undefined || typeof item.obtained === 'boolean')
      && (item.icon === undefined || item.icon === null || typeof item.icon === 'string')
      && (item.thumb === undefined || item.thumb === null || typeof item.thumb === 'string');
  }

  function totals(items) {
    return items.reduce((result, item) => {
      if (item.include && !item.obtained) {
        if (item.price === null) result.missing += item.quantity;
        else result.total += Math.ceil(item.price) * item.quantity;
      }
      return result;
    }, { total: 0, missing: 0 });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detailPrice, validItem, totals };
  }
  if (typeof document === 'undefined') return;

  const root = document.createElement('aside');
  root.className = 'shopping-cart';
  root.setAttribute('aria-label', 'Shopping cart');
  root.innerHTML = `
    <button class="cart-toggle" type="button" aria-expanded="false" aria-controls="cart-panel">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
      Shopping cart <span class="cart-count">0</span><span class="cart-chevron" aria-hidden="true">▲</span>
    </button>
    <div class="cart-drawer" id="cart-panel" inert>
      <div class="cart-drawer-inner">
        <p class="cart-notice" role="status" hidden></p>
        <p class="cart-empty">Your cart is empty.</p>
        <div class="cart-scroll"><table class="cart-table">
          <thead><tr><th>Obtained</th><th>Item</th><th class="num">Price (p)</th><th>Include</th><th><span class="visually-hidden">Remove</span></th></tr></thead>
          <tbody></tbody>
        </table></div>
        <div class="cart-footer"><strong class="cart-total"></strong><button class="cart-clear" type="button">Clear cart</button></div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const toggle = root.querySelector('.cart-toggle');
  const drawer = root.querySelector('.cart-drawer');
  const body = root.querySelector('tbody');
  const notice = root.querySelector('.cart-notice');
  const preview = element('img', null, 'icon-popup cart-icon-popup');
  preview.alt = '';
  preview.hidden = true;
  document.body.appendChild(preview);
  let previewX = 0;
  let previewY = 0;
  function placePreview(x, y) {
    previewX = x;
    previewY = y;
    preview.style.left = `${Math.min(x + 30, Math.max(0, window.innerWidth - preview.offsetWidth))}px`;
    preview.style.top = `${Math.min(Math.max(0, y - preview.offsetHeight / 2), Math.max(0, window.innerHeight - preview.offsetHeight))}px`;
  }
  preview.addEventListener('load', () => placePreview(previewX, previewY));
  preview.addEventListener('error', () => {
    if (preview.dataset.fallback && preview.src !== preview.dataset.fallback) preview.src = preview.dataset.fallback;
    else preview.hidden = true;
  });
  let items = [];
  let expanded = false;
  let storage = null;
  let storageKind = '';
  let storageMessage = '';
  let actionMessage = '';

  function warn(message) {
    actionMessage = message;
    notice.textContent = [storageMessage, actionMessage].filter(Boolean).join(' ');
    notice.hidden = !notice.textContent;
  }

  function selectStorage() {
    for (const kind of ['localStorage', 'sessionStorage']) {
      try {
        const candidate = window[kind];
        const probe = `${KEY}_probe`;
        candidate.setItem(probe, '1');
        candidate.removeItem(probe);
        storage = candidate;
        storageKind = kind;
        if (kind === 'sessionStorage') storageMessage = 'Cart storage is limited to this browser tab because local storage is unavailable.';
        return;
      } catch (error) {
        console.error(`Shopping cart: ${kind} unavailable`, error);
      }
    }
    storageMessage = 'Cart storage is unavailable; changes will be lost on refresh.';
  }

  function load() {
    if (!storage) return;
    try {
      const saved = storage.getItem(KEY);
      if (!saved) return;
      const state = JSON.parse(saved);
      if (!state || !Array.isArray(state.items) || !state.items.every(validItem)
        || typeof state.expanded !== 'boolean'
        || new Set(state.items.map((item) => item.slug)).size !== state.items.length) {
        throw new Error('Invalid cart data');
      }
      items = state.items;
      expanded = state.expanded;
    } catch (error) {
      console.error('Shopping cart: could not read saved cart', error);
      storageMessage = 'Could not read the saved cart. Changes will replace the invalid saved data.';
    }
  }

  function save() {
    if (!storage) return;
    try {
      storage.setItem(KEY, JSON.stringify({ items, expanded }));
    } catch (error) {
      console.error('Shopping cart: could not save cart', error);
      storageMessage = 'Could not save the cart; changes may be lost on refresh.';
    }
    warn(actionMessage);
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function render() {
    preview.hidden = true;
    root.classList.toggle('is-open', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    drawer.inert = !expanded;
    root.querySelector('.cart-chevron').textContent = expanded ? '▼' : '▲';
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    root.querySelector('.cart-count').textContent = count;
    toggle.title = `${count} item${count === 1 ? '' : 's'} in cart`;
    root.querySelector('.cart-empty').hidden = items.length > 0;
    root.querySelector('.cart-scroll').hidden = items.length === 0;
    root.querySelector('.cart-clear').disabled = items.length === 0;
    body.replaceChildren();
    for (const item of items) {
      const row = element('tr');
      row.classList.toggle('cart-obtained', !!item.obtained);
      const obtainedCell = element('td');
      const obtained = element('input');
      obtained.type = 'checkbox';
      obtained.checked = !!item.obtained;
      obtained.setAttribute('aria-label', `Mark ${item.name} as obtained`);
      obtained.addEventListener('change', () => {
        item.obtained = obtained.checked;
        save();
        render();
        body.rows[items.indexOf(item)].querySelector('input').focus();
      });
      obtainedCell.appendChild(obtained);
      row.appendChild(obtainedCell);
      const includeCell = element('td');
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.include;
      checkbox.setAttribute('aria-label', `Include ${item.name} in total`);
      checkbox.addEventListener('change', () => {
        item.include = checkbox.checked;
        save();
        render();
        body.rows[items.indexOf(item)].querySelectorAll('input')[1].focus();
      });
      includeCell.appendChild(checkbox);
      const nameCell = element('td');
      const nameText = `${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ''}`;
      if (item.wikiUrl) {
        try {
          const url = new URL(item.wikiUrl);
          if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Unsupported wiki URL');
          const nameLink = element('a', nameText);
          nameLink.href = url.href;
          nameLink.target = '_blank';
          nameLink.rel = 'noopener noreferrer';
          nameCell.appendChild(nameLink);
        } catch (error) {
          console.error('Shopping cart: invalid wiki link', error);
        }
      }
      if (!nameCell.hasChildNodes()) nameCell.textContent = nameText;
      if (item.icon || item.thumb) {
        const showPreview = (x, y) => {
          preview.dataset.fallback = item.thumb ? IMG + item.thumb : '';
          preview.src = IMG + (item.icon || item.thumb);
          preview.hidden = false;
          placePreview(x, y);
        };
        nameCell.addEventListener('mouseenter', (event) => showPreview(event.clientX, event.clientY));
        nameCell.addEventListener('mousemove', (event) => placePreview(event.clientX, event.clientY));
        nameCell.addEventListener('mouseleave', () => { preview.hidden = true; });
        nameCell.addEventListener('focusin', () => {
          const rect = nameCell.getBoundingClientRect();
          showPreview(rect.right, rect.top + rect.height / 2);
        });
        nameCell.addEventListener('focusout', () => { preview.hidden = true; });
      }
      row.appendChild(nameCell);
      const priceCell = element('td', null, 'num');
      const marketLink = element('a', item.price === null ? '—' : `${Math.ceil(item.price)} p`);
      marketLink.href = `https://warframe.market/items/${encodeURIComponent(item.slug)}`;
      marketLink.target = '_blank';
      marketLink.rel = 'noopener noreferrer';
      marketLink.title = item.price === null ? 'Price unavailable; view on warframe.market' : 'View on warframe.market';
      priceCell.appendChild(marketLink);
      row.appendChild(priceCell);
      row.appendChild(includeCell);
      const removeCell = element('td');
      const remove = element('button', null, 'cart-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${item.name} from cart`);
      remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6"></path></svg>';
      remove.addEventListener('click', () => {
        items = items.filter((entry) => entry.slug !== item.slug);
        save();
        render();
        toggle.focus();
      });
      removeCell.appendChild(remove);
      row.appendChild(removeCell);
      body.appendChild(row);
    }
    const result = totals(items);
    root.querySelector('.cart-total').textContent = `Total: ${result.total} p${result.missing ? ` (excluding ${result.missing} unpriced)` : ''}`;
    warn(actionMessage);
  }

  toggle.addEventListener('click', () => {
    expanded = !expanded;
    save();
    render();
  });
  root.querySelector('.cart-clear').addEventListener('click', () => {
    if (!window.confirm('Clear all items from the cart?')) return;
    items = [];
    actionMessage = '';
    save();
    render();
    toggle.focus();
  });
  window.addEventListener('storage', (event) => {
    if (storageKind !== 'localStorage' || (event.key !== KEY && event.key !== null)) return;
    items = [];
    expanded = false;
    load();
    render();
    hydrateImages();
  });

  async function hydrateImages() {
    if (!items.some((item) => item.icon === undefined && item.thumb === undefined)) return;
    try {
      const base = window.WARFARMER_DATA;
      const response = await fetch(base ? `${base}/items.json` : '/api/items');
      if (!response.ok) throw new Error(`Item list request failed (${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('Invalid item list response');
      const bySlug = new Map(data.items.map((item) => [item.slug, item]));
      let updated = false;
      for (const item of items) {
        if (item.icon !== undefined || item.thumb !== undefined) continue;
        const match = bySlug.get(item.slug);
        if (!match) continue;
        item.icon = match.icon || null;
        item.thumb = match.thumb || null;
        updated = true;
      }
      if (updated) {
        save();
        render();
      }
    } catch (error) {
      console.error('Shopping cart: could not load item images', error);
      warn('Could not load previews for saved cart items.');
    }
  }

  async function fetchDetail(slug) {
    const base = window.WARFARMER_DATA;
    const response = await fetch(base ? `${base}/details.json` : `/api/item/${encodeURIComponent(slug)}`);
    if (!response.ok) throw new Error(`Item details request failed (${response.status})`);
    const data = await response.json();
    const detail = base ? data[slug] : data;
    if (!detail || !detail.item) throw new Error('Item details not found');
    return detail;
  }

  async function add(item, detail) {
    if (!item || typeof item.slug !== 'string' || typeof item.name !== 'string') {
      throw new Error('Cannot add an item without a name and market slug');
    }
    let detailError = false;
    if (!detail) {
      try {
        detail = await fetchDetail(item.slug);
      } catch (error) {
        console.error('Shopping cart: could not load item details', error);
        detailError = true;
      }
    }
    const rawPrice = item.avg === undefined && detail ? detailPrice(detail) : item.avg;
    const price = Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : null;
    const icon = item.icon || detail?.item.icon || null;
    const thumb = item.thumb || detail?.item.thumb || null;
    const existing = items.find((entry) => entry.slug === item.slug);
    if (existing) {
      existing.quantity++;
      existing.price = price;
      if (icon || thumb) { existing.icon = icon; existing.thumb = thumb; }
      if (detail) existing.wikiUrl = detail.wikiLink || null;
    } else {
      items.push({ slug: item.slug, name: item.name, price, wikiUrl: detail?.wikiLink || null, icon, thumb, quantity: 1, include: true, obtained: false });
    }
    expanded = true;
    actionMessage = detailError ? `Could not load wiki link for ${item.name}.` : '';
    save();
    render();
  }

  selectStorage();
  load();
  render();
  hydrateImages();
  window.shoppingCart = { add };
}());
