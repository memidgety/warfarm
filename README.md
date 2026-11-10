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

## Shopping cart

Add items from the market list or an item page. The cart is available on every
page; use its bottom-left button to expand or collapse it. Add the same item
again to increase its quantity. Prices are snapshots of the 24-hour average at
the time of adding, rounded up per item; mods use rank 0. Checkboxes control
which items are included in the total, and unpriced items are identified rather
than counted as zero. Click a price to open its market listing, or use the wiki
link when available. Hover over an item name to preview its icon. Mark an item
as obtained to strike it through and exclude it from the total; unmark it to
restore its previous include setting. Remove individual items or clear the cart.

The cart and its expanded state are stored in browser `localStorage`, not the
server cache or an account. They survive refreshes but are local to the browser
and site origin. If local storage is unavailable, the cart falls back to
`sessionStorage` (limited to the current tab) or temporary memory and displays
a warning.

The cart icon is from [Feather Icons](https://feathericons.com/), used under
its [MIT license](public/feather-icons-LICENSE.txt).

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
