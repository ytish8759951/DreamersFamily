import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  type CssDiagnosticSource,
  getRuntimeDebugState,
  recordBodyClick,
  recordReactClick,
  subscribeRuntimeDebug,
  setRuntimeDebugRoute
} from '../../lib/runtimeDebug';

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

const BLOCKING_CSS_VALUES = new Set(['pointer-events:none', 'touch-action:none', 'overflow:hidden', 'position:fixed']);

export function ParentLayout() {
  const location = useLocation();
  const [debug, setDebug] = useState(getRuntimeDebugState());

  useEffect(() => {
    setRuntimeDebugRoute(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const unsubscribe = subscribeRuntimeDebug(() => setDebug(getRuntimeDebugState()));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const body = document.body;
    if (!body) return;

    const onBodyClick = () => {
      recordBodyClick();
    };

    body.addEventListener('click', onBodyClick, { capture: true });
    return () => {
      body.removeEventListener('click', onBodyClick, { capture: true });
    };
  }, []);

  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <h1 style={titleStyle}>React Runtime Debug</h1>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            recordReactClick();
            console.log('React Click');
            window.alert('React Click');
          }}
        >
          React Click
        </button>
        <div style={gridStyle}>
          <Field label="React Mounted" value={debug.reactMounted ? 'Yes' : 'No'} />
          <Field label="Window Error" value={debug.windowError || 'None'} />
          <Field label="Promise Error" value={debug.promiseError || 'None'} />
          <Field label="Body Click" value={String(debug.bodyClickCount)} />
          <Field label="React Click" value={String(debug.reactClickCount)} />
          <Field label="Current Route" value={debug.route || location.pathname} />
          <Field label="User Agent" value={debug.userAgent || navigator.userAgent} />
          <Field label="document.readyState" value={debug.readyState} />
          <Field label="document.body.className" value={debug.cssDiagnostics.bodyClassName || '(empty)'} />
          <Field
            label="document.documentElement.className"
            value={debug.cssDiagnostics.documentElementClassName || '(empty)'}
          />
          <CssDiagnosticsGroup label="document.body.style" values={debug.cssDiagnostics.bodyStyle} />
          <CssDiagnosticsGroup
            label="document.documentElement.style"
            values={debug.cssDiagnostics.documentElementStyle}
          />
          <CssDiagnosticsGroup
            label="getComputedStyle(document.body)"
            values={debug.cssDiagnostics.bodyComputedStyle}
          />
          <CssDiagnosticsGroup
            label="getComputedStyle(document.documentElement)"
            values={debug.cssDiagnostics.documentElementComputedStyle}
          />
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, critical = false }: { label: string; value: string; critical?: boolean }) {
  return (
    <div style={fieldStyle}>
      <div style={fieldLabelStyle}>{label}</div>
      <div style={critical ? criticalFieldValueStyle : fieldValueStyle}>{value}</div>
    </div>
  );
}

function CssDiagnosticsGroup({ label, values }: { label: string; values: CssDiagnosticSource }) {
  return (
    <>
      <Field label={label} value="selected properties" />
      {CSS_DIAGNOSTIC_PROPERTIES.map((property) => {
        const value = values[property] || '(empty)';
        return (
          <Field
            key={`${label}.${property}`}
            label={`${label}.${property}`}
            value={value}
            critical={isBlockingCssValue(property, value)}
          />
        );
      })}
    </>
  );
}

function isBlockingCssValue(property: string, value: string) {
  return BLOCKING_CSS_VALUES.has(`${property}:${value.replace(/\s+/g, '').toLowerCase()}`);
}

const pageStyle = {
  minHeight: '100vh',
  padding: '16px'
} satisfies React.CSSProperties;

const panelStyle = {
  position: 'fixed',
  right: 8,
  bottom: 8,
  width: 'min(92vw, 420px)',
  maxHeight: '48vh',
  overflow: 'auto',
  zIndex: 2147483647,
  display: 'grid',
  gap: 12,
  border: '2px solid #111',
  borderRadius: 12,
  background: 'rgba(12, 14, 18, 0.96)',
  color: '#fff',
  padding: 12,
  pointerEvents: 'none',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
} satisfies React.CSSProperties;

const titleStyle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 0
} satisfies React.CSSProperties;

const buttonStyle = {
  alignSelf: 'start',
  minHeight: 44,
  padding: '0 14px',
  border: 0,
  borderRadius: 10,
  background: '#1f6feb',
  color: '#fff',
  fontSize: 16,
  fontWeight: 700,
  pointerEvents: 'auto'
} satisfies React.CSSProperties;

const gridStyle = {
  display: 'grid',
  gap: 8
} satisfies React.CSSProperties;

const fieldStyle = {
  display: 'grid',
  gap: 2,
  borderTop: '1px solid rgba(255,255,255,0.12)',
  paddingTop: 8
} satisfies React.CSSProperties;

const fieldLabelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: '#aab4c0'
} satisfies React.CSSProperties;

const fieldValueStyle = {
  fontSize: 13,
  lineHeight: 1.35,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
} satisfies React.CSSProperties;

const criticalFieldValueStyle = {
  ...fieldValueStyle,
  color: '#ff4d4f',
  fontWeight: 900
} satisfies React.CSSProperties;
