import { useEffect, useState } from 'react';
import { memoryRepository } from '../lib/memoryRepository';

export function useLocalDreamCoverUrl(mediaId?: string | null, fallbackSrc?: string) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setObjectUrl(null);

    if (!mediaId) return () => {
      cancelled = true;
    };

    void memoryRepository.getMemoryMediaUrl(mediaId)
      .then((url) => {
        if (!cancelled) setObjectUrl(url);
        else memoryRepository.releaseMemoryMediaUrl(mediaId);
      })
      .catch((error) => {
        console.error('[local-dream-cover] failed to load IndexedDB dream cover', {
          mediaId,
          'error.name': error instanceof Error ? error.name : 'UnknownError',
          'error.message': error instanceof Error ? error.message : String(error)
        });
      });

    return () => {
      cancelled = true;
      memoryRepository.releaseMemoryMediaUrl(mediaId);
    };
  }, [mediaId]);

  return objectUrl ?? fallbackSrc;
}

export function LocalDreamCover({
  mediaId,
  fallbackSrc,
  alt,
  className
}: {
  mediaId?: string | null;
  fallbackSrc: string;
  alt: string;
  className?: string;
}) {
  const src = useLocalDreamCoverUrl(mediaId, fallbackSrc) ?? fallbackSrc;
  return <img className={className} src={src} alt={alt} />;
}
