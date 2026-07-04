import { useEffect, useRef, useState } from 'react';

type HitElement = {
  index: number;
  tag: string;
  className: string;
  id: string;
  pointerEvents: string;
  zIndex: string;
  position: string;
  opacity: string;
  visibility: string;
  display: string;
  touchAction: string;
  transform: string;
  width: number;
  height: number;
};

export function ParentLayout() {
  const [stack, setStack] = useState<HitElement[]>([]);
  const highlightedElement = useRef<HTMLElement | null>(null);
  const previousOutline = useRef('');

  useEffect(() => {
    const clearHighlight = () => {
      if (!highlightedElement.current) return;
      highlightedElement.current.style.outline = previousOutline.current;
      highlightedElement.current = null;
      previousOutline.current = '';
    };

    const inspect = (clientX: number, clientY: number, source: string) => {
      const elements = document.elementsFromPoint(clientX, clientY) as HTMLElement[];
      const nextStack = elements.map((element, index) => {
        const styles = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          index,
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          id: element.id,
          pointerEvents: styles.pointerEvents,
          zIndex: styles.zIndex,
          position: styles.position,
          opacity: styles.opacity,
          visibility: styles.visibility,
          display: styles.display,
          touchAction: styles.touchAction,
          transform: styles.transform,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      });

      clearHighlight();
      const top = elements[0];
      if (top) {
        highlightedElement.current = top;
        previousOutline.current = top.style.outline;
        top.style.outline = '5px solid red';
      }

      setStack(nextStack);
      console.log('[dom-hit-test]', { source, x: clientX, y: clientY, stack: nextStack, elements });
      console.table(nextStack);
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (!touch) return;
      inspect(touch.clientX, touch.clientY, 'touchstart');
    };

    const onClick = (event: MouseEvent) => {
      inspect(event.clientX, event.clientY, 'click');
    };

    window.setTimeout(() => inspect(window.innerWidth / 2, window.innerHeight / 2, 'initial-center'), 250);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('click', onClick, { capture: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('click', onClick, { capture: true });
      clearHighlight();
    };
  }, []);

  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <p style={eyebrowStyle}>/parent Safari touch diagnostic</p>
        <h1 style={titleStyle}>Parent tap test</h1>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            console.log('React Click');
            window.alert('React Click');
          }}
        >
          測試按鈕 alert("clicked")
        </button>
        <p style={bodyStyle}>
          這是暫時的最小 /parent 頁面。原本的 header、drawer、bottom tab、overlay、modal、transition 元件都沒有 render。
          如果這個按鈕可以點、頁面可以滑，代表原本 /parent 元件樹中有元素擋住。若這頁仍不能點，代表全域 CSS 或 App shell 擋住。
        </p>
      </section>

      <section style={contentStyle}>
        {Array.from({ length: 36 }, (_, index) => (
          <article key={index} style={rowStyle}>
            <strong>Scroll test row {index + 1}</strong>
            <span>上下滑動測試內容。點任意位置會在左下角列出 document.elementsFromPoint stack。</span>
          </article>
        ))}
      </section>

      <aside style={debugStyle} aria-live="polite">
        <strong>DOM hit-test stack</strong>
        {stack.length ? (
          stack.slice(0, 12).map((item) => (
            <pre key={`${item.index}-${item.tag}-${item.className}-${item.id}`} style={preStyle}>
{`${item.index}. ${item.tag}${item.id ? `#${item.id}` : ''}${item.className ? `.${item.className}` : ''}
pointer-events: ${item.pointerEvents}
z-index: ${item.zIndex}
position: ${item.position}
opacity: ${item.opacity}
visibility: ${item.visibility}
display: ${item.display}
touch-action: ${item.touchAction}
transform: ${item.transform}
size: ${item.width}x${item.height}`}
            </pre>
          ))
        ) : (
          <span>Tap anywhere to inspect DOM stack.</span>
        )}
      </aside>
    </main>
  );
}

const pageStyle = {
  minHeight: '220vh',
  padding: '24px 16px 180px',
  background: '#fff9f0',
  color: '#222',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
} satisfies React.CSSProperties;

const panelStyle = {
  display: 'grid',
  gap: 14,
  border: '2px solid #222',
  borderRadius: 12,
  background: '#fff',
  padding: 18
} satisfies React.CSSProperties;

const eyebrowStyle = {
  margin: 0,
  color: '#666',
  fontSize: 13,
  fontWeight: 700
} satisfies React.CSSProperties;

const titleStyle = {
  margin: 0,
  fontSize: 28
} satisfies React.CSSProperties;

const buttonStyle = {
  minHeight: 56,
  border: '0',
  borderRadius: 10,
  background: '#1677ff',
  color: '#fff',
  fontSize: 18,
  fontWeight: 800
} satisfies React.CSSProperties;

const bodyStyle = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.6
} satisfies React.CSSProperties;

const contentStyle = {
  display: 'grid',
  gap: 12,
  marginTop: 18
} satisfies React.CSSProperties;

const rowStyle = {
  display: 'grid',
  gap: 6,
  border: '1px solid #ddd',
  borderRadius: 10,
  background: '#fff',
  padding: 16
} satisfies React.CSSProperties;

const debugStyle = {
  position: 'fixed',
  zIndex: 2147483647,
  left: 8,
  bottom: 8,
  display: 'grid',
  gap: 6,
  width: 'min(92vw, 420px)',
  maxHeight: '46vh',
  overflow: 'auto',
  border: '2px solid #ff3333',
  borderRadius: 10,
  background: 'rgba(0,0,0,.86)',
  padding: 10,
  color: '#fff',
  fontSize: 11,
  pointerEvents: 'none'
} satisfies React.CSSProperties;

const preStyle = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  borderTop: '1px solid rgba(255,255,255,.2)',
  paddingTop: 6,
  font: '11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
} satisfies React.CSSProperties;
