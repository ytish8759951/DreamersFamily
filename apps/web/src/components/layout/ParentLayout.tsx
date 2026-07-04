export function ParentLayout() {
  return (
    <main style={pageStyle}>
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
    </main>
  );
}

const pageStyle = {
  minHeight: '100vh',
  padding: '16px'
} satisfies React.CSSProperties;
