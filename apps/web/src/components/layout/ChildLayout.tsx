import { Camera, Home, ListChecks, Mail, PiggyBank } from 'lucide-react';
import { Component, ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { syncAppShellMetadata } from '../../lib/appRuntime';
import { formatUnreadBadge, getChildUnreadCounts, type ChildUnreadCategory } from '../../lib/childUnreadNotifications';
import { resolveCurrentChildId } from '../../lib/childSession';
import { markChildInteractionNotificationsRead } from '../../lib/notificationRepository';
import { useLocalDataState } from '../../lib/useLocalData';

const navItems = [
  { label: '我的家', href: '/child/home', icon: Home, badgeCategory: null },
  { label: '任務', href: '/child/tasks', icon: ListChecks, badgeCategory: 'task' },
  { label: '分享', href: '/child/share', icon: Camera, badgeCategory: 'share' },
  { label: '撲滿', href: '/child/dreams', icon: PiggyBank, badgeCategory: 'piggy' },
  { label: '信箱', href: '/child/mailbox', icon: Mail, badgeCategory: 'mailbox' }
] satisfies Array<{
  label: string;
  href: string;
  icon: typeof Home;
  badgeCategory: ChildUnreadCategory | null;
}>;

const readableCategoryByPath: Record<string, Exclude<ChildUnreadCategory, 'mailbox'>> = {
  '/child/tasks': 'task',
  '/child/share': 'share',
  '/child/dreams': 'piggy'
};

const routeReadyKeys: Record<Exclude<ChildUnreadCategory, 'mailbox'>, 'tasks' | 'shares' | 'piggy_products'> = {
  task: 'tasks',
  share: 'shares',
  piggy: 'piggy_products'
};

type ChildLayoutErrorBoundaryState = {
  error: Error | null;
  componentStack: string;
};

class ChildLayoutErrorBoundary extends Component<{ children: ReactNode }, ChildLayoutErrorBoundaryState> {
  state: ChildLayoutErrorBoundaryState = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): ChildLayoutErrorBoundaryState {
    return { error, componentStack: '' };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('ChildLayout render exception', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack
    });
    this.setState({ componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
          <h1>ChildLayout Render Error</h1>
          <p>{this.state.error.message}</p>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>
            {this.state.error.stack}
            {'\n'}
            {this.state.componentStack}
          </pre>
        </main>
      );
    }

    return this.props.children;
  }
}

export function ChildLayout() {
  return (
    <ChildLayoutErrorBoundary>
      <ChildLayoutContent />
    </ChildLayoutErrorBoundary>
  );
}

function ChildLayoutContent() {
  const location = useLocation();
  const localState = useLocalDataState();
  const childId = resolveCurrentChildId(localState);
  const lastReadKeyRef = useRef('');
  const unreadCounts = useMemo(() => getChildUnreadCounts(localState, childId), [localState, childId]);
  const isHomePage = location.pathname === '/child/home';
  const isTaskPage = location.pathname === '/child/tasks';
  const isSharePage = location.pathname === '/child/share';
  const isDreamPage = location.pathname === '/child/dreams';
  const isMailboxPage = location.pathname === '/child/mailbox';
  const isHonorPage = location.pathname === '/child/honor-wall';
  const isSpecialDaysPage = location.pathname === '/child/special-days';
  const isScreenTimePage = location.pathname === '/child/screen-time';

  useLayoutEffect(() => {
    syncAppShellMetadata(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    console.log('ChildLayout mounted', {
      pathname: location.pathname,
      href: typeof window !== 'undefined' ? window.location.href : null
    });
  }, [location.pathname]);

  useEffect(() => {
    if (!childId) return;
    const category = readableCategoryByPath[location.pathname];
    if (!category || unreadCounts[category] <= 0) return;
    const readyKey = routeReadyKeys[category];
    if (!Array.isArray(localState[readyKey])) return;
    const readKey = `${childId}:${category}:${unreadCounts[category]}:${localState.updated_at}`;
    if (lastReadKeyRef.current === readKey) return;
    lastReadKeyRef.current = readKey;
    const timer = window.setTimeout(() => {
      void markChildInteractionNotificationsRead(childId, category).catch((error) => {
        console.warn('[child-notifications] mark read failed', { category, error });
        lastReadKeyRef.current = '';
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [childId, location.pathname, localState, unreadCounts]);

  return (
    <div className={`ds-shell ds-child-shell${isHomePage ? ' ds-home-shell' : ''}${isTaskPage ? ' ds-task-shell' : ''}${isSharePage ? ' ds-share-shell' : ''}${isDreamPage ? ' ds-dream-shell' : ''}${isMailboxPage ? ' ds-mailbox-shell' : ''}${isHonorPage ? ' ds-honor-shell' : ''}${isSpecialDaysPage ? ' ds-special-days-shell' : ''}${isScreenTimePage ? ' ds-screen-time-shell' : ''}`}>
      <main className="ds-child-main"><Outlet /></main>
      <nav className="ds-bottom-nav" aria-label="孩子導覽">
        {navItems.map((item) => {
          const Icon = item.icon;
          const count = item.badgeCategory ? unreadCounts[item.badgeCategory] : 0;
          const badge = formatUnreadBadge(count);
          const ariaLabel = count > 0 ? `${item.label}，${badge} 則未讀` : item.label;
          return (
            <NavLink key={item.href} to={item.href} aria-label={ariaLabel} className={({ isActive }) => isActive ? 'is-active' : ''}>
              <span className="ds-bottom-nav-icon">
                <Icon size={26} strokeWidth={2.3} />
                {badge ? <span className="child-nav-badge" aria-hidden="true">{badge}</span> : null}
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
