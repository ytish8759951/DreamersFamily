import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  debugChildBinding,
  decodeChildTokenForDebug,
  getDeviceDebugInfo,
  getRepositoryDebugInfo,
  getRouteDebugInfo
} from '../../lib/childBindingDebug';
import { deviceBindingRepository } from '../../lib/deviceBindingRepository';
import {
  getErrorDiagnostics,
  getErrorMessage as getReadableErrorMessage,
  getErrorStack,
  serializeError
} from '../../lib/errorDiagnostics';
import {
  CHILD_BINDING_TRACE_EVENT,
  childBindingTrace,
  hashForTrace,
  type ChildBindingTraceEntry
} from '../../lib/childBindingTrace';

const childRoutes = new Set([
  'home',
  'tasks',
  'share',
  'dreams',
  'mailbox',
  'honor-wall',
  'special-days',
  'screen-time',
  'growth'
]);

type TokenEntryStage =
  | 'Token parsing'
  | 'Token parsed'
  | 'Device diagnostics'
  | 'Device binding'
  | 'Child resolved'
  | 'Session saved'
  | 'Navigating to child home'
  | 'Error';

type TokenEntryDiagnostics = {
  stage: TokenEntryStage;
  childId: string | null;
  familyId: string | null;
  errorMessage: string | null;
  stack: string | null;
  details: Record<string, unknown>;
};

const orderedStages: TokenEntryStage[] = [
  'Token parsing',
  'Token parsed',
  'Device diagnostics',
  'Device binding',
  'Child resolved',
  'Session saved',
  'Navigating to child home',
  'Error'
];

const initialDiagnostics: TokenEntryDiagnostics = {
  stage: 'Token parsing',
  childId: null,
  familyId: null,
  errorMessage: null,
  stack: null,
  details: {}
};

