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
import { useLocalDataState } from '../../lib/useLocalData';

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
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      error
    });
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function ChildTokenEntry() {
  const location = useLocation();
  const token = decodeURIComponent(location.pathname.replace('/child/', ''));
  const navigate = useNavigate();
  const state = useLocalDataState();
  const [invalid, setInvalid] = useState(false);
  const reservedChildRoute = childRoutes.has(token);
  const childHomeTarget = '/child/home';

  useEffect(() => {
    if (reservedChildRoute) return;
    if (!token) {
      setInvalid(true);
      return;
    }

    void (async () => {
    try {
      const tokenDebug = decodeChildTokenForDebug(token);
      debugChildBinding('A.url', getRouteDebugInfo(location.pathname));
      debugChildBinding('B.token', tokenDebug);
      debugChildBinding('C.device', await traceAsyncStep('getDeviceDebugInfo', getDeviceDebugInfo));
      debugChildBinding('D.repository', {
        ...getRepositoryDebugInfo(),
        method: 'bindChildDeviceByToken',
        requestPayload: { childToken: token }
      });
      console.log('[child-token-entry] received child URL token', { childToken: token });
      const child = await traceAsyncStep('deviceBindingRepository.bindChildDeviceByToken', () => Promise.resolve(deviceBindingRepository.bindChildDeviceByToken(token)));
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
        childToken: token,
        enteringSyncChildDeviceLogin: true
      });
      debugChildBinding('D.repository', {
        ...getRepositoryDebugInfo(),
        method: 'syncChildDeviceLogin',
        requestPayload: { childId: child.id, familyId: child.family_id }
      });
      try {
        console.log('[child-token-runtime] syncChildDeviceLogin start', {
          childId: child.id,
          stack: new Error('syncChildDeviceLogin start').stack
        });
        const syncedChild = deviceBindingRepository.syncChildDeviceLogin(child.id);
        console.log('[child-token-runtime] syncChildDeviceLogin success', { syncedChild });
      } catch (error) {
        console.error('[child-token-runtime] syncChildDeviceLogin error', {
          childId: child.id,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          error
        });
        throw error;
      }
      debugChildBinding('D.repository.response', {
        method: 'syncChildDeviceLogin',
        success: true,
        receivedPayload: { childId: child.id, familyId: child.family_id }
      });
      console.log('[child-token-entry] syncChildDeviceLogin invoked', {
        childId: child.id,
        childToken: token
      });
      navigate('/child/home', { replace: true });
    } catch (error) {
      debugChildBinding('D.repository.error', {
        method: 'bindChildDeviceByToken',
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        error
      });
      console.warn('[child-token-entry] child URL token binding failed', {
        childToken: token,
        error
      });
      setInvalid(true);
    }
    })();
  }, [navigate, reservedChildRoute, token]);

  if (reservedChildRoute || state.deviceBinding) return <Navigate to={childHomeTarget} replace />;

  if (invalid) {
    return (
      <div className="child-device-entry">
        <section>
          <span>×</span>
          <h1>孩子專屬網址已失效</h1>
          <p>請返回家長端重新產生孩子網址，再次掃描 QR Code。</p>
        </section>
      </div>
    );
  }

  return (
    <div className="child-device-entry">
      <section>
        <span>…</span>
        <h1>正在啟用孩子裝置</h1>
        <p>請稍候，系統正在綁定這台平板。</p>
      </section>
    </div>
  );
}
