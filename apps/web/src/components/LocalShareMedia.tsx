import { useEffect, useRef, useState } from 'react';
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
  lightbox?: boolean;
  onPhotoClick?: () => void;
};

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

export function LocalShareMedia({
  mediaId,
  mediaType,
  className,
  alt = '',
  controls = true,
  muted,
  autoPlay,
  lightbox = true,
  onPhotoClick
}: LocalShareMediaProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [isLightboxOpen, setLightboxOpen] = useState(false);
  const elementRetryRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    elementRetryRef.current = 0;
    setObjectUrl(null);
    setLoadState('loading');
    setErrorMessage('');

    void shareRepository.getMediaUrl(mediaId)
      .then((url) => {
        if (cancelled) {
          shareRepository.releaseMediaUrl(mediaId);
          return;
        }
        if (!url) {
          setLoadState('missing');
          setErrorMessage('找不到這個分享媒體，請重新整理後再試。');
          return;
        }
        setObjectUrl(url);
        setLoadState('ready');
      })
      .catch((error) => {
        const diagnostics = getErrorDiagnostics(error);
        console.error('[local-share-media] failed to load share media', {
          mediaId,
          mediaType,
          'error.name': diagnostics.name ?? diagnostics.type,
          'error.message': getErrorMessage(error),
          error: diagnostics
        });
        if (!cancelled) {
          setLoadState('error');
          setErrorMessage(`${mediaType === 'photo' ? '照片' : '媒體'}載入失敗：${getErrorMessage(error)}`);
        }
      });

    return () => {
      cancelled = true;
      shareRepository.releaseMediaUrl(mediaId);
    };
  }, [mediaId, mediaType, reloadKey]);

  const retry = () => {
    shareRepository.releaseMediaUrl(mediaId);
    setReloadKey((value) => value + 1);
  };

  const handleElementError = () => {
    if (loadState !== 'ready') return;
    if (elementRetryRef.current < 1) {
      elementRetryRef.current += 1;
      shareRepository.releaseMediaUrl(mediaId);
      setObjectUrl(null);
      setLoadState('loading');
      setReloadKey((value) => value + 1);
      return;
    }
    setLoadState('error');
    setErrorMessage(`${mediaType === 'photo' ? '照片' : '媒體'}網址已過期或無法讀取，請重新載入。`);
    shareRepository.releaseMediaUrl(mediaId);
  };

  if (loadState === 'loading') return <MediaStatus className={className} text={mediaType === 'photo' ? '照片載入中' : '媒體載入中'} />;
  if (loadState === 'missing') return <MediaStatus className={className} text={errorMessage} />;
  if (loadState === 'error') return <MediaStatus className={className} text={errorMessage || '照片載入失敗'} onRetry={retry} />;
  if (!objectUrl) return <MediaStatus className={className} text="媒體網址尚未就緒" />;

  if (mediaType === 'photo') {
    const image = <img src={objectUrl} alt={alt} onError={handleElementError} />;
    if (!lightbox && !onPhotoClick) {
      return <span className={`local-share-photo-frame ${className ?? ''}`.trim()}>{image}</span>;
    }
    return (
      <>
        <button type="button" className={`local-share-photo-button ${className ?? ''}`.trim()} onClick={onPhotoClick ?? (() => setLightboxOpen(true))}>
          {image}
        </button>
        {lightbox && isLightboxOpen ? (
          <div className="local-share-lightbox" role="dialog" aria-modal="true" onClick={() => setLightboxOpen(false)}>
            <button type="button" aria-label="關閉照片" onClick={() => setLightboxOpen(false)}>x</button>
            <img src={objectUrl} alt={alt || '分享照片'} />
          </div>
        ) : null}
      </>
    );
  }

  if (mediaType === 'audio') {
    return <audio className={className} src={objectUrl} controls={controls} onError={handleElementError} preload="metadata" />;
  }

  return (
    <video
      className={className}
      src={objectUrl}
      controls={controls}
      muted={muted}
      autoPlay={autoPlay}
      playsInline
      preload="metadata"
      onError={handleElementError}
    />
  );
}

function MediaStatus({ className, text, onRetry }: { className?: string; text: string; onRetry?: () => void }) {
  return (
    <span className={`local-share-media-status ${className ?? ''}`.trim()}>
      <span>{text}</span>
      {onRetry ? <button type="button" onClick={onRetry}>重新載入</button> : null}
    </span>
  );
}
