const assert = require('node:assert/strict');
const test = require('node:test');
const { refreshWikiLinks, addWikiLinks } = require('../scripts/wiki-links');
const app = require('../server');

test('fetches missing links and exports them in static item details', async () => {
  const requests = [];
  const links = await refreshWikiLinks([{ slug: 'anasa' }, { slug: 'no-link' }], {}, async (path) => {
    requests.push(path);
    return { data: { i18n: { en: path.endsWith('anasa') ? { wikiLink: 'https://wiki.warframe.com/w/Ayatan_Treasures' } : {} } } };
  });
  assert.deepEqual(requests, ['/v2/item/anasa', '/v2/item/no-link']);
  const details = addWikiLinks({ anasa: { item: { slug: 'anasa' } }, 'no-link': {}, missing: {} }, links);
  assert.equal(details.anasa.wikiLink, 'https://wiki.warframe.com/w/Ayatan_Treasures');
  assert.equal(details['no-link'].wikiLink, null);
  assert.equal(details.missing.wikiLink, null);
  assert.equal(typeof links['no-link'].fetchedAt, 'number');
});

test('reuses fresh links, refreshes expired links and retains failed lookups for retry', async () => {
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const now = Date.now();
    const existing = {
      fresh: { wikiLink: null, fetchedAt: now },
      stale: { wikiLink: 'https://wiki.warframe.com/w/Old', fetchedAt: 1 },
    };
    const requests = [];
    const links = await refreshWikiLinks(
      ['fresh', 'stale', 'missing', 'invalid'].map((slug) => ({ slug })), existing,
      async (path) => {
        requests.push(path);
        if (path.endsWith('stale')) throw new Error('network error');
        if (path.endsWith('invalid')) return null;
        return { data: { i18n: { en: { wikiLink: 'https://wiki.warframe.com/w/New' } } } };
      },
    );
    assert.deepEqual(requests, ['/v2/item/stale', '/v2/item/missing', '/v2/item/invalid']);
    assert.deepEqual(links.fresh, existing.fresh);
    assert.deepEqual(links.stale, existing.stale);
    assert.equal(links.missing.wikiLink, 'https://wiki.warframe.com/w/New');
    assert.equal(links.invalid, undefined);
    assert.ok(errors.some((message) => message.includes('stale') && message.includes('network error')));
    assert.ok(errors.some((message) => message.includes('invalid') && message.includes('invalid item details response')));
  } finally {
    console.error = originalError;
  }
});

test('item rows expose cached wiki links and freshly published links', () => {
  const bucket = { t: new Date().toISOString(), volume: 1, avg: 10, rank: null };
  app.useCache({
    items: [{ slug: 'first', name: 'First' }, { slug: 'missing', name: 'Missing' }],
    stats: { first: { buckets: [bucket] }, missing: { buckets: [bucket] } },
    drops: {},
    wikiLinks: { first: { wikiLink: 'https://wiki.warframe.com/w/Old', fetchedAt: 1 } },
  });
  assert.equal(app.itemRows().find((item) => item.slug === 'first').wikiLink, 'https://wiki.warframe.com/w/Old');
  assert.equal(app.itemRows().find((item) => item.slug === 'missing').wikiLink, null);
  assert.equal(app.getCache().wikiLinks.first.wikiLink, 'https://wiki.warframe.com/w/Old');
  const refreshed = { first: { wikiLink: 'https://wiki.warframe.com/w/New', fetchedAt: 2 } };
  assert.equal(app.itemRows(refreshed).find((item) => item.slug === 'first').wikiLink, 'https://wiki.warframe.com/w/New');
});

test('seeding merges cached wiki links by freshness and retains local-only links', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.CACHE_SEED_URL;
  process.env.CACHE_SEED_URL = 'https://example.test/cache.json';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      items: [], stats: {}, drops: {},
      wikiLinks: {
        first: { wikiLink: 'https://wiki.warframe.com/w/Remote', fetchedAt: 5 },
        remote: { wikiLink: null, fetchedAt: 5 },
      },
    }),
  });
  try {
    const merged = await app.seedCache({
      items: [], stats: {}, drops: {},
      wikiLinks: {
        first: { wikiLink: 'https://wiki.warframe.com/w/Local', fetchedAt: 6 },
        local: { wikiLink: null, fetchedAt: 1 },
      },
    });
    assert.equal(merged.wikiLinks.first.wikiLink, 'https://wiki.warframe.com/w/Local');
    assert.equal(merged.wikiLinks.local.wikiLink, null);
    assert.equal(merged.wikiLinks.remote.wikiLink, null);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.CACHE_SEED_URL;
    else process.env.CACHE_SEED_URL = originalUrl;
  }
});
