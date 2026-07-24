import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type DrawingTool = 'brush' | 'highlighter' | 'spray' | 'eraser' | 'stamp';

export type DrawingSubmitPayload = {
  blob: Blob;
  title: string;
  caption: string;
  width: number;
  height: number;
  clientRequestId: string;
};

type ChildDrawingBoardProps = {
  childId: string;
  onBack: () => void;
  onSubmit: (payload: DrawingSubmitPayload) => Promise<void>;
};

const CANVAS_RATIO = 4 / 3;
const EXPORT_WIDTH = 2048;
const EXPORT_HEIGHT = 1536;
const DRAFT_PREFIX = 'little-dreamers-family:drawing-draft:v1:';
const HISTORY_LIMIT = 30;

const colors = [
  { label: '黑色', value: '#111111' },
  { label: '白色', value: '#ffffff' },
  { label: '紅色', value: '#e53935' },
  { label: '橘色', value: '#fb8c00' },
  { label: '黃色', value: '#fdd835' },
  { label: '綠色', value: '#43a047' },
  { label: '藍色', value: '#1e88e5' },
  { label: '紫色', value: '#8e24aa' },
  { label: '粉紅色', value: '#ec407a' },
  { label: '咖啡色', value: '#795548' }
];

const backgrounds = [
  { label: '白色', value: '#ffffff' },
  { label: '奶油色', value: '#fff7df' },
  { label: '淡粉色', value: '#ffe4ef' },
  { label: '淡藍色', value: '#e2f2ff' },
  { label: '淡綠色', value: '#e5f7e8' },
  { label: '淡黃色', value: '#fff7c7' }
];

const stamps = [
  { label: '星星', value: '⭐' },
  { label: '愛心', value: '❤️' },
  { label: '花朵', value: '🌸' },
  { label: '彩虹', value: '🌈' },
  { label: '太陽', value: '☀️' },
  { label: '月亮', value: '🌙' },
  { label: '兔子', value: '🐰' },
  { label: '小熊', value: '🐻' },
  { label: '笑臉', value: '😊' },
  { label: '讚', value: '👍' }
];

const toolLabels: Record<DrawingTool, string> = {
  brush: '一般畫筆',
  highlighter: '螢光筆',
  spray: '噴漆',
  eraser: '橡皮擦',
  stamp: '印章'
};

