import { useLayoutEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Dashboard } from '../../pages/parent/Dashboard';
import { syncAppShellMetadata } from '../../lib/appRuntime';
import { useLocalDataState } from '../../lib/useLocalData';

export function ParentLayout() {
  const state = useLocalDataState();
  const familyName = state.family_settings.family_name || '撠?憭Ｘ摰?Family';
  const activeChildren = state.children.filter((child) => child.status === 'active');

  useLayoutEffect(() => {
    syncAppShellMetadata('/parent');
  }, []);

  return (
    <main style={pageStyle}>
      <header>
        <h1>{familyName}</h1>
        <p>Parent Header</p>
      </header>

      <section style={familyCardStyle}>
        <h2 style={sectionTitleStyle}>FamilyCard</h2>
        <p style={familyCardTextStyle}>{familyName}</p>
        <p style={familyCardTextStyle}>{activeChildren.length} children active</p>
      </section>

      <section>
        <Dashboard />
      </section>

      <div style={{ padding: 40 }}>
        <h1>Parent Test</h1>

        <button
          onClick={() => {
            alert('React Click');
            console.log('React Click');
          }}
        >
          Test Button
        </button>

        <input placeholder="test input" />

        <a href="https://google.com">Google</a>
      </div>

      <nav aria-label="Parent bottom tab">
        <NavLink to="/parent/dashboard">Dashboard</NavLink>
        <NavLink to="/parent/mailbox">Mail</NavLink>
        <NavLink to="/parent/settings">Settings</NavLink>
      </nav>
    </main>
  );
}

const pageStyle = {
  minHeight: '100vh',
  padding: '16px'
} satisfies React.CSSProperties;

const familyCardStyle = {
  border: '1px solid rgba(0, 0, 0, 0.12)',
  borderRadius: 12,
  padding: 16,
  marginBottom: 16
} satisfies React.CSSProperties;

const sectionTitleStyle = {
  margin: '0 0 8px',
  fontSize: 18,
  fontWeight: 700
} satisfies React.CSSProperties;

const familyCardTextStyle = {
  margin: '0 0 4px'
} satisfies React.CSSProperties;
