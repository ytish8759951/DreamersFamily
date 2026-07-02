import { Camera, Home, ListChecks, Mail, PiggyBank } from 'lucide-react';
import { useEffect } from 'react';
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

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const linkId = 'dynamic-child-manifest';
    const existing = document.getElementById(linkId) as HTMLLinkElement | null;
    const previousHref = existing?.getAttribute('href') ?? null;
    const manifest = {
      name: 'Dreamers Family',
      short_name: 'Dreamers',
      description: 'Dreamers Family',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/child/home',
      scope: '/child/',
      background_color: '#fff7ed',
      theme_color: '#7a8f6e',
      icons: [
        { src: `${window.location.origin}/app-icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: `${window.location.origin}/app-icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const href = URL.createObjectURL(blob);
    const link = existing ?? document.createElement('link');
    link.id = linkId;
    link.rel = 'manifest';
    link.href = href;
    if (!existing) document.head.appendChild(link);
    return () => {
      if (existing) {
        if (previousHref) existing.setAttribute('href', previousHref);
        else existing.removeAttribute('href');
      } else {
        link.remove();
      }
      URL.revokeObjectURL(href);
    };
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
