import { ExternalLink, Monitor, Smartphone, Tablet, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

type PreviewPage = {
  name: string;
  route: string;
  description: string;
  tone: 'blue' | 'green' | 'pink' | 'yellow';
};

const childPages: PreviewPage[] = [
  { name: 'Home', route: '/child/home', description: '孩子首頁與成長摘要', tone: 'blue' },
  { name: 'Task', route: '/child/tasks', description: '每日任務與獎勵進度', tone: 'yellow' },
  { name: 'Share', route: '/child/share', description: '分享紀錄與內容分類', tone: 'green' },
  { name: 'Dream', route: '/child/dreams', description: '夢想清單與存款進度', tone: 'pink' },
  { name: 'Mailbox', route: '/child/mailbox', description: '家人訊息與溫暖卡片', tone: 'blue' }
];

const parentPages: PreviewPage[] = [
  { name: 'Parent Children', route: '/parent/children', description: '孩子管理', tone: 'green' },
  { name: 'Parent Task', route: '/parent/tasks', description: '任務管理與統計', tone: 'blue' },
  { name: 'Parent Share', route: '/parent/share', description: '孩子分享內容審核', tone: 'yellow' },
  { name: 'Parent Dream', route: '/parent/dreams', description: '夢想與存款管理', tone: 'pink' },
  { name: 'Parent Mailbox', route: '/parent/mailbox', description: '鼓勵訊息與重要日子', tone: 'green' }
];

const allPages = [...childPages, ...parentPages];

const devices = [
  { label: 'Desktop 1440', width: 1440, icon: Monitor },
  { label: 'Tablet 1024', width: 1024, icon: Tablet },
  { label: 'Mobile 375', width: 375, icon: Smartphone }
];

export function DesignSystemPreview() {
  const [selectedRoute, setSelectedRoute] = useState('/child/home');
  const [viewportWidth, setViewportWidth] = useState(1440);
  const selectedPage = allPages.find((page) => page.route === selectedRoute)!;

  return (
    <main className="preview-hub">
      <header className="preview-hero">
        <div className="preview-brand"><span>🐰</span><div><small>Little Dreamers Family</small><strong>Cream Storybook</strong></div></div>
        <div className="preview-hero-copy">
          <p>DESIGN SYSTEM · UI ACCEPTANCE</p>
          <h1>網頁驗收中心 <span>✦</span></h1>
          <div>集中檢視所有已完成頁面，並快速切換 Desktop、Tablet 與 Mobile 寬度。</div>
        </div>
        <aside><strong>10</strong><span>已完成 UI</span><small>全部可直接驗收</small></aside>
      </header>

      <section className="preview-device-bar">
        <div><strong>快速切換畫布</strong><span>目前寬度：{viewportWidth}px</span></div>
        <nav>{devices.map(({ label, width, icon: Icon }) => <button className={viewportWidth === width ? 'is-active' : ''} onClick={() => setViewportWidth(width)} key={width}><Icon size={18} />{label}</button>)}</nav>
      </section>

      <PageGroup title="孩子端" subtitle="Child Experience" pages={childPages} selectedRoute={selectedRoute} onPreview={setSelectedRoute} />
      <PageGroup title="家長端" subtitle="Parent Management" pages={parentPages} selectedRoute={selectedRoute} onPreview={setSelectedRoute} />

      <section className="preview-stage-section">
        <header>
          <div><small>LIVE PREVIEW</small><h2>{selectedPage.name}</h2><code>{selectedPage.route}</code></div>
          <div>
            <select value={selectedRoute} onChange={(event) => setSelectedRoute(event.target.value)} aria-label="選擇預覽頁面">
              {allPages.map((page) => <option value={page.route} key={page.route}>{page.name} — {page.route}</option>)}
            </select>
            <a href={selectedPage.route} target="_blank" rel="noreferrer">直接開啟 <ExternalLink size={15} /></a>
          </div>
        </header>
        <div className="preview-stage-scroll">
          <div className="preview-browser" style={{ width: `${viewportWidth}px` }}>
            <div className="preview-browser-bar"><i /><i /><i /><span>{selectedPage.route}</span><b>{viewportWidth}px</b></div>
            <iframe title={`${selectedPage.name} UI preview`} src={selectedPage.route} />
          </div>
        </div>
      </section>
    </main>
  );
}

function PageGroup({ title, subtitle, pages, selectedRoute, onPreview }: {
  title: string;
  subtitle: string;
  pages: PreviewPage[];
  selectedRoute: string;
  onPreview: (route: string) => void;
}) {
  return (
    <section className="preview-group">
      <header><div><small>{subtitle}</small><h2>{title}</h2></div><span>{pages.length} pages</span></header>
      <div className="preview-card-grid">
        {pages.map((page, index) => (
          <article className={`preview-card is-${page.tone}${selectedRoute === page.route ? ' is-selected' : ''}`} key={page.route}>
            <div className="preview-card-number">{String(index + 1).padStart(2, '0')}</div>
            <div className="preview-card-copy"><small><CheckCircle2 size={14} /> 已完成 UI</small><h3>{page.name}</h3><p>{page.description}</p><code>{page.route}</code></div>
            <div className="preview-checks"><span><Monitor size={14} /> Desktop</span><span><Tablet size={14} /> Tablet</span><span><Smartphone size={14} /> Mobile</span></div>
            <footer><button onClick={() => onPreview(page.route)}>畫布預覽</button><a href={page.route} target="_blank" rel="noreferrer">開啟頁面 <ExternalLink size={14} /></a></footer>
          </article>
        ))}
      </div>
    </section>
  );
}
