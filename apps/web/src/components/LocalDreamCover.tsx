import { useEffect, useState } from 'react';
import { getErrorDiagnostics, getErrorMessage } from '../lib/errorDiagnostics';
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
          'error.name': getErrorDiagnostics(error).name ?? getErrorDiagnostics(error).type,
          'error.message': getErrorMessage(error),
          error: getErrorDiagnostics(error)
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
