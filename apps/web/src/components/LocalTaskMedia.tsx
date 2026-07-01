import { useEffect, useState, type ReactNode } from 'react';
import { taskRepository } from '../lib/taskRepository';

type LocalTaskMediaProps = {
  mediaId?: string | null;
  alt: string;
  fallback: ReactNode;
  className?: string;
};

export function LocalTaskMedia({ mediaId, alt, fallback, className = '' }: LocalTaskMediaProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setObjectUrl(null);

    if (!mediaId) return () => {
      cancelled = true;
    };

    void taskRepository.getTaskMediaUrl(mediaId)
      .then((url) => {
        if (!cancelled) setObjectUrl(url);
        else taskRepository.releaseTaskMediaUrl(mediaId);
      })
      .catch((error) => {
        console.error('[local-task-media] failed to load IndexedDB media', {
          mediaId,
          'error.name': error instanceof Error ? error.name : 'UnknownError',
          'error.message': error instanceof Error ? error.message : String(error)
        });
      });

    return () => {
      cancelled = true;
      taskRepository.releaseTaskMediaUrl(mediaId);
    };
  }, [mediaId]);

  return (
    <span className={`local-task-media ${className}`.trim()}>
      {objectUrl ? <img src={objectUrl} alt={alt} /> : <span className="local-task-media-fallback">{fallback}</span>}
    </span>
  );
}
