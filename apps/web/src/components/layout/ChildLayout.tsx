import { Camera, Home, ListChecks, Mail, PiggyBank } from 'lucide-react';
import { Component, ReactNode, useEffect, useLayoutEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { syncAppShellMetadata } from '../../lib/appRuntime';

const navItems = [
  { label: '我的家', href: '/child/home', icon: Home },
  { label: '任務', href: '/child/tasks', icon: ListChecks },
  { label: '分享', href: '/child/share', icon: Camera },
  { label: '撲滿', href: '/child/dreams', icon: PiggyBank },
  { label: '信箱', href: '/child/mailbox', icon: Mail }
];

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
  console.log('ChildLayout', {
    pathname: location.pathname
  });
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

  return (
    <div className={`ds-shell ds-child-shell${isHomePage ? ' ds-home-shell' : ''}${isTaskPage ? ' ds-task-shell' : ''}${isSharePage ? ' ds-share-shell' : ''}${isDreamPage ? ' ds-dream-shell' : ''}${isMailboxPage ? ' ds-mailbox-shell' : ''}${isHonorPage ? ' ds-honor-shell' : ''}${isSpecialDaysPage ? ' ds-special-days-shell' : ''}${isScreenTimePage ? ' ds-screen-time-shell' : ''}`}>
      <main className="ds-child-main"><Outlet /></main>
      <nav className="ds-bottom-nav" aria-label="孩子導覽">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.href} to={item.href} className={({ isActive }) => isActive ? 'is-active' : ''}>
              <Icon size={26} strokeWidth={2.3} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
