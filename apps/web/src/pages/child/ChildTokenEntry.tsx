import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { parseChildDeviceToken } from '../../lib/childDeviceToken';
import { childrenRepository } from '../../lib/childrenRepository';
import { LOCAL_DATABASE_KEY } from '../../lib/mockDatabase';
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

type DebugSnapshot = {
  locationHref: string;
  pathname: string;
  parsedToken: string;
  tokenPrefix: string;
  payloadParseSuccess: boolean;
  payloadJson: unknown;
  childrenLocalStorageKeyExists: boolean;
  currentChildIdentityExists: boolean;
  childOnboardingTokensExists: boolean;
  lookupSuccess: boolean;
  failureDecision: string;
  errorName: string | null;
  errorMessage: string | null;
  errorStack: string | null;
};

function readStoredState(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(LOCAL_DATABASE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function hasArrayItems(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function readLegacyChildren(): unknown[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem('children');
  console.log('children raw', raw);

  try {
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (caught) {
    console.error('[child token debug] children localStorage parse failed', caught);
    return [];
  }
}

function logChildrenLookupDebug(token: string) {
  const children = readLegacyChildren();
  console.log('children parsed', children);

  children.forEach((child, index) => {
    const c = child as {
      id?: unknown;
      childToken?: unknown;
      child_token?: unknown;
      onboardingToken?: unknown;
      childTokenLegacy?: unknown;
    };
    console.log(index, {
      id: c.id,
      childToken: c.childToken,
      child_token: c.child_token,
      onboardingToken: c.onboardingToken,
      childTokenLegacy: c.childTokenLegacy
    });
  });

  console.log('lookup token', token);
  console.log(
    'compare result',
    children.map((child) => {
      const c = child as {
        id?: unknown;
        childToken?: unknown;
        child_token?: unknown;
        onboardingToken?: unknown;
      };
      return {
        id: c.id,
        childToken: c.childToken === token,
        child_token: c.child_token === token,
        onboardingToken: c.onboardingToken === token
      };
    })
  );
}

function createDebugSnapshot(input: {
  pathname: string;
  token: string;
  state: ReturnType<typeof useLocalDataState>;
  failureDecision: string;
  caught?: unknown;
}): DebugSnapshot {
  const storedState = readStoredState();
  const payload = input.token ? parseChildDeviceToken(input.token) : null;
  let lookupSuccess = false;

  try {
    logChildrenLookupDebug(input.token);
    lookupSuccess = Boolean(input.token && childrenRepository.getChildByToken(input.token));
  } catch (caught) {
    console.error('[child token debug] getChildByToken failed', caught);
  }

  const error = input.caught instanceof Error ? input.caught : null;

  return {
    locationHref: typeof window !== 'undefined' ? window.location.href : '',
    pathname: input.pathname,
    parsedToken: input.token,
    tokenPrefix: input.token.split('_')[0] ?? '',
    payloadParseSuccess: Boolean(payload),
    payloadJson: payload,
    childrenLocalStorageKeyExists: Boolean(storedState),
    currentChildIdentityExists: Boolean(input.state.currentChildIdentity ?? storedState?.currentChildIdentity),
    childOnboardingTokensExists: hasArrayItems(input.state.child_onboarding_tokens) || hasArrayItems(storedState?.child_onboarding_tokens),
    lookupSuccess,
    failureDecision: input.failureDecision,
    errorName: error?.name ?? null,
    errorMessage: error?.message ?? (input.caught ? String(input.caught) : null),
    errorStack: error?.stack ?? null
  };
}

export function ChildTokenEntry() {
  const location = useLocation();
  const token = decodeURIComponent(location.pathname.replace('/child/', ''));
  const navigate = useNavigate();
  const state = useLocalDataState();
  const [debug, setDebug] = useState<DebugSnapshot | null>(null);
  const reservedChildRoute = useMemo(() => childRoutes.has(token), [token]);

  useEffect(() => {
    if (reservedChildRoute) return;
    if (!token) {
      setDebug(createDebugSnapshot({
        pathname: location.pathname,
        token,
        state,
        failureDecision: 'if (!token)'
      }));
      return;
    }

    try {
      childrenRepository.bindChildDeviceByToken(token);
      navigate('/child/home', { replace: true });
    } catch (caught) {
      console.error('[child token debug] bindChildDeviceByToken failed', caught);
      if (caught instanceof Error) console.error(caught.stack);
      setDebug(createDebugSnapshot({
        pathname: location.pathname,
        token,
        state,
        failureDecision: 'catch (bindChildDeviceByToken threw)',
        caught
      }));
    }
  }, [location.pathname, navigate, reservedChildRoute, state, token]);

  if (reservedChildRoute || state.device_child_id) return <Navigate to="/child/home" replace />;

  return (
    <div className="child-device-entry">
      <section>
        <span>Debug</span>
        <h1>Child Token Debug Panel</h1>
        <p>目前不顯示「孩子專屬網址已失效」，改列出實際判斷資料。</p>
        <dl style={{ textAlign: 'left', wordBreak: 'break-word' }}>
          <DebugRow label="1. location.href" value={debug?.locationHref} />
          <DebugRow label="2. pathname" value={debug?.pathname ?? location.pathname} />
          <DebugRow label="3. parsed token" value={debug?.parsedToken ?? token} />
          <DebugRow label="4. token prefix" value={debug?.tokenPrefix ?? token.split('_')[0]} />
          <DebugRow label="5. token payload parsed" value={debug?.payloadParseSuccess ?? false} />
          <DebugRow label="6. payload JSON" value={debug?.payloadJson ?? null} />
          <DebugRow label="7. children localStorage key exists" value={debug?.childrenLocalStorageKeyExists ?? false} />
          <DebugRow label="8. currentChildIdentity exists" value={debug?.currentChildIdentityExists ?? Boolean(state.currentChildIdentity)} />
          <DebugRow label="9. childOnboardingTokens exists" value={debug?.childOnboardingTokensExists ?? hasArrayItems(state.child_onboarding_tokens)} />
          <DebugRow label="10. lookup success" value={debug?.lookupSuccess ?? false} />
          <DebugRow label="11. final invalid decision" value={debug?.failureDecision ?? 'pending / no failure branch yet'} />
          <DebugRow label="error name" value={debug?.errorName} />
          <DebugRow label="error message" value={debug?.errorMessage} />
          <DebugRow label="error stack" value={debug?.errorStack} />
        </dl>
      </section>
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <dt style={{ fontWeight: 700 }}>{label}</dt>
      <dd style={{ margin: '4px 0 0' }}>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </pre>
      </dd>
    </div>
  );
}
