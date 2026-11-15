const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'warfarmer-wiki-test-'));
const cacheFile = path.join(directory, 'cache.json');
process.env.CACHE_FILE = cacheFile;
const app = require('../server');

test('an unseeded empty cache populates wiki links in the background', async () => {
  const originalFetch = global.fetch;
  const originalSeedUrl = process.env.CACHE_SEED_URL;
  process.env.CACHE_SEED_URL = 'off';
  const requests = [];
  global.fetch = async (url) => {
    requests.push(url);
    if (url.endsWith('/v2/items')) return {
      ok: true, json: async () => ({ data: [{
        slug: 'first', i18n: { en: { name: 'First', thumb: 'thumb.png', icon: 'icon.png' } }, tags: [],
      }] }),
    };
    if (url.endsWith('/v2/item/first')) return {
      ok: true, json: async () => ({ data: { i18n: { en: { wikiLink: 'https://wiki.warframe.com/w/First' } } } }),
    };
    if (url.endsWith('/v1/items/first/statistics')) return {
      ok: true, json: async () => ({ payload: { statistics_closed: { '48hours': [{
        datetime: new Date().toISOString(), volume: 1, avg_price: 10,
      }] } } }),
    };
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const cache = await app.seedCache({ items: [], stats: {}, drops: {} });
    app.useCache(cache);
    await app.crawl({ refreshWiki: true });
    await app.refreshWikiCache();
    assert.equal(app.itemRows()[0].wikiLink, 'https://wiki.warframe.com/w/First');
    assert.equal(JSON.parse(fs.readFileSync(cacheFile, 'utf8')).wikiLinks.first.wikiLink, 'https://wiki.warframe.com/w/First');
    assert.equal(requests.filter((url) => url.endsWith('/v2/item/first')).length, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalSeedUrl === undefined) delete process.env.CACHE_SEED_URL;
    else process.env.CACHE_SEED_URL = originalSeedUrl;
    if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);
    fs.rmdirSync(directory);
  }
});

test('concurrent market requests are spaced instead of released together', async () => {
  const originalFetch = global.fetch;
  const started = [];
  global.fetch = async () => {
    started.push(Date.now());
    return { ok: true, json: async () => ({}) };
  };
  try {
    await Promise.all([app.wfm('/test/one'), app.wfm('/test/two'), app.wfm('/test/three')]);
    assert.ok(started[1] - started[0] >= 350);
    assert.ok(started[2] - started[1] >= 350);
  } finally {
    global.fetch = originalFetch;
  }
});
