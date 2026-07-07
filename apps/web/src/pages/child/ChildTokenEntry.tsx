import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
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
      console.log('[child-token-entry] received child URL token', { childToken: token });
      const child = await deviceBindingRepository.bindChildDeviceByToken(token);
      console.log('[child-token-entry] bindChildDeviceByToken returned', {
        childId: child.id,
        childToken: token,
        enteringSyncChildDeviceLogin: true
      });
      deviceBindingRepository.syncChildDeviceLogin(child.id);
      console.log('[child-token-entry] syncChildDeviceLogin invoked', {
        childId: child.id,
        childToken: token
      });
      navigate('/child/home', { replace: true });
    } catch (error) {
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
