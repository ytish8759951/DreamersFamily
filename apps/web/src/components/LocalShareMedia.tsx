import { useEffect, useState } from 'react';
import { getErrorDiagnostics, getErrorMessage } from '../lib/errorDiagnostics';
import { shareRepository } from '../lib/shareRepository';

type LocalShareMediaProps = {
  mediaId: string;
  mediaType: 'photo' | 'audio' | 'video';
  className?: string;
  alt?: string;
  controls?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
};

export function LocalShareMedia({
  mediaId,
  mediaType,
  className,
  alt = '',
  controls = true,
  muted,
  autoPlay
}: LocalShareMediaProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setObjectUrl(null);

    void shareRepository.getMediaUrl(mediaId)
      .then((url) => {
        if (!cancelled) setObjectUrl(url);
        else shareRepository.releaseMediaUrl(mediaId);
      })
      .catch((error) => {
        console.error('[local-share-media] failed to load IndexedDB media', {
          mediaId,
          mediaType,
          'error.name': getErrorDiagnostics(error).name ?? getErrorDiagnostics(error).type,
          'error.message': getErrorMessage(error),
          error: getErrorDiagnostics(error)
        });
      });

    return () => {
      cancelled = true;
      shareRepository.releaseMediaUrl(mediaId);
    };
  }, [mediaId, mediaType]);

  if (!objectUrl) return <span>載入中</span>;

  if (mediaType === 'photo') {
    return <img className={className} src={objectUrl} alt={alt} />;
  }

  if (mediaType === 'audio') {
    return <audio className={className} src={objectUrl} controls={controls} />;
  }

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
