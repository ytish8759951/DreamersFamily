import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { childrenRepository } from '../../lib/childrenRepository';
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
  const reservedChildRoute = useMemo(() => childRoutes.has(token), [token]);
  const childHomeTarget = useMemo(() => {
    const childId = state.currentChildIdentity?.childId ?? state.device_child_id ?? null;
    return childId ? `/child/home?childId=${encodeURIComponent(childId)}` : '/child/home';
  }, [state.currentChildIdentity?.childId, state.device_child_id]);

  useEffect(() => {
    if (reservedChildRoute) return;
    if (!token) {
      setInvalid(true);
      return;
    }

    try {
      const child = childrenRepository.bindChildDeviceByToken(token);
      navigate(`/child/home?childId=${encodeURIComponent(child.id)}`, { replace: true });
    } catch {
      setInvalid(true);
    }
  }, [navigate, reservedChildRoute, token]);

  if (reservedChildRoute || state.device_child_id) return <Navigate to={childHomeTarget} replace />;

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
