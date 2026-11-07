const WIKI_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

async function refreshWikiLinks(items, existing, fetchItem) {
  const links = { ...existing };
  const now = Date.now();
  const pending = items.filter(({ slug }) => !links[slug] || !Number.isFinite(links[slug].fetchedAt)
    || now - links[slug].fetchedAt >= WIKI_REFRESH_MS);
  console.log(`refreshing wiki links for ${pending.length} items`);
  let failures = 0;
  for (const [index, { slug }] of pending.entries()) {
    try {
      const response = await fetchItem(`/v2/item/${encodeURIComponent(slug)}`);
      const english = response?.data?.i18n?.en;
      if (!english || (english.wikiLink != null && typeof english.wikiLink !== 'string')) {
        throw new Error('invalid item details response');
      }
      links[slug] = { wikiLink: english.wikiLink || null, fetchedAt: Date.now() };
    } catch (error) {
      failures++;
      console.error(`wiki link refresh failed for ${slug}: ${error.message}`);
    }
    if ((index + 1) % 100 === 0) console.log(`wiki links: ${index + 1}/${pending.length}`);
  }
  if (failures) console.error(`wiki link refresh: ${failures} failed; they will be retried on the next publish`);
  return links;
}

function addWikiLinks(details, links) {
  for (const [slug, detail] of Object.entries(details)) {
    detail.wikiLink = links[slug]?.wikiLink ?? null;
  }
  return details;
}

module.exports = { refreshWikiLinks, addWikiLinks };
