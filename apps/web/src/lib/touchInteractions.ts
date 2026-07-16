const INTERACTIVE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  '[role="button"]:not([aria-disabled="true"])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])'
].join(',');

const ACTIVE_OVERLAY_SELECTOR = [
  '.local-form-backdrop',
  '.settings-modal-backdrop',
  '.piggy-product-sheet-backdrop',
  '.piggy-arrange-backdrop',
  '.v2-mail-modal',
  '.ph-mobile-overlay.is-open',
  '.ph-mobile-drawer.is-open'
].join(',');

let installed = false;

export function installMobileTouchInteractions() {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;

  restoreDocumentInteractionState();

  let touchStart: { x: number; y: number; target: EventTarget | null } | null = null;

  document.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length !== 1) {
        touchStart = null;
        return;
      }
      const touch = event.touches[0];
      touchStart = {
        x: touch.clientX,
        y: touch.clientY,
        target: event.target
      };
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    'touchend',
    (event) => {
      if (!touchStart || event.changedTouches.length !== 1 || event.defaultPrevented) {
        touchStart = null;
        return;
      }

      const touch = event.changedTouches[0];
      const distance = Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y);
      const startedElement = touchStart.target instanceof Element ? touchStart.target : null;
      const endedElement = document.elementFromPoint(touch.clientX, touch.clientY);
      touchStart = null;

      if (distance > 12 || !startedElement || !endedElement) return;

      const interactive = endedElement.closest(INTERACTIVE_SELECTOR);
      if (!interactive || !startedElement.closest(INTERACTIVE_SELECTOR)) return;
      if (interactive !== startedElement.closest(INTERACTIVE_SELECTOR)) return;
      if (interactive instanceof HTMLInputElement || interactive instanceof HTMLTextAreaElement || interactive instanceof HTMLSelectElement) return;

      event.preventDefault();
      interactive.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: touch.clientX,
          clientY: touch.clientY
        })
      );
    },
    { capture: true, passive: false }
  );

  window.addEventListener('pageshow', restoreDocumentInteractionState);
  window.addEventListener('focus', restoreDocumentInteractionState);
}

export function restoreDocumentInteractionState() {
  if (typeof document === 'undefined') return;
  const hasActiveOverlay = Boolean(document.querySelector(ACTIVE_OVERLAY_SELECTOR));
  if (!hasActiveOverlay) document.body.classList.remove('modal-open');

  [document.documentElement, document.body, document.getElementById('root')]
    .filter(Boolean)
    .forEach((element) => {
      const htmlElement = element as HTMLElement;
      if (htmlElement.style.pointerEvents === 'none') htmlElement.style.pointerEvents = '';
      if (htmlElement.style.touchAction === 'none') htmlElement.style.touchAction = '';
    });
}
