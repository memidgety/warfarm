const assert = require('node:assert/strict');
const test = require('node:test');
const { detailPrice, totals, validItem } = require('../public/shopping-cart');

test('detail price uses the volume-weighted rank zero price from the last 24 hours', () => {
  const recent = new Date().toISOString();
  const old = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  const detail = {
    item: { tags: ['mod'] },
    buckets: [
      { t: recent, rank: 0, avg: 10.1, volume: 1 },
      { t: recent, rank: 0, avg: 20.1, volume: 3 },
      { t: recent, rank: 10, avg: 300, volume: 4 },
      { t: old, rank: 0, avg: 100, volume: 100 },
    ],
  };
  assert.equal(detailPrice(detail), 17.6);
  detail.buckets = [{ t: recent, rank: 10, avg: 300, volume: 4 }];
  assert.equal(detailPrice(detail), null);
});

test('unranked items and lowest-traded-rank arcanes use the existing market convention', () => {
  const t = new Date().toISOString();
  assert.equal(detailPrice({ item: { tags: [] }, buckets: [{ t, rank: null, avg: 5, volume: 2 }] }), 5);
  assert.equal(detailPrice({ item: { tags: ['arcane_enhancement'] }, buckets: [
    { t, rank: 1, avg: 6, volume: 1 },
    { t, rank: 5, avg: 50, volume: 1 },
  ] }), 6);
});

test('total rounds each unit up, respects quantities and checkboxes, and reports missing prices', () => {
  assert.deepEqual(totals([
    { price: 3.1, quantity: 2, include: true },
    { price: 10, quantity: 1, include: false },
    { price: null, quantity: 3, include: true },
    { price: 0, quantity: 1, include: true },
  ]), { total: 8, missing: 3 });
});

test('obtained items are excluded without changing their include state', () => {
  const item = { price: 3.1, quantity: 2, include: true, obtained: true };
  assert.deepEqual(totals([item, { price: null, quantity: 1, include: true, obtained: true }]), { total: 0, missing: 0 });
  item.obtained = false;
  assert.deepEqual(totals([item]), { total: 8, missing: 0 });
  item.include = false;
  assert.deepEqual(totals([item]), { total: 0, missing: 0 });
});

test('saved cart entries must have valid prices, quantities and inclusion state', () => {
  const item = { slug: 'test_item', name: 'Test Item', price: null, wikiUrl: null, quantity: 1, include: true };
  assert.equal(validItem(item), true);
  for (const change of [{ quantity: 0 }, { price: -1 }, { price: '12' }, { include: 1 }, { wikiUrl: 1 }, { obtained: 'true' }, { icon: 2 }, { thumb: 2 }]) {
    assert.equal(validItem({ ...item, ...change }), false);
  }
});
