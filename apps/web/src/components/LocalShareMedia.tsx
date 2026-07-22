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

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

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
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [isLightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
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
          setErrorMessage('找不到媒體檔案，可能尚未上傳完成或舊資料只存在原裝置。');
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
          setErrorMessage(`媒體載入失敗：${getErrorMessage(error)}`);
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
    setLoadState('error');
    setErrorMessage('媒體網址已過期或檔案無法讀取，請重新載入。');
    shareRepository.releaseMediaUrl(mediaId);
  };

  if (loadState === 'loading') return <MediaStatus className={className} text="媒體載入中..." />;
  if (loadState === 'missing') return <MediaStatus className={className} text={errorMessage} />;
  if (loadState === 'error') return <MediaStatus className={className} text={errorMessage || '媒體載入失敗'} onRetry={retry} />;
  if (!objectUrl) return <MediaStatus className={className} text="沒有可播放的媒體網址" />;

  if (mediaType === 'photo') {
    return (
      <>
        <button type="button" className={`local-share-photo-button ${className ?? ''}`.trim()} onClick={() => setLightboxOpen(true)}>
          <img src={objectUrl} alt={alt} onError={handleElementError} />
        </button>
        {isLightboxOpen ? (
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
