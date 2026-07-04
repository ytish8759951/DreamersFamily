type DebugListener = () => void;

const CSS_DIAGNOSTIC_PROPERTIES = [
  'pointer-events',
  'touch-action',
  'overflow',
  'overflow-x',
  'overflow-y',
  'position',
  'display',
  'height',
  'min-height',
  'max-height'
] as const;

type CssDiagnosticProperty = (typeof CSS_DIAGNOSTIC_PROPERTIES)[number];

export type CssDiagnosticSource = Record<CssDiagnosticProperty, string>;

export interface CssDiagnostics {
  bodyStyle: CssDiagnosticSource;
  documentElementStyle: CssDiagnosticSource;
  bodyComputedStyle: CssDiagnosticSource;
  documentElementComputedStyle: CssDiagnosticSource;
  bodyClassName: string;
  documentElementClassName: string;
}

export interface RuntimeDebugState {
  reactMounted: boolean;
  windowError: string;
  promiseError: string;
  bodyClickCount: number;
  reactClickCount: number;
  route: string;
  userAgent: string;
  readyState: DocumentReadyState | string;
  cssDiagnostics: CssDiagnostics;
}

const listeners = new Set<DebugListener>();

const state: RuntimeDebugState = {
  reactMounted: false,
  windowError: '',
  promiseError: '',
  bodyClickCount: 0,
  reactClickCount: 0,
  route: '/parent',
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  readyState: typeof document !== 'undefined' ? document.readyState : 'loading',
  cssDiagnostics: getCssDiagnostics()
};

function readStyleProperties(style: CSSStyleDeclaration | null | undefined): CssDiagnosticSource {
  return CSS_DIAGNOSTIC_PROPERTIES.reduce((properties, property) => {
    properties[property] = style?.getPropertyValue(property) || '';
    return properties;
  }, {} as CssDiagnosticSource);
}

function getCssDiagnostics(): CssDiagnostics {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return {
      bodyStyle: readStyleProperties(null),
      documentElementStyle: readStyleProperties(null),
      bodyComputedStyle: readStyleProperties(null),
      documentElementComputedStyle: readStyleProperties(null),
      bodyClassName: '',
      documentElementClassName: ''
    };
  }

  const body = document.body;
  const documentElement = document.documentElement;

  return {
    bodyStyle: readStyleProperties(body?.style),
    documentElementStyle: readStyleProperties(documentElement?.style),
    bodyComputedStyle: body ? readStyleProperties(window.getComputedStyle(body)) : readStyleProperties(null),
    documentElementComputedStyle: documentElement
      ? readStyleProperties(window.getComputedStyle(documentElement))
      : readStyleProperties(null),
    bodyClassName: body?.className || '',
    documentElementClassName: documentElement?.className || ''
  };
}

function refreshRuntimeSnapshot() {
  state.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : state.userAgent;
  state.readyState = typeof document !== 'undefined' ? document.readyState : state.readyState;
  state.cssDiagnostics = getCssDiagnostics();
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeRuntimeDebug(listener: DebugListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRuntimeDebugState() {
  refreshRuntimeSnapshot();
  return { ...state };
}

export function markReactMounted() {
  state.reactMounted = true;
  refreshRuntimeSnapshot();
  notify();
}

export function recordWindowError(message: string) {
  state.windowError = message;
  notify();
}

export function recordPromiseError(message: string) {
  state.promiseError = message;
  notify();
}

export function recordBodyClick() {
  state.bodyClickCount += 1;
  notify();
}

export function recordReactClick() {
  state.reactClickCount += 1;
  notify();
}

export function setRuntimeDebugRoute(route: string) {
  state.route = route;
  refreshRuntimeSnapshot();
  notify();
}
