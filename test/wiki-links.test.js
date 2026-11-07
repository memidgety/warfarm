const assert = require('node:assert/strict');
const test = require('node:test');
const { refreshWikiLinks, addWikiLinks } = require('../scripts/wiki-links');

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
