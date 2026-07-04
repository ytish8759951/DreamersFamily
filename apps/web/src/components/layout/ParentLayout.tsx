import {
  Activity,
  BookOpen,
  CalendarHeart,
  Camera,
  CheckSquare,
  Clock3,
  Mail,
  Menu,
  PiggyBank,
  Settings,
  Users,
  X
} from 'lucide-react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { APP_BUNDLE_VERSION } from '../../lib/appRuntime';
import { dataModeLabel } from '../../lib/dataRepository';
import { useLocalDataState } from '../../lib/useLocalData';

const navigation = [
  { label: '孩子管理', short: '孩子', to: '/parent/children', icon: Users },
  { label: '任務管理', short: '任務', to: '/parent/tasks', icon: CheckSquare, count: 4 },
  { label: '分享管理', short: '分享', to: '/parent/share', icon: Camera, count: 3 },
  { label: '撲滿管理', short: '撲滿', to: '/parent/dreams', icon: PiggyBank },
  { label: '信箱管理', short: '信箱', to: '/parent/mailbox', icon: Mail },
  { label: '特別日', short: '特別日', to: '/parent/special-days', icon: CalendarHeart },
  { label: '年度回憶冊', short: '回憶冊', to: '/parent/memory-book', icon: BookOpen },
  { label: '螢幕時間', short: '螢幕', to: '/parent/screen-time', icon: Clock3 },
  { label: '設定', short: '設定', to: '/parent/settings', icon: Settings }
];

const mobileNavigation = [
  { label: '孩子管理', to: '/parent/children', icon: Users },
  { label: '任務管理', to: '/parent/tasks', icon: CheckSquare },
  { label: '分享管理', to: '/parent/share', icon: Camera },
  { label: '撲滿管理', to: '/parent/dreams', icon: PiggyBank },
  { label: '信箱管理', to: '/parent/mailbox', icon: Mail },
  { label: '特別日', to: '/parent/special-days', icon: CalendarHeart },
  { label: '成長紀錄', to: '/parent/growth', icon: Activity },
  { label: '螢幕時間', to: '/parent/screen-time', icon: Clock3 },
  { label: '設定', to: '/parent/settings', icon: Settings }
];

export function ParentLayout() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const localState = useLocalDataState();
  const familyName = localState.family_settings.family_name || '小小夢想家 Family';

  const familyPath = location.pathname;
  const pickNavigation = (paths: string[]) =>
    paths
      .map((path) => navigation.find((item) => item.to === path))
      .filter((item): item is (typeof navigation)[number] => Boolean(item));
  const reviewBottomNav = pickNavigation(['/parent/children', '/parent/tasks', '/parent/share', '/parent/dreams', '/parent/settings']);
  const dreamBottomNav = pickNavigation(['/parent/children', '/parent/tasks', '/parent/share', '/parent/dreams', '/parent/mailbox']);
  const growthBottomNav = pickNavigation(['/parent/children', '/parent/growth', '/parent/memory-book', '/parent/special-days', '/parent/settings']);
  const memoryBookBottomNav = pickNavigation(['/parent/children', '/parent/share', '/parent/tasks', '/parent/growth', '/parent/memory-book']);
  const bottomNavigation = familyPath === '/parent/tasks' || familyPath === '/parent/share'
    ? reviewBottomNav
    : familyPath === '/parent/memory-book'
      ? memoryBookBottomNav
    : familyPath === '/parent/growth'
      ? growthBottomNav
      : dreamBottomNav;
  const pageClass = familyPath === '/parent/dreams' ? ' is-dream-page' : familyPath === '/parent/mailbox' ? ' is-mailbox-page' : '';

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const linkId = 'app-manifest-link';
    const href = `/manifest-parent.webmanifest?v=${APP_BUNDLE_VERSION}`;
    const iconHref = `/app-icon-parent.png?v=${APP_BUNDLE_VERSION}`;
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
    if (title) title.setAttribute('content', familyName);
    document.title = familyName;
  }, [familyName]);

  return (
    <div className={`ph-shell${pageClass}`}>
      <aside className="ph-sidebar">
        <Brand familyName={familyName} />
        <nav>
          {navigation.map(({ label, to, icon: Icon, count }) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'is-active' : ''}>
              <Icon size={17} />
              <span>{label}</span>
              {count ? <b>{count}</b> : null}
            </NavLink>
          ))}
        </nav>
        <div className="ph-user"><span>家</span><strong>家長端</strong><small>{dataModeLabel}</small></div>
      </aside>

      <div className="ph-content">
        <header className="ph-topbar">
          <button
            type="button"
            className="ph-menu"
            aria-label="開啟選單"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu size={20} />
          </button>
          <Brand familyName={familyName} />
          <div className="ph-top-copy">
            <small>{familyName}</small>
            <strong>家長管理中心</strong>
          </div>
          <NavLink to="/child/home">孩子首頁</NavLink>
        </header>
        <main className="ph-main"><Outlet /></main>
      </div>

      <button
        type="button"
        className={`ph-mobile-overlay${isMobileMenuOpen ? ' is-open' : ' is-closed'}`}
        hidden={!isMobileMenuOpen}
        aria-label="關閉選單"
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <aside
        className={`ph-mobile-drawer${isMobileMenuOpen ? ' is-open' : ' is-closed'}`}
        hidden={!isMobileMenuOpen}
        aria-hidden={!isMobileMenuOpen}
        aria-label="家長端選單"
      >
        <div className="ph-mobile-drawer-head">
          <Brand familyName={familyName} />
          <button type="button" aria-label="關閉選單" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav>
          {mobileNavigation.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => isActive ? 'is-active' : ''}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <nav className="ph-bottom-nav">
        {bottomNavigation.map(({ short, label, to, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'is-active' : ''}>
            <Icon size={17} /><span>{short || label}</span>
          </NavLink>
        ))}
      </nav>
      <MobileTapDiagnostics isMobileMenuOpen={isMobileMenuOpen} />
    </div>
  );
}

