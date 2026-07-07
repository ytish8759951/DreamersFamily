import { useEffect, useLayoutEffect, useState } from 'react';
import {
  Baby,
  Camera,
  CheckSquare,
  Clock3,
  Heart,
  Menu,
  PiggyBank,
  Settings,
  Tablet,
  X
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { syncAppShellMetadata } from '../../lib/appRuntime';
import { useLocalDataState } from '../../lib/useLocalData';

const navItems = [
  { label: '任務管理', href: '/parent/tasks', icon: CheckSquare },
  { label: '今日任務', href: '/parent/tasks', icon: Clock3 },
  { label: '今日分享', href: '/parent/share', icon: Camera },
  { label: '撲滿 / 商品兌換', href: '/parent/dreams', icon: PiggyBank },
  { label: '平板時間', href: '/parent/screen-time', icon: Tablet },
  { label: '成長紀錄', href: '/parent/growth', icon: Heart },
  { label: '孩子管理', href: '/parent/children', icon: Baby },
  { label: '家長設定', href: '/parent/settings', icon: Settings }
];

export function ParentLayout() {
  const location = useLocation();
  const state = useLocalDataState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const familyName = state.family_settings.family_name || '小小夢想家 Family';
  const parentName = state.family_settings.parent_name || '家長';

  useLayoutEffect(() => {
    syncAppShellMetadata(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <div className="ph-shell">
      <aside className="ph-sidebar" aria-label="家長端導覽">
        <Brand familyName={familyName} />
        <ParentNav />
        <section className="ph-user">
          <span>👩</span>
          <strong>{parentName}</strong>
          <small>{familyName}</small>
        </section>
      </aside>

      <div className="ph-content">
        <header className="ph-topbar">
          <button
            type="button"
            className="ph-menu"
            style={{ display: 'flex' }}
            aria-label="開啟導覽選單"
            aria-expanded={drawerOpen}
            aria-controls="parent-navigation-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={22} />
          </button>
          <Brand familyName={familyName} />
          <div className="ph-top-copy">
            <small>Dreamers Family</small>
            <strong>{familyName}</strong>
          </div>
          <NavLink to="/child/home">小朋友端</NavLink>
        </header>

        <button
          type="button"
          className={`ph-mobile-overlay ${drawerOpen ? 'is-open' : 'is-closed'}`}
          hidden={!drawerOpen}
          aria-label="關閉導覽選單"
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          id="parent-navigation-drawer"
          className={`ph-mobile-drawer ${drawerOpen ? 'is-open' : 'is-closed'}`}
          hidden={!drawerOpen}
          aria-label="家長端導覽抽屜"
        >
          <header className="ph-mobile-drawer-head">
            <Brand familyName={familyName} />
            <button type="button" aria-label="關閉導覽選單" onClick={() => setDrawerOpen(false)}>
              <X size={21} />
            </button>
          </header>
          <ParentNav />
        </aside>

        <main className="ph-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Brand({ familyName }: { familyName: string }) {
  return (
    <div className="ph-brand">
      <span>🌙</span>
      <div>
        <small>Dreamers Family</small>
        <strong>{familyName}</strong>
      </div>
    </div>
  );
}

function ParentNav() {
  return (
    <nav>
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink key={item.label} to={item.href} className={({ isActive }) => isActive ? 'is-active' : ''}>
            <Icon size={19} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