async function traceAsyncStep<T>(step: string, run: () => Promise<T>): Promise<T> {
  console.log('[child-token-runtime] await start', { step, stack: new Error(`${step} start`).stack });
  const timeout = window.setTimeout(() => {
    console.error('[child-token-runtime] await still pending', {
      step,
      message: `${step} has not completed after 10000ms`,
      stack: new Error(`${step} pending`).stack
    });
  }, 10000);
  try {
    const result = await run();
    console.log('[child-token-runtime] await resolved', { step, result });
    return result;
  } catch (error) {
    const diagnostics = getErrorDiagnostics(error);
    console.error('[child-token-runtime] await rejected', {
      step,
      message: getErrorMessage(error),
      stack: diagnostics.stack ?? new Error(`${step} rejected`).stack ?? null,
      error,
      diagnostics: serializeError(error)
    });
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function getErrorMessage(error: unknown) {
  const message = getReadableErrorMessage(error);
  if (message.includes('QR_EXPIRED') || message.includes('QR 已過期')) return 'QR 已過期';
  if (message.includes('QR_USED') || message.includes('QR 已使用')) return 'QR 已使用';
  if (message.includes('CHILD_NOT_FOUND') || message.includes('找不到孩子')) return '找不到孩子';
  if (message.includes('FAMILY_VERIFICATION_FAILED') || message.includes('家庭驗證失敗')) return '家庭驗證失敗';
  if (message.includes('binding') || message.includes('Binding') || message.includes('device')) return '裝置綁定失敗';
  return message;
}

function getStageStatus(currentStage: TokenEntryStage, stage: TokenEntryStage) {
  if (currentStage === stage) return 'current';
  if (currentStage === 'Error') return stage === 'Error' ? 'current' : 'see details';

  const currentIndex = orderedStages.indexOf(currentStage);
  const stageIndex = orderedStages.indexOf(stage);
  if (currentIndex > stageIndex) return 'checked';
  return 'pending';
}

function DiagnosticsPanel({
  diagnostics,
  traceEntries
}: {
  diagnostics: TokenEntryDiagnostics;
  traceEntries: ChildBindingTraceEntry[];
}) {
  return (
    <div style={{ width: '100%', textAlign: 'left' }}>
      <div style={{ display: 'grid', gap: 6, marginTop: 16 }}>
        {orderedStages.map((stage) => (
          <div
            key={stage}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 13
            }}
          >
            <span>{stage}</span>
            <strong>{getStageStatus(diagnostics.stage, stage)}</strong>
          </div>
        ))}
      </div>
      <pre
        style={{
          marginTop: 16,
          maxHeight: 260,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 11,
          lineHeight: 1.5
        }}
      >
        {JSON.stringify(diagnostics, null, 2)}
      </pre>
      <div style={{ marginTop: 16 }}>
        <strong>Child Binding Trace</strong>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {traceEntries.length ? traceEntries.map((entry) => (
            <div
              key={entry.id}
              style={{
                border: entry.label === 'SECOND CALL DETECTED' ? '2px solid #b91c1c' : '1px solid rgba(255,255,255,0.18)',
                borderRadius: 6,
                padding: 8,
                background: entry.label === 'SECOND CALL DETECTED' ? 'rgba(185,28,28,0.16)' : 'rgba(255,255,255,0.06)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                <strong>{entry.label}</strong>
                <span>{entry.timestamp}</span>
              </div>
              <pre
                style={{
                  margin: '6px 0 0',
                  maxHeight: 180,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 11,
                  lineHeight: 1.45
                }}
              >
                {JSON.stringify(entry.payload, null, 2)}
              </pre>
            </div>
          )) : (
            <div style={{ fontSize: 12, opacity: 0.8 }}>No child binding trace yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChildTokenEntry() {
  const location = useLocation();
  const token = decodeURIComponent(location.pathname.replace('/child/', ''));
  const navigate = useNavigate();
  const [invalid, setInvalid] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [diagnostics, setDiagnostics] = useState<TokenEntryDiagnostics>(initialDiagnostics);
  const [traceEntries, setTraceEntries] = useState<ChildBindingTraceEntry[]>([]);
  const bindingPromiseRef = useRef<{
    token: string;
    promise: Promise<Awaited<ReturnType<typeof deviceBindingRepository.bindChildDeviceByToken>>>;
  } | null>(null);
  const reservedChildRoute = childRoutes.has(token);
  const childHomeTarget = '/child/home';

  useEffect(() => {
    console.log('ChildTokenEntry mounted', {
      pathname: location.pathname,
      token,
      href: typeof window !== 'undefined' ? window.location.href : null
    });
  }, [location.pathname, token]);

  useEffect(() => {
    const handleTrace = (event: Event) => {
      const entry = (event as CustomEvent<ChildBindingTraceEntry>).detail;
      if (!entry) return;
      setTraceEntries((current) => [...current, entry].slice(-80));
    };
    window.addEventListener(CHILD_BINDING_TRACE_EVENT, handleTrace as EventListener);
    return () => window.removeEventListener(CHILD_BINDING_TRACE_EVENT, handleTrace as EventListener);
  }, []);

  useEffect(() => {
    if (reservedChildRoute) return;

    setTraceEntries([]);
    let cancelled = false;

    const updateDiagnostics = (next: Partial<TokenEntryDiagnostics>) => {
      if (cancelled) return;
      setDiagnostics((current) => ({
        ...current,
        ...next,
        details: {
          ...current.details,
          ...next.details
        }
      }));
    };

    const fail = (error: unknown, details: Record<string, unknown> = {}) => {
      updateDiagnostics({
        stage: 'Error',
        errorMessage: getErrorMessage(error),
        stack: getErrorStack(error) ?? new Error('childTokenEntryInitialization failed').stack ?? null,
        details: {
          ...details,
          error: serializeError(error)
        }
      });
      if (!cancelled) setInvalid(true);
    };

    if (!token) {
      fail(new Error('Child token is empty'), {
        pathname: location.pathname,
        href: typeof window !== 'undefined' ? window.location.href : null
      });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const tokenHash = hashForTrace(token);
      let decodedChildId: string | null = null;
      try {
        updateDiagnostics({
          stage: 'Token parsing',
          errorMessage: null,
          stack: null,
          details: {
            token,
            route: getRouteDebugInfo(location.pathname)
          }
        });
        debugChildBinding('A.url', getRouteDebugInfo(location.pathname));

        const tokenDebug = decodeChildTokenForDebug(token);
        decodedChildId = tokenDebug.decoded?.childId ?? null;
        childBindingTrace('========== Scan Start ==========', {
          tokenHash,
          childId: decodedChildId,
          pathname: location.pathname,
          href: typeof window !== 'undefined' ? window.location.href : null
        });
        childBindingTrace('Token Hash', { tokenHash });
        childBindingTrace('Child Id', { childId: decodedChildId });
        debugChildBinding('B.token', tokenDebug);
        updateDiagnostics({
          stage: 'Token parsed',
          childId: tokenDebug.decoded?.childId ?? null,
          familyId: tokenDebug.familyId,
          details: { tokenDebug }
        });

        updateDiagnostics({ stage: 'Device diagnostics' });
        const deviceDebug = await traceAsyncStep('getDeviceDebugInfo', getDeviceDebugInfo);
        debugChildBinding('C.device', deviceDebug);
        updateDiagnostics({ details: { deviceDebug } });

        updateDiagnostics({
          stage: 'Device binding',
          details: {
            repository: {
              ...getRepositoryDebugInfo(),
              method: 'bindChildDeviceByToken',
              requestPayload: { childToken: token }
            }
          }
        });
        debugChildBinding('D.repository', {
          ...getRepositoryDebugInfo(),
          method: 'bindChildDeviceByToken',
          requestPayload: { childToken: token }
        });
        console.log('[child-token-entry] received child URL token', { childToken: token });

        childBindingTrace('Call bindChildDeviceByToken()', {
          tokenHash,
          childId: decodedChildId
        });
        const child = await traceAsyncStep('deviceBindingRepository.bindChildDeviceByToken', () => {
          if (!bindingPromiseRef.current || bindingPromiseRef.current.token !== token) {
            bindingPromiseRef.current = {
              token,
              promise: Promise.resolve(deviceBindingRepository.bindChildDeviceByToken(token))
            };
          }
          return bindingPromiseRef.current.promise;
        });
        if (!child?.id) {
          throw new Error('bindChildDeviceByToken returned no child id');
        }
        if (!child.family_id) {
          throw new Error('bindChildDeviceByToken returned no family_id');
        }
        childBindingTrace('Result', {
          tokenHash,
          childId: child.id,
          familyId: child.family_id,
          success: true
        });

        updateDiagnostics({
          stage: 'Child resolved',
          childId: child.id,
          familyId: child.family_id,
          details: {
            bindChildDeviceByTokenResponse: {
              childId: child.id,
              familyId: child.family_id,
              childToken: child.child_token ?? null
            }
          }
        });
        debugChildBinding('D.repository.response', {
          method: 'bindChildDeviceByToken',
          success: true,
          receivedPayload: {
            childId: child.id,
            familyId: child.family_id,
            childToken: child.child_token
          }
        });
        console.log('[child-token-entry] bindChildDeviceByToken returned', {
          childId: child.id,
          familyId: child.family_id,
          childToken: token,
          enteringSyncChildDeviceLogin: true
        });

        debugChildBinding('D.repository', {
          ...getRepositoryDebugInfo(),
          method: 'syncChildDeviceLogin',
          requestPayload: { childId: child.id, familyId: child.family_id }
        });
        console.log('[child-token-runtime] syncChildDeviceLogin start', {
          childId: child.id,
          stack: new Error('syncChildDeviceLogin start').stack
        });
        const syncedChild = deviceBindingRepository.syncChildDeviceLogin(child.id);
        console.log('[child-token-runtime] syncChildDeviceLogin success', { syncedChild });
        if (!syncedChild?.id) {
          throw new Error('syncChildDeviceLogin returned no child id');
        }

        updateDiagnostics({
          stage: 'Session saved',
          childId: syncedChild.id,
          familyId: syncedChild.family_id,
          details: {
            syncChildDeviceLoginResponse: {
              childId: syncedChild.id,
              familyId: syncedChild.family_id,
              childToken: syncedChild.child_token ?? null
            }
          }
        });
        debugChildBinding('D.repository.response', {
          method: 'syncChildDeviceLogin',
          success: true,
          receivedPayload: { childId: child.id, familyId: child.family_id }
        });

        const confirmedChildHomeTarget = `${childHomeTarget}?childId=${encodeURIComponent(syncedChild.id)}`;
        childBindingTrace('Navigate', {
          tokenHash,
          childId: syncedChild.id,
          target: confirmedChildHomeTarget
        });
        updateDiagnostics({
          stage: 'Navigating to child home',
          details: { navigateTo: confirmedChildHomeTarget }
        });
        console.log('[child-token-entry] navigating to child home', {
          childId: syncedChild.id,
          childToken: token,
          navigateTo: confirmedChildHomeTarget
        });
        if (!cancelled) setCompleted(true);
        navigate(confirmedChildHomeTarget, { replace: true });
        childBindingTrace('========== Finish ==========', {
          tokenHash,
          childId: syncedChild.id,
          status: 'success'
        });
        childBindingTrace('Finish', {
          tokenHash,
          childId: syncedChild.id,
          status: 'success'
        });
      } catch (error) {
        childBindingTrace('Result', {
          tokenHash,
          childId: decodedChildId,
          success: false,
          errorMessage: getErrorMessage(error),
          error: serializeError(error)
        });
        childBindingTrace('========== Finish ==========', {
          tokenHash,
          childId: decodedChildId,
          status: 'error'
        });
        childBindingTrace('Finish', {
          tokenHash,
          childId: decodedChildId,
          status: 'error'
        });
        debugChildBinding('D.repository.error', {
          method: 'childTokenEntryInitialization',
          success: false,
          errorMessage: getErrorMessage(error),
          stack: getErrorStack(error),
          error: serializeError(error)
        });
        console.warn('[child-token-entry] child URL token initialization failed', {
          childToken: token,
          error,
          diagnostics: serializeError(error)
        });
        fail(error, {
          token,
          pathname: location.pathname,
          href: typeof window !== 'undefined' ? window.location.href : null
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [childHomeTarget, location.pathname, navigate, reservedChildRoute, token]);

  if (reservedChildRoute) return <Navigate to={childHomeTarget} replace />;

  return (
    <div className="child-device-entry">
      <section>
        <span>{invalid ? '!' : completed ? 'OK' : '...'}</span>
        <h1>{invalid ? 'Child token initialization failed' : 'Initializing child session'}</h1>
        <p>{invalid ? diagnostics.errorMessage ?? 'Unknown error' : diagnostics.stage}</p>
        <DiagnosticsPanel diagnostics={diagnostics} traceEntries={traceEntries} />
        {invalid ? (
          <button type="button" onClick={() => navigate('/parent/children', { replace: true })}>
            回到孩子管理
          </button>
        ) : null}
      </section>
    </div>
  );
}
