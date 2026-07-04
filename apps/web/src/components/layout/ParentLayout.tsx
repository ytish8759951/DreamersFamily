import { NavLink } from 'react-router-dom';
import { Dashboard } from '../../pages/parent/Dashboard';
import { useLocalDataState } from '../../lib/useLocalData';

export function ParentLayout() {
  const state = useLocalDataState();
  const familyName = state.family_settings.family_name || '小小夢想家 Family';
  const activeChildren = state.children.filter((child) => child.status === 'active');

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div style={headerCopyStyle}>
          <h1 style={headerTitleStyle}>{familyName}</h1>
          <p style={headerSubtitleStyle}>Parent Header</p>
        </div>
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

      <nav style={bottomTabStyle} aria-label="Parent bottom tab">
        <NavLink style={tabLinkStyle} to="/parent/dashboard">
          Dashboard
        </NavLink>
        <NavLink style={tabLinkStyle} to="/parent/mailbox">
          Mail
        </NavLink>
        <NavLink style={tabLinkStyle} to="/parent/settings">
          Settings
        </NavLink>
      </nav>
    </main>
  );
}

const pageStyle = {
  minHeight: '100vh',
  padding: '16px'
} satisfies React.CSSProperties;

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 16
} satisfies React.CSSProperties;

const headerCopyStyle = {
  display: 'grid',
  gap: 4
} satisfies React.CSSProperties;

const headerTitleStyle = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  lineHeight: 1.1
} satisfies React.CSSProperties;

const headerSubtitleStyle = {
  margin: 0,
  fontSize: 14,
  opacity: 0.72
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

const bottomTabStyle = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  justifyContent: 'space-around',
  gap: 8,
  padding: 12,
  borderTop: '1px solid rgba(0, 0, 0, 0.12)',
  background: '#fff'
} satisfies React.CSSProperties;

const tabLinkStyle = ({ isActive }: { isActive: boolean }) =>
  ({
    padding: '8px 12px',
    borderRadius: 10,
    textDecoration: 'none',
    color: isActive ? '#111' : '#666',
    fontWeight: isActive ? 700 : 500
  }) satisfies React.CSSProperties;
