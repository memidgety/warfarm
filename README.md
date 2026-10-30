# WarFarmer

Warframe mission farming assistant. WarFarmer is a Node.js web app that serves
its pages and JSON API from one process. It fetches market and drop-table data
from Warframe Market and the Warframe drop tables.

## Run locally

Requires Node.js 18 or newer.

```sh
npm start
```

Open `http://localhost:3000`.

## Deploy with GitHub and Render

1. Push this project to a GitHub repository.
2. In Render, choose **New + > Blueprint**, connect the GitHub repository, and
   select the branch to deploy. Render reads `render.yaml` and creates the web
   service. The service automatically redeploys when that branch changes.
3. Open the Render service URL when its first deploy is ready.

The free Render service uses ephemeral storage and may spin down when idle. Its
cache can be lost when the service restarts, after which it refreshes data
again. For a persistent cache, attach a Render persistent disk mounted at
`/var/data` and set the service environment variable `CACHE_FILE` to
`/var/data/cache.json`. Persistent disks require a paid Render service.
