/**
 * FOX One embeds an expiring signed token in the first path segment before /live/.
 * Use a token-free URL as cache identity, while retaining the full signed URL for requests.
 */
export const getFoxOneChunklistCacheKey = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/^\/ZXhwPTE[^/]*(?=\/live\/)/, '');
    for (const key of [...parsed.searchParams.keys()]) {
      if (/(^|[-_])(token|exp|expires|sig|signature|mac|auth|policy|keypair|hdnea|credential|accesskey|security-token)([-_]|$)/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split('?')[0];
  }
};
