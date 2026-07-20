import type { ReactNode } from 'react';
import { Award, CheckCircle2, MoonStar, Sparkles, Star, Trophy } from 'lucide-react';
import { resolveCurrentChildId } from '../../lib/childSession';
import { starRepository } from '../../lib/starRepository';
import type { LocalChildBadge } from '../../lib/localTypes';
import { useLocalDataState } from '../../lib/useLocalData';

type TimelineItem = {
  id: string;
  icon: string;
  title: string;
  detail: string;
  date: string;
  tone: 'blue' | 'green' | 'pink' | 'yellow';
};

export function ChildHonorWall() {
  const state = useLocalDataState();
  const currentChildId = resolveCurrentChildId(state);
  const activeChild = currentChildId
    ? state.children.find((child) => child.id === currentChildId && child.status === 'active') ?? null
    : null;
  const childBadges = activeChild
    ? state.child_badges
        .filter((record) => record.child_id === activeChild.id)
        .sort((a, b) => b.awarded_at.localeCompare(a.awarded_at))
    : [];
  const starTotal = activeChild ? starRepository.getStarBalance(activeChild.id) : 0;
  const completedTasks = activeChild
    ? state.tasks.filter((task) => task.child_id === activeChild.id && task.status === 'approved')
    : [];
  const completedDreams = activeChild
    ? state.dreams.filter((dream) => dream.child_id === activeChild.id && dream.status === 'completed')
    : [];
  const badgeById = (badgeId: string) => state.badges.find((badge) => badge.id === badgeId);
  const timeline: TimelineItem[] = [
    ...childBadges.map((record, index) => {
      const badge = badgeById(record.badge_id);
      return {
        id: record.id,
        icon: badge?.icon ?? '★',
        title: `獲得徽章：${badge?.name ?? '徽章'}`,
        detail: record.note || badge?.description || '家長送給你的鼓勵。',
        date: record.awarded_at,
        tone: (['pink', 'yellow', 'green', 'blue'] as const)[index % 4]
      };
    }),
    ...completedDreams.map((dream) => ({
      id: dream.id,
      icon: '✦',
      title: `完成願望：${dream.title}`,
      detail: dream.description || '完成了一個重要目標。',
      date: dream.completed_at ?? dream.updated_at,
      tone: 'green' as const
    })),
    ...completedTasks.slice(0, 6).map((task) => ({
      id: task.id,
      icon: '✓',
      title: `完成任務：${task.title}`,
      detail: `獲得 ${task.reward_stars} 顆星星`,
      date: task.reviewed_at ?? task.updated_at,
      tone: 'blue' as const
    }))
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="child-honor-page">
      <header className="child-honor-hero">
        <div>
          <span><Trophy size={32} /></span>
          <small>榮譽牆</small>
          <h1>{activeChild ? `${activeChild.display_name} 的成就` : '尚未完成孩子登入'}</h1>
          <p>這裡只顯示目前已綁定孩子的徽章、任務與願望成果。</p>
        </div>
        <Sparkles size={54} />
      </header>

      {activeChild ? (
        <div className="child-honor-switcher">
          <button className="is-active" type="button">
            {activeChild.display_name.slice(0, 1)}
            <span>{activeChild.display_name}</span>
          </button>
        </div>
      ) : null}

      <section className="child-honor-stats">
        <Stat icon={<Award />} label="徽章" value={`${childBadges.length} 個`} tone="pink" />
        <Stat icon={<Star />} label="星星" value={`${starTotal} 顆`} tone="yellow" />
        <Stat icon={<CheckCircle2 />} label="完成任務" value={`${completedTasks.length} 件`} tone="blue" />
        <Stat icon={<MoonStar />} label="完成願望" value={`${completedDreams.length} 件`} tone="green" />
      </section>

      <section className="child-honor-grid">
        <article className="child-honor-badges">
          <header><h2>徽章</h2><small>{childBadges.length} 個</small></header>
          <div>
            {childBadges.length
              ? childBadges.map((record) => (
                  <BadgeTile
                    key={record.id}
                    record={record}
                    icon={badgeById(record.badge_id)?.icon ?? '★'}
                    name={badgeById(record.badge_id)?.name ?? '徽章'}
                  />
                ))
              : <EmptyState text="還沒有徽章。" />}
          </div>
        </article>

        <article className="child-honor-timeline">
          <header><h2>最近成果</h2><small>{timeline.length} 筆</small></header>
          {timeline.length
            ? timeline.map((item) => (
                <section className={`is-${item.tone}`} key={`${item.id}-${item.title}`}>
                  <span>{item.icon}</span>
                  <div><strong>{item.title}</strong><p>{item.detail}</p><time>{formatHonorDate(item.date)}</time></div>
                </section>
              ))
            : <EmptyState text="完成任務或獲得徽章後會出現在這裡。" />}
        </article>
      </section>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return <article className={`is-${tone}`}><span>{icon}</span><small>{label}</small><strong>{value}</strong></article>;
}

function BadgeTile({ record, icon, name }: { record: LocalChildBadge; icon: string; name: string }) {
  return (
    <section>
      <span>{icon}</span>
      <strong>{name}</strong>
      <small>{formatHonorDate(record.awarded_at)}</small>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="child-honor-empty"><span>★</span><p>{text}</p></div>;
}

function formatHonorDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
