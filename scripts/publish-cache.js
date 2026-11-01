// Crawls warframe.market incrementally and publishes JSON to S3 behind CloudFront.
// Env: CACHE_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, AWS_REGION plus standard AWS credentials.
const os = require('os');
const path = require('path');
const zlib = require('zlib');

process.env.CACHE_FILE = process.env.CACHE_FILE || path.join(os.tmpdir(), 'warfarmer-cache.json');

const { GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
const app = require('../server');

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
    return { items: cache.items || [], stats: cache.stats || {}, drops: cache.drops || {} };
  } catch (error) {
    if (error.name === 'NoSuchKey') return { items: [], stats: {}, drops: {} };
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
  app.useCache(await readExisting());
  await app.refreshDrops();
  await app.crawl();

  const cache = app.getCache();
  if (!cache.items.length) throw new Error('crawl produced no items; not publishing');
  const rows = app.itemRows();
  const updatedAt = new Date().toISOString();

  await put('cache.json', cache);
  await put('items.json', { updatedAt, totalItems: cache.items.length, items: rows });
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
        Paths: { Quantity: 3, Items: ['/cache.json', '/items.json', '/missions.json'] },
      },
    }));
    console.log('invalidated CloudFront paths');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
