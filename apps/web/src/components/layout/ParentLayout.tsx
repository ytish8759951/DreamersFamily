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
  Users
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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

export function ParentLayout() {
  const location = useLocation();
  const localState = useLocalDataState();
  const activeChild = localState.children.find(
    (child) => child.id === localState.active_child_id && child.status === 'active'
  );
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

  return (
    <div className={`ph-shell${pageClass}`}>
      <aside className="ph-sidebar">
        <Brand />
        <nav>
          {navigation.map(({ label, to, icon: Icon, count }) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'is-active' : ''}>
              <Icon size={17} />
              <span>{label}</span>
              {count ? <b>{count}</b> : null}
            </NavLink>
          ))}
        </nav>
        <div className="ph-user"><span>家</span><strong>家長端</strong><small>Local MVP</small></div>
      </aside>

      <div className="ph-content">
        <header className="ph-topbar">
          <button className="ph-menu" aria-label="開啟選單"><Menu size={20} /></button>
          <Brand />
          <div className="ph-top-copy">
            <small>{activeChild ? `${activeChild.display_name} 目前使用中` : '尚未選擇孩子'}</small>
            <strong>家長管理中心</strong>
          </div>
          <NavLink to="/child/home">孩子首頁</NavLink>
        </header>
        <main className="ph-main"><Outlet /></main>
      </div>

      <nav className="ph-bottom-nav">
        {bottomNavigation.map(({ short, label, to, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'is-active' : ''}>
            <Icon size={17} /><span>{short || label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className="ph-brand">
      <span>夢</span>
      <div><small>Little Dreamers Family</small><strong>家長管理中心</strong></div>
    </div>
  );
}
