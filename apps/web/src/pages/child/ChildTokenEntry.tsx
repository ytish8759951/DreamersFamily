import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  debugChildBinding,
  decodeChildTokenForDebug,
  getDeviceDebugInfo,
  getRepositoryDebugInfo,
  getRouteDebugInfo
} from '../../lib/childBindingDebug';
import { deviceBindingRepository } from '../../lib/deviceBindingRepository';

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
    console.error('[child-token-runtime] await rejected', {
      step,
      message: getErrorMessage(error),
      stack: getErrorStack(error),
      error
    });
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown) {
  return error instanceof Error ? error.stack ?? null : null;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null
    };
  }
  return { message: String(error) };
}

function getStageStatus(currentStage: TokenEntryStage, stage: TokenEntryStage) {
  if (currentStage === stage) return 'current';
  if (currentStage === 'Error') return stage === 'Error' ? 'current' : 'see details';

  const currentIndex = orderedStages.indexOf(currentStage);
  const stageIndex = orderedStages.indexOf(stage);
  if (currentIndex > stageIndex) return 'checked';
  return 'pending';
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: TokenEntryDiagnostics }) {
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
  const reservedChildRoute = childRoutes.has(token);
  const childHomeTarget = '/child/home';

  useEffect(() => {
    if (reservedChildRoute) return;

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
        stack: getErrorStack(error),
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
        debugChildBinding('B.token', tokenDebug);
        if (!tokenDebug.decoded?.childId) {
          throw new Error('Child token decode failed: childId is missing');
        }

        updateDiagnostics({
          stage: 'Token parsed',
          childId: tokenDebug.decoded.childId,
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

        const child = await traceAsyncStep('deviceBindingRepository.bindChildDeviceByToken', () =>
          Promise.resolve(deviceBindingRepository.bindChildDeviceByToken(token))
        );
        if (!child?.id) {
          throw new Error('bindChildDeviceByToken returned no child id');
        }
        if (!child.family_id) {
          throw new Error('bindChildDeviceByToken returned no family_id');
        }

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

        updateDiagnostics({
          stage: 'Navigating to child home',
          details: { navigateTo: childHomeTarget }
        });
        console.log('[child-token-entry] navigating to child home', {
          childId: syncedChild.id,
          childToken: token,
          navigateTo: childHomeTarget
        });
        if (!cancelled) setCompleted(true);
        navigate(childHomeTarget, { replace: true });
      } catch (error) {
        debugChildBinding('D.repository.error', {
          method: 'childTokenEntryInitialization',
          success: false,
          errorMessage: getErrorMessage(error),
          stack: getErrorStack(error),
          error: serializeError(error)
        });
        console.warn('[child-token-entry] child URL token initialization failed', {
          childToken: token,
          error
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
        <DiagnosticsPanel diagnostics={diagnostics} />
        {invalid ? (
          <button type="button" onClick={() => navigate('/child', { replace: true })}>
            Back to child entry
          </button>
        ) : null}
      </section>
    </div>
  );
}
