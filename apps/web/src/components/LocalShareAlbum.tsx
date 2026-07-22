import { useRef, useState } from 'react';
import type { LocalShareMedia } from '../lib/localTypes';
import { LocalShareMedia as LocalShareMediaView } from './LocalShareMedia';

type LocalShareAlbumProps = {
  media: LocalShareMedia[];
  title?: string | null;
  className?: string;
};

export function LocalShareAlbum({ media, title, className }: LocalShareAlbumProps) {
  const photos = media.filter((item) => item.media_type === 'photo').sort((a, b) => a.sort_order - b.sort_order);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const lightboxStripRef = useRef<HTMLDivElement | null>(null);
  if (!photos.length) return null;

  const goTo = (index: number, target: HTMLDivElement | null = stripRef.current) => {
    const safeIndex = Math.max(0, Math.min(photos.length - 1, index));
    setActiveIndex(safeIndex);
    target?.children.item(safeIndex)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };
  const syncActive = (target: HTMLDivElement | null) => {
    if (!target) return;
    const width = target.clientWidth || 1;
    setActiveIndex(Math.max(0, Math.min(photos.length - 1, Math.round(target.scrollLeft / width))));
  };

  return (
    <>
      <section className={`local-share-album ${className ?? ''}`.trim()} aria-label={`照片相簿，共 ${photos.length} 張`}>
        <div className="local-share-album-strip" ref={stripRef} onScroll={() => syncActive(stripRef.current)}>
          {photos.map((photo, index) => (
            <div className="local-share-album-slide" key={photo.id}>
              <LocalShareMediaView
                mediaId={photo.id}
                mediaType="photo"
                alt={`${title ?? '照片分享'} ${index + 1}`}
                lightbox={false}
                onPhotoClick={() => {
                  setActiveIndex(index);
                  setLightboxOpen(true);
                  window.requestAnimationFrame(() => goTo(index, lightboxStripRef.current));
                }}
              />
              <span className="local-share-album-count">{index + 1}／{photos.length}</span>
            </div>
          ))}
        </div>
        {photos.length > 1 ? (
          <>
            <button type="button" className="local-share-album-nav is-prev" onClick={() => goTo(activeIndex - 1)} aria-label="上一張照片">‹</button>
            <button type="button" className="local-share-album-nav is-next" onClick={() => goTo(activeIndex + 1)} aria-label="下一張照片">›</button>
            <div className="local-share-album-dots" aria-hidden="true">
              {photos.map((photo, index) => <i key={photo.id} className={index === activeIndex ? 'is-active' : ''} />)}
            </div>
          </>
        ) : null}
      </section>
      {lightboxOpen ? (
        <div className="local-share-album-lightbox" role="dialog" aria-modal="true" onClick={() => setLightboxOpen(false)}>
          <button type="button" aria-label="關閉照片預覽" onClick={() => setLightboxOpen(false)}>x</button>
          <div className="local-share-album-strip" ref={lightboxStripRef} onClick={(event) => event.stopPropagation()} onScroll={() => syncActive(lightboxStripRef.current)}>
            {photos.map((photo, index) => (
              <div className="local-share-album-slide" key={photo.id}>
                <LocalShareMediaView mediaId={photo.id} mediaType="photo" alt={`${title ?? '照片分享'} ${index + 1}`} lightbox={false} />
                <span className="local-share-album-count">{index + 1}／{photos.length}</span>
              </div>
            ))}
          </div>
          {photos.length > 1 ? (
            <div className="local-share-album-dots" aria-hidden="true">
              {photos.map((photo, index) => <i key={photo.id} className={index === activeIndex ? 'is-active' : ''} />)}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
