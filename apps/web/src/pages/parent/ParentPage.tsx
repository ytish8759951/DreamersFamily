import type { LucideIcon } from 'lucide-react';
import { Camera, Mic, Plus, Send, Video } from 'lucide-react';
import { children, mediaTypes, rewardTypes, tasks, timeline, wishes } from '../../data/mockData';
import { FeatureCard, StatCard } from '../../components/ui';

type ParentPageProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  primaryAction: string;
};

export function ParentPage({ title, subtitle, icon: Icon, primaryAction }: ParentPageProps) {
  const actionItems = [
    ...tasks.map((task) => ({ id: task.id, title: task.title, meta: `${task.child} · ${task.reward}` })),
    ...wishes.map((wish) => ({ id: wish.id, title: wish.title, meta: `${wish.child} · ${wish.target}` }))
  ];

  return (
    <div className="ds-parent-page">
      <header className="ds-parent-heading">
        <div className="ds-parent-title"><span><Icon size={28} /></span><div><h1>{title}</h1><p>{subtitle}</p></div></div>
        <button className="ds-primary-button"><Plus size={20} /> {primaryAction}</button>
      </header>

      <section className="ds-parent-stats">
        <StatCard label="孩子" value="3 位" tone="ds-tone-blue" />
        <StatCard label="待審核" value="4 件" tone="ds-tone-pink" />
        <StatCard label="今日星星" value="+18" tone="ds-tone-yellow" />
        <StatCard label="平板時間" value="100 分" tone="ds-tone-green" />
      </section>

      <section className="ds-parent-columns">
        <div className="ds-parent-card ds-parent-card-wide">
          <h2>孩子狀態</h2>
          <div className="ds-child-status-grid">
            {children.map((child, index) => (
              <article key={child.id}>
                <span className={`ds-avatar ds-tone-${['blue', 'pink', 'yellow'][index]}`}>{child.avatar}</span>
                <div><strong>{child.name}</strong><small>{child.age} 歲</small></div>
                <dl><div><dt>星星</dt><dd>{child.stars}</dd></div><div><dt>平板</dt><dd>{child.tabletMinutes} 分</dd></div></dl>
              </article>
            ))}
          </div>
        </div>
        <div className="ds-parent-card">
          <h2>內容與獎勵</h2>
          <div className="ds-compact-grid">
            {mediaTypes.map((type) => { const MediaIcon = type.icon; return <button key={type.label}><MediaIcon size={20} /> {type.label}</button>; })}
            {rewardTypes.map((type) => { const RewardIcon = type.icon; return <button key={type.label}><RewardIcon size={20} /> {type.label}</button>; })}
          </div>
        </div>
      </section>

      <section className="ds-parent-columns">
        <div className="ds-parent-card ds-parent-card-wide">
          <h2>任務與願望</h2>
          <div className="ds-parent-list">
            {actionItems.map((item) => <article key={item.id}><div><strong>{item.title}</strong><p>{item.meta}</p></div><button>查看</button></article>)}
          </div>
        </div>
        <div className="ds-parent-card">
          <h2>最新動態</h2>
          <div className="ds-parent-timeline">
            {timeline.map((item) => { const TimelineIcon = item.icon; return <article key={item.title}><span><TimelineIcon size={20} /></span><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>; })}
          </div>
        </div>
      </section>

      <section className="ds-parent-feature-grid">
        {[
          { title: '照片', description: '加入相簿或鼓勵卡', href: '#', icon: Camera },
          { title: '家長錄音', description: '手機直接錄下給孩子的話', href: '#', icon: Mic },
          { title: '影片', description: '保存生活片段', href: '#', icon: Video },
          { title: '發送', description: '推播到孩子平板', href: '#', icon: Send }
        ].map((item) => <FeatureCard key={item.title} {...item} />)}
      </section>
    </div>
  );
}
