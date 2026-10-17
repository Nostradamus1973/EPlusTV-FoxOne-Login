/**
 * FOX One embeds an expiring signed token in the first path segment before /live/.
 * Use a token-free URL as cache identity, while retaining the full signed URL for requests.
 */
export const getFoxOneChunklistCacheKey = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/^\/ZXhwPTE[^/]*(?=\/live\/)/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split('?')[0];
  }
};
