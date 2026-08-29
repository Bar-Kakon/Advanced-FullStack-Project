import { useEffect, useState } from 'react';

import { api } from '../../api/client';

/**
 * Turns an asset path this API guards into something an `<img>` can show.
 *
 * The route answers only to a Bearer token, and an `<img src>` cannot carry one, so the bytes are
 * fetched through the same client every other call uses and handed to the browser as an object URL.
 * The URL is revoked when it is replaced or the screen leaves, so nothing is held after use.
 */
export const useAuthedImage = (path: string | null): string | null => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (path === null) {
      setObjectUrl(null);
      return;
    }

    let revoked: string | null = null;
    const controller = new AbortController();

    void (async () => {
      try {
        const { data } = await api.get<Blob>(path.replace(/^\/api/, ''), {
          responseType: 'blob',
          signal: controller.signal,
        });
        revoked = URL.createObjectURL(data);
        setObjectUrl(revoked);
      } catch {
        setObjectUrl(null);
      }
    })();

    return () => {
      controller.abort();
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [path]);

  return objectUrl;
};