function createDrawingRequestId(childId: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `drawing-share:${childId}:${crypto.randomUUID()}`;
  }
  return `drawing-share:${childId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function ChildDrawingBoard({ childId, onBack, onSubmit }: ChildDrawingBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const draftTimerRef = useRef<number | null>(null);
  const previewUrlRef = useRef('');
  const submitRequestIdRef = useRef(createDrawingRequestId(childId));
  const draftKey = `${DRAFT_PREFIX}${childId}`;

  const [tool, setTool] = useState<DrawingTool>('brush');
  const [color, setColor] = useState('#111111');
  const [size, setSize] = useState(14);
  const [opacity, setOpacity] = useState(1);
  const [stamp, setStamp] = useState(stamps[0].value);
  const [stampSize, setStampSize] = useState(72);
  const [background, setBackground] = useState(backgrounds[0].value);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const canUndo = undoStackRef.current.length > 1;
  const canRedo = redoStackRef.current.length > 0;
  const selectedToolLabel = useMemo(() => toolLabels[tool], [tool]);

  const getContext = useCallback(() => {
    const canvas = canvasRef.current;
    return canvas?.getContext('2d') ?? null;
  }, []);

  const capture = useCallback(() => {
    const canvas = canvasRef.current;
    return canvas ? canvas.toDataURL('image/png') : '';
  }, []);

  const pushHistory = useCallback(() => {
    const data = capture();
    if (!data) return;
    const last = undoStackRef.current[undoStackRef.current.length - 1];
    if (last === data) return;
    undoStackRef.current.push(data);
    if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();
    redoStackRef.current = [];
    setHistoryVersion((value) => value + 1);
  }, [capture]);

  const scheduleDraftSave = useCallback(() => {
    if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      const dataUrl = capture();
      if (!dataUrl) return;
      localStorage.setItem(draftKey, JSON.stringify({
        title,
        caption,
        background,
        dataUrl,
        savedAt: new Date().toISOString()
      }));
    }, 650);
  }, [background, caption, capture, draftKey, title]);

  const restore = useCallback((dataUrl: string, options: { push?: boolean; save?: boolean } = {}) => {
    const image = new window.Image();
    const canvas = canvasRef.current;
    const context = getContext();
    if (!canvas || !context) return;
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (options.push) pushHistory();
      setHistoryVersion((value) => value + 1);
      if (options.save) scheduleDraftSave();
    };
    image.src = dataUrl;
  }, [getContext, pushHistory, scheduleDraftSave]);

  const resizeCanvas = useCallback((preserve = true) => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const before = preserve ? capture() : '';
    const cssWidth = Math.max(280, Math.floor(wrap.clientWidth));
    const cssHeight = Math.round(cssWidth / CANVAS_RATIO);
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    if (before) restore(before);
    else {
      const context = getContext();
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);
      pushHistory();
    }
  }, [capture, getContext, pushHistory, restore]);

  useEffect(() => {
    resizeCanvas(false);
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as { title?: string; caption?: string; background?: string; dataUrl?: string };
        setTitle(parsed.title ?? '');
        setCaption(parsed.caption ?? '');
        setBackground(parsed.background ?? backgrounds[0].value);
        if (parsed.dataUrl) window.setTimeout(() => restore(parsed.dataUrl!, { push: true }), 60);
      } catch {
        localStorage.removeItem(draftKey);
      }
    }
    const observer = new ResizeObserver(() => resizeCanvas(true));
    const handleOrientation = () => resizeCanvas(true);
    if (wrapRef.current) observer.observe(wrapRef.current);
    window.addEventListener('orientationchange', handleOrientation);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', handleOrientation);
      if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [draftKey, resizeCanvas, restore]);

  useEffect(() => {
    scheduleDraftSave();
  }, [background, title, caption, scheduleDraftSave]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  };

  const canvasScale = () => {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    return canvas.width / canvas.getBoundingClientRect().width;
  };

  const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const context = getContext();
    if (!context) return;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = size * canvasScale();
    if (tool === 'eraser') {
      context.globalCompositeOperation = 'destination-out';
      context.strokeStyle = 'rgba(0,0,0,1)';
      context.globalAlpha = 1;
    } else {
      context.globalCompositeOperation = 'source-over';
      context.strokeStyle = color;
      context.globalAlpha = tool === 'highlighter' ? Math.min(opacity, 0.38) : opacity;
    }
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  };

  const sprayAt = (point: { x: number; y: number }) => {
    const context = getContext();
    if (!context) return;
    const scale = canvasScale();
    const radius = Math.max(4, size * scale);
    const dots = Math.max(12, Math.round(size * 2));
    context.save();
    context.fillStyle = color;
    context.globalAlpha = opacity;
    for (let index = 0; index < dots; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;
      context.beginPath();
      context.arc(point.x + Math.cos(angle) * distance, point.y + Math.sin(angle) * distance, Math.max(1, scale), 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  };

  const stampAt = (point: { x: number; y: number }) => {
    const context = getContext();
    if (!context) return;
    const scale = canvasScale();
    context.save();
    context.globalAlpha = opacity;
    context.font = `${stampSize * scale}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(stamp, point.x, point.y);
    context.restore();
    pushHistory();
    scheduleDraftSave();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== null) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    if (tool === 'stamp') {
      stampAt(point);
      pointerIdRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released.
      }
      return;
    }
    drawingRef.current = true;
    lastPointRef.current = point;
    if (tool === 'spray') sprayAt(point);
    else drawLine(point, point);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || pointerIdRef.current !== event.pointerId) return;
    const point = pointFromEvent(event);
    const previous = lastPointRef.current;
    if (!point || !previous) return;
    event.preventDefault();
    if (tool === 'spray') sprayAt(point);
    else drawLine(previous, point);
    lastPointRef.current = point;
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released after cancellation.
    }
    pointerIdRef.current = null;
    if (drawingRef.current) {
      drawingRef.current = false;
      lastPointRef.current = null;
      pushHistory();
      scheduleDraftSave();
    }
  };

  const undo = () => {
    if (undoStackRef.current.length <= 1) return;
    const current = undoStackRef.current.pop();
    if (current) redoStackRef.current.push(current);
    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    if (previous) restore(previous, { save: true });
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(next);
    restore(next, { save: true });
  };

  const clearAll = () => {
    if (!window.confirm('確定要清除整張畫作嗎？')) return;
    const canvas = canvasRef.current;
    const context = getContext();
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    pushHistory();
    scheduleDraftSave();
  };

  const exportBlob = async () => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('畫布尚未準備好。');
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = EXPORT_WIDTH;
    exportCanvas.height = EXPORT_HEIGHT;
    const context = exportCanvas.getContext('2d');
    if (!context) throw new Error('無法建立輸出畫布。');
    context.fillStyle = background;
    context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
    context.drawImage(canvas, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
    const blob = await new Promise<Blob | null>((resolve) => exportCanvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.size <= 0) throw new Error('作品輸出失敗。');
    return blob;
  };

  const preview = async () => {
    setError('');
    try {
      const blob = await exportBlob();
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        const next = URL.createObjectURL(blob);
        previewUrlRef.current = next;
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '預覽失敗。');
    }
  };

  const closePreview = () => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      previewUrlRef.current = '';
      return '';
    });
  };

  const submit = async () => {
    if (isSubmitting) return;
    setSubmitting(true);
    setStatus('畫作上傳中，請勿關閉頁面');
    setError('');
    try {
      const blob = await exportBlob();
      await onSubmit({
        blob,
        title,
        caption,
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
        clientRequestId: submitRequestIdRef.current
      });
      localStorage.removeItem(draftKey);
      setStatus('畫作已送出');
      submitRequestIdRef.current = createDrawingRequestId(childId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '畫作上傳失敗，請重新上傳。');
      setStatus('');
      setSubmitting(false);
    }
  };

  return (
    <section className="child-drawing-board" aria-label="畫板分享">
      <header className="child-drawing-header">
        <button type="button" onClick={onBack} disabled={isSubmitting}>返回分享頁</button>
        <div>
          <small>畫板分享</small>
          <h2>自由畫畫、蓋印章並分享作品</h2>
        </div>
        <button type="button" className="ds-primary-button" onClick={submit} disabled={isSubmitting}>
          {isSubmitting ? '上傳中' : '送出分享'}
        </button>
      </header>

      <div className="child-drawing-layout">
        <aside className="child-drawing-tools">
          <div className="child-drawing-tool-group" role="toolbar" aria-label="畫筆工具">
            {(Object.keys(toolLabels) as DrawingTool[]).map((value) => (
              <button key={value} type="button" className={tool === value ? 'is-selected' : ''} onClick={() => setTool(value)}>
                {toolLabels[value]}
              </button>
            ))}
          </div>
          <div className="child-drawing-swatches" aria-label="畫筆顏色">
            {colors.map((item) => (
              <button
                key={item.value}
                type="button"
                className={color === item.value ? 'is-selected' : ''}
                style={{ background: item.value }}
                aria-label={item.label}
                onClick={() => setColor(item.value)}
              />
            ))}
          </div>
          <label>筆畫粗細 <input type="range" min="3" max="54" value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
          <label>透明度 <input type="range" min="0.15" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
          <label>印章大小 <input type="range" min="32" max="140" value={stampSize} onChange={(event) => setStampSize(Number(event.target.value))} /></label>
          <div className="child-drawing-stamps" aria-label="印章">
            {stamps.map((item) => (
              <button
                key={item.label}
                type="button"
                className={stamp === item.value && tool === 'stamp' ? 'is-selected' : ''}
                onClick={() => {
                  setTool('stamp');
                  setStamp(item.value);
                }}
                aria-label={item.label}
              >
                {item.value}
              </button>
            ))}
          </div>
          <div className="child-drawing-backgrounds" aria-label="畫布底色">
            {backgrounds.map((item) => (
              <button
                key={item.value}
                type="button"
                className={background === item.value ? 'is-selected' : ''}
                style={{ background: item.value }}
                onClick={() => {
                  setBackground(item.value);
                  scheduleDraftSave();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="child-drawing-actions">
            <button type="button" onClick={undo} disabled={!canUndo}>復原</button>
            <button type="button" onClick={redo} disabled={!canRedo}>重做</button>
            <button type="button" onClick={clearAll}>清除全部</button>
            <button type="button" onClick={preview}>預覽作品</button>
          </div>
        </aside>
        <main className="child-drawing-workspace">
          <div className="child-drawing-canvas-wrap" ref={wrapRef} style={{ background }}>
            <canvas
              ref={canvasRef}
              aria-label={`畫布，目前工具：${selectedToolLabel}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
            />
          </div>
          <div className="child-drawing-fields">
            <label>標題<input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="例如：今天的畫作" /></label>
            <label>想說的話<textarea value={caption} maxLength={200} rows={3} onChange={(event) => setCaption(event.target.value)} placeholder="寫下這張畫想分享的心情" /></label>
          </div>
          {status ? <p className="local-form-hint">{status}</p> : null}
          {error ? <p className="local-form-error">{error}<button type="button" onClick={submit} disabled={isSubmitting}>重新上傳</button></p> : null}
        </main>
      </div>
      {previewUrl ? (
        <div className="child-drawing-preview" role="dialog" aria-modal="true" onClick={closePreview}>
          <button type="button" onClick={closePreview} aria-label="關閉預覽">x</button>
          <img src={previewUrl} alt="畫作預覽" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">{historyVersion}</span>
    </section>
  );
}
