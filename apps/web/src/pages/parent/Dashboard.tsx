import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Award,
  Baby,
  BedDouble,
  BookOpen,
  Camera,
  CheckSquare,
  ChevronRight,
  Clock3,
  Heart,
  Mic,
  Plus,
  Share2,
  Sparkles,
  Star,
  Tablet,
  Target,
  Video
} from 'lucide-react';
import { dataRepository } from '../../lib/dataRepository';
import type { LocalDatabaseState, LocalTask, ShareWithMedia } from '../../lib/localTypes';

type Tone = 'blue' | 'green' | 'pink' | 'yellow';

type DashboardActivity = {
  id: string;
  icon: ReactNode;
  title: string;
  meta: string;
  time: string;
};

const tones: Tone[] = ['blue', 'green', 'pink', 'yellow'];

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sameDay(value: string | null | undefined, date = todayKey()) {
  return Boolean(value?.startsWith(date));
}

function formatMinutes(minutes: number) {
  return `${minutes} 分`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function getAge(birthDate: string | null) {
  if (!birthDate) return '未設定生日';
  const birth = new Date(`${birthDate}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayPassed =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!birthdayPassed) age -= 1;
  return `${Math.max(0, age)} 歲`;
}

function taskStatusLabel(status: LocalTask['status']) {
  return ({
    pending: '待完成',
    submitted: '待審核',
    approved: '已完成',
    rejected: '需重做',
    cancelled: '已取消',
    expired: '已逾期'
  } as const)[status];
}

function shareTitle(share: ShareWithMedia) {
  if (share.title) return share.title;
  if (share.caption) return share.caption;
  return ({
    text: '文字分享',
    photo: '照片分享',
    audio: '語音分享',
    video: '影片分享',
    mixed: '混合分享'
  } as const)[share.share_type];
}

function buildLatestActivity(state: LocalDatabaseState): DashboardActivity[] {
  const childName = (childId: string) =>
    state.children.find((child) => child.id === childId)?.display_name ?? '未知孩子';
  const badgeName = (badgeId: string) =>
    state.badges.find((badge) => badge.id === badgeId)?.name ?? '徽章';

  return [
    ...state.tasks.map((task) => ({
      id: `task:${task.id}`,
      icon: <CheckSquare size={18} />,
      title: `${childName(task.child_id)}：${task.title}`,
      meta: `任務 ${taskStatusLabel(task.status)}`,
      time: task.updated_at
    })),
    ...state.shares.filter((share) => !share.deleted_at).map((share) => ({
      id: `share:${share.id}`,
      icon: <Share2 size={18} />,
      title: `${childName(share.child_id)}：${share.title || share.caption || '分享'}`,
      meta: share.status === 'pending_review' ? '分享待審核' : '分享已更新',
      time: share.updated_at
    })),
    ...state.dreams.map((dream) => ({
      id: `dream:${dream.id}`,
      icon: <Target size={18} />,
      title: `${childName(dream.child_id)}：${dream.title}`,
      meta: dream.status === 'completed' ? '夢想完成' : '夢想進度更新',
      time: dream.updated_at
    })),
    ...state.child_badges.map((record) => ({
      id: `badge:${record.id}`,
      icon: <Award size={18} />,
      title: `${childName(record.child_id)} 獲得 ${badgeName(record.badge_id)}`,
      meta: record.note || '徽章紀錄',
      time: record.awarded_at
    })),
    ...state.growth_records.map((record) => ({
      id: `growth:${record.id}`,
      icon: <Baby size={18} />,
      title: `${childName(record.child_id)} 成長紀錄`,
      meta: `${record.height_cm} cm / ${record.weight_kg} kg`,
      time: record.updated_at
    })),
    ...state.screen_time_logs.map((log) => ({
      id: `screen:${log.id}`,
      icon: <Tablet size={18} />,
      title: `${childName(log.child_id)} 平板時間`,
      meta: `${log.minutes_delta >= 0 ? '+' : ''}${log.minutes_delta} 分`,
      time: log.created_at
    }))
  ]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 5);
}

export function Dashboard() {
  const [state, setState] = useState<LocalDatabaseState>(() => dataRepository.getState());

  useEffect(() => dataRepository.subscribe(setState), []);

  const dashboard = useMemo(() => {
    const date = todayKey();
    const activeChildren = state.children.filter((child) => child.status === 'active');
    const childName = (childId: string) =>
      state.children.find((child) => child.id === childId)?.display_name ?? '未知孩子';

    const childCards = activeChildren.map((child, index) => {
      const starBalance = dataRepository.getStarBalance(child.id);
      return {
        child,
        tone: (child.theme_color as Tone | null) ?? tones[index % tones.length],
        stars: starBalance,
        tablet: dataRepository.getScreenTimeBalance(child.id)
      };
    });

    const todayTasks = state.tasks
      .filter((task) => task.task_date === date)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const pendingTasks = state.tasks.filter((task) => task.status === 'submitted');
    const pendingShares = state.shares.filter((share) => share.status === 'pending_review' && !share.deleted_at);
    const pendingDreams = state.dreams.filter((dream) => dream.status === 'pending_approval');
    const shares = dataRepository.listShares();
    const todayShares = shares
      .filter((share) => !share.deleted_at && (sameDay(share.submitted_at, date) || sameDay(share.created_at, date)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const dreams = dataRepository.listDreams(undefined, true);
    const todayDreams = dreams
      .filter((dream) => sameDay(dream.created_at, date) || sameDay(dream.updated_at, date))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const todayStars = state.stars
      .filter((star) => sameDay(star.created_at, date))
      .reduce((total, star) => total + star.amount, 0);
    const todayScreenMinutes = activeChildren
      .map((child) => dataRepository.getScreenTimeBalance(child.id))
      .reduce((total, minutes) => total + minutes, 0);

    const reviews = [
      ...pendingTasks.map((task) => ({
        id: `task:${task.id}`,
        icon: <CheckSquare size={18} />,
        title: task.title,
        meta: `${childName(task.child_id)} 送出任務`,
        action: '審核'
      })),
      ...pendingShares.map((share) => ({
        id: `share:${share.id}`,
        icon: <Share2 size={18} />,
        title: share.title || share.caption || '新的分享',
        meta: `${childName(share.child_id)} 的分享`,
        action: '查看'
      })),
      ...pendingDreams.map((dream) => ({
        id: `dream:${dream.id}`,
        icon: <Target size={18} />,
        title: dream.title,
        meta: `${childName(dream.child_id)} 的夢想`,
        action: '確認'
      }))
    ].slice(0, 5);

    return {
      activeChildren,
      childCards,
      pendingReviewCount: pendingTasks.length + pendingShares.length + pendingDreams.length,
      todayStars,
      todayScreenMinutes,
      todayTasks,
      latestActivity: buildLatestActivity(state),
      todayShares,
      todayDreams,
      reviews,
      childName
    };
  }, [state]);

  return (
    <div className="ph-page">
      <section className="ph-welcome">
        <div>
          <h1>家庭總覽<span> Dashboard</span></h1>
          <p>{state.family_settings.family_name} 的 localStorage 即時資料摘要。</p>
        </div>
        <button type="button"><Plus size={17} /> 新增家庭資料</button>
      </section>

      <section className="ph-stats" aria-label="家庭摘要">
        <article className="is-blue"><small>孩子數</small><strong>{dashboard.activeChildren.length} 位</strong></article>
        <article className="is-pink"><small>待審核</small><strong>{dashboard.pendingReviewCount} 件</strong></article>
        <article className="is-yellow"><small>今日星星</small><strong>{dashboard.todayStars >= 0 ? '+' : ''}{dashboard.todayStars}</strong></article>
        <article className="is-green"><small>今日平板時間</small><strong>{formatMinutes(dashboard.todayScreenMinutes)}</strong></article>
      </section>

      <section className="ph-grid ph-grid-top">
        <article className="ph-card ph-children">
          <CardTitle title="孩子管理連動" action={`${dashboard.activeChildren.length} 位孩子`} />
          <div className="ph-child-grid">
            {dashboard.childCards.length ? dashboard.childCards.map(({ child, tone, stars, tablet }) => (
              <div className={`ph-child is-${tone}`} key={child.id}>
                <div className="ph-child-head">
                  <span>{child.display_name.slice(0, 1)}</span>
                  <div><strong>{child.display_name}</strong><small>{getAge(child.birth_date)}</small></div>
                </div>
                <dl>
                  <div><dt>星星</dt><dd>{stars}</dd></div>
                  <div><dt>今日平板</dt><dd>{formatMinutes(tablet)}</dd></div>
                </dl>
              </div>
            )) : <EmptyLine text="尚未建立孩子資料" />}
          </div>
        </article>

        <article className="ph-card ph-review">
          <CardTitle title="待審核" action={`${dashboard.pendingReviewCount} 件`} />
          <div className="ph-review-list">
            {dashboard.reviews.length ? dashboard.reviews.map((item) => (
              <div key={item.id}>
                <span>{item.icon}</span>
                <section><strong>{item.title}</strong><small>{item.meta}</small></section>
                <button type="button">{item.action}</button>
              </div>
            )) : <EmptyLine text="目前沒有待審核項目" />}
          </div>
        </article>
      </section>

      <section className="ph-grid ph-grid-bottom">
        <article className="ph-card ph-tasks">
          <CardTitle title="今日任務" action={`${dashboard.todayTasks.length} 件`} />
          <div className="ph-task-list">
            {dashboard.todayTasks.length ? dashboard.todayTasks.slice(0, 6).map((task) => (
              <div key={task.id}>
                <span className="ph-task-icon">{taskIcon(task.category)}</span>
                <section>
                  <strong>{task.title}</strong>
                  <small>{dashboard.childName(task.child_id)} · 星星 +{task.reward_stars}</small>
                </section>
                <em>{taskStatusLabel(task.status)}</em>
              </div>
            )) : <EmptyLine text="今天尚未安排任務" />}
          </div>
        </article>

        <article className="ph-card ph-activity">
          <CardTitle title="最新動態" action={`${dashboard.latestActivity.length} 則`} />
          <div>
            {dashboard.latestActivity.length ? dashboard.latestActivity.map((item) => (
              <section key={item.id}>
                <span>{item.icon}</span>
                <div><strong>{item.title}</strong><small>{item.meta} · {formatDateTime(item.time)}</small></div>
              </section>
            )) : <EmptyLine text="尚未有家庭動態" />}
          </div>
        </article>
      </section>

      <section className="ph-actions" aria-label="今日分享與夢想">
        <QuickAction
          icon={<Share2 />}
          title="今日分享"
          text={`${dashboard.todayShares.length} 則 · ${dashboard.todayShares[0] ? shareTitle(dashboard.todayShares[0]) : '尚無分享'}`}
        />
        <QuickAction
          icon={<Target />}
          title="今日夢想"
          text={`${dashboard.todayDreams.length} 個 · ${dashboard.todayDreams[0]?.title ?? '尚無夢想更新'}`}
        />
        <QuickAction icon={<Camera />} title="分享素材" text={`${state.share_media.length} 個媒體檔`} />
        <QuickAction icon={<Heart />} title="成長紀錄" text={`${state.growth_records.length} 筆紀錄`} />
      </section>
    </div>
  );
}

function CardTitle({ title, action }: { title: string; action: string }) {
  return (
    <header className="ph-card-title">
      <h2>{title}</h2>
      <button type="button">{action}<ChevronRight size={13} /></button>
    </header>
  );
}

function QuickAction({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <button className="ph-action" type="button">
      <span>{icon}</span>
      <div><strong>{title}</strong><small>{text}</small></div>
    </button>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p style={{ margin: 0, color: '#7c7770', fontSize: 12 }}>{text}</p>;
}

function taskIcon(category: LocalTask['category']) {
  return ({
    daily: <BedDouble size={20} />,
    habit: <BookOpen size={20} />,
    household: <CheckSquare size={20} />,
    challenge: <Sparkles size={20} />
  } as const)[category];
}
