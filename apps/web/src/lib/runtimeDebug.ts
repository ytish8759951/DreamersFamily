type DebugListener = () => void;

export interface RuntimeDebugState {
  reactMounted: boolean;
  windowError: string;
  promiseError: string;
  bodyClickCount: number;
  reactClickCount: number;
  route: string;
  userAgent: string;
  readyState: DocumentReadyState | string;
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
  readyState: typeof document !== 'undefined' ? document.readyState : 'loading'
};

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
  return { ...state };
}

export function markReactMounted() {
  state.reactMounted = true;
  state.readyState = typeof document !== 'undefined' ? document.readyState : state.readyState;
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
  state.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : state.userAgent;
  state.readyState = typeof document !== 'undefined' ? document.readyState : state.readyState;
  notify();
}
