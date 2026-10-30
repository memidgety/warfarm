const { Pool } = require('pg');
const {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

const CACHE_ID = 'warfarmer';
const BUCKET = 'assets';
const OBJECT_KEY = 'warfarmer/cache.json';
const TABLE = 'warfarmer_cache';

const requiredVariables = [
  'DATABASE_URL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ENDPOINT_URL_S3',
  'AWS_REGION',
];
const missingVariables = requiredVariables.filter((name) => !process.env[name]);
if (missingVariables.length) {
  throw new Error(`Missing required Neon environment variables: ${missingVariables.join(', ')}`);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 10000,
});
const s3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  region: process.env.AWS_REGION,
  forcePathStyle: true,
});

function normalizeCache(cache) {
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) {
    throw new Error('Stored WarFarmer cache is not a JSON object');
  }
  return {
    items: Array.isArray(cache.items) ? cache.items : [],
    stats: cache.stats && typeof cache.stats === 'object' ? cache.stats : {},
    drops: cache.drops && typeof cache.drops === 'object' ? cache.drops : {},
  };
}

async function readObjectCache() {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: OBJECT_KEY }));
    return normalizeCache(JSON.parse(await result.Body.transformToString()));
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

async function writeCache(cache, includeObjectStorage) {
  const serialized = JSON.stringify(cache);
  await pool.query(
    `INSERT INTO ${TABLE} (cache_id, payload, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (cache_id) DO UPDATE
     SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
    [CACHE_ID, serialized],
  );
  if (includeObjectStorage) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: OBJECT_KEY,
      Body: serialized,
      ContentType: 'application/json',
    }));
  }
}

async function initializeCache(fallbackCache) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       cache_id text PRIMARY KEY,
       payload jsonb NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const result = await pool.query(
    `SELECT payload FROM ${TABLE} WHERE cache_id = $1`,
    [CACHE_ID],
  );
  const objectCache = await readObjectCache();
  const cache = normalizeCache(result.rows[0]?.payload || objectCache || fallbackCache);
  await writeCache(cache, true);
  return cache;
}

async function verifyPersistence() {
  await pool.query('SELECT 1');
  await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: OBJECT_KEY }));
}

async function closePersistence() {
  s3.destroy();
  await pool.end();
}

module.exports = { closePersistence, initializeCache, verifyPersistence, writeCache };
