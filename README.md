# WarFarmer

Warframe mission farming assistant. WarFarmer is a Node.js web app that serves
its pages and JSON API from one process. It fetches market and drop-table data
from Warframe Market and the Warframe drop tables. Neon Postgres stores the
latest cache, with a private Neon Object Storage snapshot for recovery.

## Run locally

Requires Node.js 20 or newer. After setting up the Neon project, install the
dependencies and start the app:

```sh
npm install
npm run build
npm start
```

The app loads `.env.local` (or `.env`) for Neon credentials. Keep these files
private; they are ignored by Git. Open `http://localhost:3000`.

## Deploy with GitHub and Render

1. Push this project to a GitHub repository.
2. In Render, choose **New + > Blueprint**, connect the GitHub repository, and
   select the branch to deploy. Render reads `render.yaml` and creates the web
   service. The service automatically redeploys when that branch changes.
3. Open the Render service URL when its first deploy is ready.

When creating the Blueprint, enter the five Neon environment variables
(`DATABASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_ENDPOINT_URL_S3`, and `AWS_REGION`) from the Neon project. The Render
service uses the pooled `DATABASE_URL` for runtime queries; do not commit
`.env.local`.

The free Render service uses ephemeral storage and may spin down when idle. Its
local cache file can be lost on restart, but it is rehydrated from Neon Postgres
and Object Storage. The app checks both services at `/api/health`.

## Static data publishing (S3 + CloudFront)

.github/workflows/publish-cache.yml runs scripts/publish-cache.js every 3 hours. It crawls incrementally and uploads cache.json, items.json and missions.json to the private S3 bucket warfarmer-cache. CloudFront serves them at https://d12aw56padv05r.cloudfront.net with CORS enabled. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (the warfarmer-cache-writer IAM user) as GitHub Actions secrets.

