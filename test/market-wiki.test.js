const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('market rows use item-list wiki links without hover requests', async () => {
  function node() {
    return {
      children: [], events: {},
      appendChild(child) { this.children.push(child); },
      setAttribute(name, value) { this[name] = value; },
      addEventListener(name, callback) { this.events[name] = callback; },
    };
  }
  const rows = node();
  const search = { value: '', addEventListener() {} };
  const elements = { rows, search, status: {} };
  let resolveRendered;
  const rendered = new Promise((resolve) => { resolveRendered = resolve; });
  rows.appendChild = function (row) { this.children.push(row); if (this.children.length === 32) resolveRendered(); };
  let requests = 0;
  const items = Array.from({ length: 30 }, (_, n) => ({
    slug: `item_${n}`, name: `Item ${n}`, volume: 1, avg: 1,
    wikiLink: `https://wiki.warframe.com/w/Item_${n}`,
  }));
  items.push({ slug: 'missing', name: 'Missing', volume: 1, avg: 1, wikiLink: null });
  items.push({ slug: 'unsafe', name: 'Unsafe', volume: 1, avg: 1, wikiLink: 'javascript:alert(1)' });
  const errors = [];
  const context = vm.createContext({
    window: { WARFARMER_DATA: '', shoppingCart: { createIcon: node } },
    document: {
      getElementById: (id) => elements[id],
      querySelectorAll: () => [],
      createElement(tag) {
        const element = node();
        if (tag === 'tr') {
          const parts = { a: node(), '.wiki-hover': node(), '.add-to-cart': node() };
          element.querySelector = (selector) => parts[selector];
        }
        return element;
      },
    },
    fetch: async () => { requests++; return { json: async () => ({ items, crawling: false }) }; },
    URL,
    console: { error: (...args) => errors.push(args) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.js'), 'utf8'), context);
  await rendered;
  for (const [index, row] of rows.children.slice(0, 30).entries()) {
    if (row.events.mouseenter) row.events.mouseenter();
    if (row.events.focusin) row.events.focusin();
    const link = row.querySelector('.wiki-hover').children[0];
    assert.equal(link.href, `https://wiki.warframe.com/w/Item_${index}`);
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
  assert.equal(rows.children[30].querySelector('.wiki-hover').textContent, 'Wiki unavailable');
  assert.equal(rows.children[31].querySelector('.wiki-hover').textContent, 'Wiki unavailable');
  assert.equal(errors.length, 1);
  assert.equal(requests, 1);
});
