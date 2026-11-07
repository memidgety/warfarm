# WarFarmer

Warframe mission farming assistant. WarFarmer is a Node.js web app that serves
its pages and JSON API from one process. It fetches market and drop-table data
from Warframe Market and the Warframe drop tables and keeps a local JSON cache
(`cache.json`).

## Run locally

Requires Node.js 20 or newer:

```sh
npm install
npm run build
npm start
```

Open `http://localhost:3000`.

## Deploy with GitHub and Render

1. Push this project to a GitHub repository.
2. In Render, choose **New + > Blueprint**, connect the GitHub repository, and
   select the branch to deploy. Render reads `render.yaml` and creates the web
   service. The service automatically redeploys when that branch changes.
3. Open the Render service URL when its first deploy is ready.

The free Render service uses ephemeral storage and may spin down when idle, so
its local cache is lost on restart. When the cache is empty, the server seeds it
from the `CACHE_SEED_URL` environment variable (the published `cache.json`
below) and then resumes crawling. `/api/health` reports the number of cached
items.

## Static data publishing (S3 + CloudFront)

`.github/workflows/publish-cache.yml` runs `scripts/publish-cache.js` every 3
hours. It crawls incrementally and uploads `cache.json`, `items.json`,
`details.json` and `missions.json` to the private S3 bucket `warfarmer-cache`.
CloudFront serves them at https://d12aw56padv05r.cloudfront.net with CORS
enabled. Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (the
`warfarmer-cache-writer` IAM user) as GitHub Actions secrets.

The publisher fetches item wiki links from Warframe Market and includes them
in `details.json`. Links are cached in `cache.json` and refreshed after 30
days; failed lookups are logged and retried on the next publish. The first
publish after enabling this takes longer because it fetches each item once at
the market API's rate limit.

`.github/workflows/pages.yml` publishes `public/` to GitHub Pages, pointing it
at the CloudFront data.
