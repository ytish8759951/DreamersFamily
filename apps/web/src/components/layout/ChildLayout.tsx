import { Camera, Home, ListChecks, Mail, PiggyBank } from 'lucide-react';
import { useLayoutEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const navItems = [
  { label: '我的家', href: '/child/home', icon: Home },
  { label: '任務', href: '/child/tasks', icon: ListChecks },
  { label: '分享', href: '/child/share', icon: Camera },
  { label: '撲滿', href: '/child/dreams', icon: PiggyBank },
  { label: '信箱', href: '/child/mailbox', icon: Mail }
];

export function ChildLayout() {
  const location = useLocation();
  const isHomePage = location.pathname === '/child/home';
  const isTaskPage = location.pathname === '/child/tasks';
  const isSharePage = location.pathname === '/child/share';
  const isDreamPage = location.pathname === '/child/dreams';
  const isMailboxPage = location.pathname === '/child/mailbox';
  const isHonorPage = location.pathname === '/child/honor-wall';
  const isSpecialDaysPage = location.pathname === '/child/special-days';
  const isScreenTimePage = location.pathname === '/child/screen-time';

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const linkId = 'app-manifest-link';
    const href = '/manifest-child.webmanifest?v=20260702-child-pwa-v1';
    const iconHref = '/app-icon-child.png?v=20260702-child-pwa-v1';
    const existing = document.getElementById(linkId) as HTMLLinkElement | null;
    const link = existing ?? document.createElement('link');
    link.id = linkId;
    link.rel = 'manifest';
    link.href = href;
    if (!existing) document.head.appendChild(link);
    let iconLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.rel = 'apple-touch-icon';
      document.head.appendChild(iconLink);
    }
    iconLink.href = iconHref;
    const title = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (title) title.setAttribute('content', 'Dreamers Child');
    document.title = 'Dreamers Child';
  }, []);

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
