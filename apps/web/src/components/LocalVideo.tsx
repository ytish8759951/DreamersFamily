import { useEffect, useState } from 'react';
import { shareRepository } from '../lib/shareRepository';

type LocalVideoProps = {
  mediaId: string;
  src?: string | null;
  className?: string;
  controls?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
};

export function LocalVideo({ mediaId, src, className, controls = true, muted, autoPlay }: LocalVideoProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(src ?? null);

  useEffect(() => {
    let cancelled = false;
    if (src) {
      setObjectUrl(src);
      return;
    }

    setObjectUrl(null);
    void shareRepository.getMediaUrl(mediaId)
      .then((url) => {
        if (!cancelled) setObjectUrl(url);
        else shareRepository.releaseMediaUrl(mediaId);
      })
      .catch((error) => {
        console.error('[local-video] failed to load IndexedDB video', {
          mediaId,
          'error.name': error instanceof Error ? error.name : 'UnknownError',
          'error.message': error instanceof Error ? error.message : String(error)
        });
      });

    return () => {
      cancelled = true;
      shareRepository.releaseMediaUrl(mediaId);
    };
  }, [mediaId, src]);

  if (!objectUrl) return <span>▶</span>;

  return (
    <video
      className={className}
      src={objectUrl}
      controls={controls}
      muted={muted}
      autoPlay={autoPlay}
      playsInline
    />
  );
}
