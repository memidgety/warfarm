// Crawls warframe.market incrementally and publishes JSON to S3 behind CloudFront.
// Env: CACHE_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, AWS_REGION plus standard AWS credentials.
const os = require('os');
const path = require('path');
const zlib = require('zlib');

process.env.CACHE_FILE = process.env.CACHE_FILE || path.join(os.tmpdir(), 'warfarmer-cache.json');

const { GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
const app = require('../server');
const { refreshWikiLinks, addWikiLinks } = require('./wiki-links');

const bucket = process.env.CACHE_BUCKET;
const distribution = process.env.CLOUDFRONT_DISTRIBUTION_ID;
if (!bucket) throw new Error('CACHE_BUCKET is required');

const region = process.env.AWS_REGION || 'us-east-1';
const s3 = new S3Client({ region });

async function readExisting() {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: 'cache.json' }));
    const body = Buffer.from(await res.Body.transformToByteArray());
    const text = res.ContentEncoding === 'gzip' ? zlib.gunzipSync(body).toString() : body.toString();
    const cache = JSON.parse(text);
    return { items: cache.items || [], stats: cache.stats || {}, drops: cache.drops || {}, wikiLinks: cache.wikiLinks || {} };
  } catch (error) {
    if (error.name === 'NoSuchKey') return { items: [], stats: {}, drops: {}, wikiLinks: {} };
    throw error;
  }
}

async function put(key, value) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: zlib.gzipSync(JSON.stringify(value)),
    ContentType: 'application/json',
    ContentEncoding: 'gzip',
    CacheControl: 'public, max-age=300',
  }));
  console.log('uploaded', key);
}

async function main() {
  const existing = await readExisting();
  app.useCache(existing);
  // Manual workflow runs always re-fetch the drop tables instead of reusing the 24h cache.
  await app.refreshDrops(process.env.FORCE_DROPS_REFRESH === 'true');
  await app.crawl();

  const cache = app.getCache();
  if (!cache.items.length) throw new Error('crawl produced no items; not publishing');
  const wikiLinks = await refreshWikiLinks(cache.items, existing.wikiLinks, app.wfm);
  const rows = app.itemRows();
  const updatedAt = new Date().toISOString();

  await put('cache.json', { ...cache, wikiLinks });
  await put('items.json', { updatedAt, totalItems: cache.items.length, items: rows });
  await put('details.json', addWikiLinks(app.itemDetails(), wikiLinks));
  await put('missions.json', {
    updatedAt,
    missions: app.missionPayouts(),
    types: app.missionTypeTable(),
    dropsFetchedAt: cache.drops.fetchedAt || null,
  });

  if (distribution) {
    await new CloudFrontClient({ region: 'us-east-1' }).send(new CreateInvalidationCommand({
      DistributionId: distribution,
      InvalidationBatch: {
        CallerReference: String(Date.now()),
        Paths: { Quantity: 4, Items: ['/cache.json', '/items.json', '/details.json', '/missions.json'] },
      },
    }));
    console.log('invalidated CloudFront paths');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