type TapInfo = {
  tagName: string;
  className: string;
  id: string;
  zIndex: string;
  pointerEvents: string;
  position: string;
  width: number;
  height: number;
};

const BLOCKING_CLASS_PATTERN = /(overlay|backdrop|loading|drawer|modal|mask|auth-page)/i;

function MobileTapDiagnostics({ isMobileMenuOpen }: { isMobileMenuOpen: boolean }) {
  const [tapInfo, setTapInfo] = useState<TapInfo | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const inspectPoint = (clientX: number, clientY: number, source: string) => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      if (!element) return;

      const styles = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const info: TapInfo = {
        tagName: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        id: element.id || '',
        zIndex: styles.zIndex,
        pointerEvents: styles.pointerEvents,
        position: styles.position,
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };

      setTapInfo(info);
      console.log('[tap-inspector]', { source, x: clientX, y: clientY, ...info, element });

      if (!isMobileMenuOpen && isBlockingElement(element, info)) {
        element.style.pointerEvents = 'none';
        if (element.classList.contains('ph-mobile-overlay') || element.classList.contains('ph-mobile-drawer')) {
          element.style.display = 'none';
          element.setAttribute('hidden', '');
        }
        console.warn('[tap-inspector] disabled blocking element', info, element);
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (!touch) return;
      inspectPoint(touch.clientX, touch.clientY, 'touchstart');
    };

    const onClick = (event: MouseEvent) => {
      inspectPoint(event.clientX, event.clientY, 'click');
    };

    const inspectCenter = () => {
      inspectPoint(window.innerWidth / 2, window.innerHeight / 2, 'initial-center');
    };

    window.setTimeout(inspectCenter, 250);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('click', onClick, { capture: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, [isMobileMenuOpen]);

  if (!tapInfo) return null;

  return (
    <aside className="ph-tap-inspector" aria-live="polite">
      <strong>tap inspector</strong>
      <span>tag: {tapInfo.tagName}</span>
      <span>class: {tapInfo.className || '-'}</span>
      <span>id: {tapInfo.id || '-'}</span>
      <span>z: {tapInfo.zIndex}</span>
      <span>pointer: {tapInfo.pointerEvents}</span>
      <span>pos: {tapInfo.position}</span>
      <span>size: {tapInfo.width}x{tapInfo.height}</span>
    </aside>
  );
}

function isBlockingElement(element: HTMLElement, info: TapInfo) {
  const label = `${info.className} ${info.id} ${info.tagName}`;
  const coversViewport = info.width >= window.innerWidth * 0.8 && info.height >= window.innerHeight * 0.5;
  const fixedLayer = info.position === 'fixed' || info.position === 'sticky';
  return BLOCKING_CLASS_PATTERN.test(label) && (fixedLayer || coversViewport);
}

function Brand({ familyName }: { familyName: string }) {
  return (
    <div className="ph-brand">
      <span>夢</span>
      <div><small>{familyName}</small><strong>家長管理中心</strong></div>
    </div>
  );
}
