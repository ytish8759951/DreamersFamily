import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  BookOpen,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Heart,
  Image,
  Mail,
  Mic,
  MoreHorizontal,
  Pencil,
  Play,
  Search,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  Video
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { LocalDreamCover, useLocalDreamCoverUrl } from '../../components/LocalDreamCover';
import { LocalShareAlbum } from '../../components/LocalShareAlbum';
import { LocalShareMedia as LocalShareMediaView } from '../../components/LocalShareMedia';
import { LocalTaskMedia } from '../../components/LocalTaskMedia';
import { resolveCurrentChildId } from '../../lib/childSession';
import { dataModeBadgeLabel, dataRepository } from '../../lib/dataRepository';
import { useDreamCoverMigration } from '../../lib/dreamCoverMigration';
import { getErrorDiagnostics, getErrorMessage } from '../../lib/errorDiagnostics';
import { captureFirstSelectedFile, clearFileInput } from '../../lib/fileInput';
import { growthRepository } from '../../lib/growthRepository';
import { compressImageFile } from '../../lib/imageCompression';
import { logVideoStorageDiagnostics } from '../../lib/localVideoStore';
import { shareRepository, type ShareMediaChunk, type ShareRecordedMedia } from '../../lib/shareRepository';
import { mailboxRepository } from '../../lib/mailboxRepository';
import { piggyRepository } from '../../lib/piggyRepository';
import { starRepository } from '../../lib/starRepository';
import { tabletRepository } from '../../lib/tabletRepository';
import { taskCompletionRepository } from '../../lib/taskCompletionRepository';
import { taskRepository } from '../../lib/taskRepository';
import type {
  DreamWithBalance,
  LocalChildBadge,
  LocalDatabaseState,
  LocalMailboxMessage,
  LocalShare,
  LocalShareMedia,
  LocalSpecialDay,
  LocalTask,
  ShareWithMedia
} from '../../lib/localTypes';
import { getBirthdaySpecialDays } from '../../lib/specialDays';
import { getChildHistoryTasks, getChildTodayTasks, getTodayTaskDate } from '../../lib/taskRules';
import { useLocalDataState } from '../../lib/useLocalData';

type ChildPageProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  mode: 'home' | 'tasks' | 'share' | 'dreams' | 'mailbox';
};

type VoiceSource = { text: string; audioUrl?: string };

const asset = (name: string) => `/design-assets/${name}`;

function speakSlowly(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-TW';
  utterance.rate = 0.72;
  utterance.pitch = 1.12;
  window.speechSynthesis.speak(utterance);
}

function playVoice({ text, audioUrl }: VoiceSource) {
  if (!audioUrl) return speakSlowly(text);
  new Audio(audioUrl).play().catch(() => speakSlowly(text));
}

export function ChildPage({ mode }: ChildPageProps) {
  if (mode === 'home') return <HomePage />;
  if (mode === 'tasks') return <TaskPage />;
  if (mode === 'share') return <SharePage />;
  if (mode === 'dreams') return <DreamPage />;
  return <MailboxPage />;
}

function ChildPageHeader({ emoji, title, subtitle, accent }: { emoji: string; title: string; subtitle: string; accent?: string }) {
  return (
    <header className="v1-page-header">
      <div>
        <h1><span>{emoji}</span>{title}{accent ? <i>{accent}</i> : null}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

function HomePage() {
  useDreamCoverMigration();
  const localState = useLocalDataState();
  const currentChildId = resolveCurrentChildId(localState);
  const selectedChild = currentChildId
    ? localState.children.find((child) => child.id === currentChildId && child.status === 'active')
    : null;
  const childName = selectedChild?.display_name ?? '小小夢想家';
  const childShares = selectedChild
    ? buildChildShares(localState).filter((share) => share.child_id === selectedChild.id).slice(0, 3)
    : [];
  const piggySavings = selectedChild
    ? piggyRepository.getPiggyBankSummary(selectedChild.id).currentSavings
    : 0;
  const totalStars = selectedChild ? starRepository.getStarBalance(selectedChild.id) : 0;
  const remainingScreenMinutes = selectedChild
    ? tabletRepository.getTodayScreenTimeByChild(selectedChild.id).remainingMinutes
    : 0;
  const latestGrowth = selectedChild
    ? growthRepository.getLatestGrowthRecordByChild(selectedChild.id)
    : null;
  const specialDays = selectedChild ? getHomeSpecialDays(localState, selectedChild.id) : [];
  const hasMoreSpecialDays = specialDays.length > 3;
  const visibleSpecialDays = specialDays.slice(0, 3);

  return (
    <div className="v1-page v1-home v2-home-page">
      <header className="v1-brand-header">
        <h1>小小夢想家 Family <span>✦</span></h1>
        <p>系統總覽與首頁定稿</p>
      </header>

      <button className="v1-home-hero" onClick={() => playVoice({ text: `哈囉${childName}！今天完成什麼冒險了呢？` })}>
        <div className="v1-bunny-card">🐰</div>
        <div className="v1-home-copy">
          <small>小小夢想家 Family</small>
          <h2>哈囉{childName}！</h2>
          <p>今天完成什麼冒險了呢？</p>
        </div>
        <span className="v1-listen"><Volume2 size={19} fill="currentColor" /> 聽兔兔</span>
      </button>

      <Link to="/child/share" className="v1-panel v1-recent-panel v1-home-link-panel">
        <SectionHeading icon={Camera} title="最近分享" action="查看更多" actionHref="/child/share" />
        <div className="v1-recent-grid">
          {childShares.length ? (
            childShares.map((share) => <LocalRecentCard key={share.id} share={share} />)
          ) : (
            <ChildTaskEmpty text={selectedChild ? '還沒有分享紀錄' : '請家長先選擇目前孩子'} />
          )}
        </div>
      </Link>

      <Link to="/child/growth" className="v1-panel v1-growth-panel v1-home-link-panel">
        <SectionHeading title="成長紀錄" accent="🌱" action="查看更多" actionHref="/child/growth" />
        {latestGrowth ? (
          <div className="v1-growth-grid">
            <Metric icon="🧍‍♀️" label="身高" value={formatMetric(latestGrowth.height_cm)} unit="cm" note={`紀錄日期 ${formatChildDate(latestGrowth.date)}`} tone="blue" />
            <Metric icon="⚖️" label="體重" value={formatMetric(latestGrowth.weight_kg)} unit="kg" note={`紀錄日期 ${formatChildDate(latestGrowth.date)}`} tone="green" />
            <Metric icon="📖" label="閱讀" value={String(latestGrowth.reading_count)} unit="本" note={latestGrowth.note || '最新閱讀紀錄'} tone="yellow" />
          </div>
        ) : (
          <ChildTaskEmpty text={selectedChild ? '尚未紀錄身高、體重與閱讀' : '請家長先選擇目前孩子'} />
        )}
      </Link>

      <section className="v1-home-stats v2-home-stats">
        <Link to="/child/dreams" className="v1-stat-link">
          <StatCard emoji="🫙" title="撲滿總金額" value={formatChildMoney(piggySavings)} unit="" note="目前已存起來的零用錢" tone="pink" />
        </Link>
        <StatCard emoji="⭐" title="冒險星星" value={String(totalStars)} unit="顆" note="家長審核後會自動累積。" tone="yellow" />
        <StatCard emoji="⏱️" title="平板時間" value={String(remainingScreenMinutes)} unit="分鐘" note="目前存摺餘額" tone="blue" />
      </section>
      <Link to="/child/special-days" className="child-home-special-days">
        <header>
          <h2>特殊日子</h2>
          {hasMoreSpecialDays ? <span>查看全部 <ChevronRight size={16} /></span> : null}
        </header>
        <div>
          {visibleSpecialDays.length ? (
            visibleSpecialDays.map((day) => <HomeSpecialDayRow key={day.id} day={day} />)
          ) : (
            <ChildTaskEmpty text={selectedChild ? '尚未設定生日或特殊日子' : '請家長先選擇目前孩子'} />
          )}
        </div>
      </Link>
    </div>
  );
}

function SectionHeading({ icon: Icon, title, accent, action, actionHref, actionOnClick }: { icon?: LucideIcon; title: string; accent?: string; action?: string; actionHref?: string; actionOnClick?: () => void }) {
  return (
    <div className="v1-section-heading">
      <h2>{Icon ? <Icon size={22} /> : null}{title}{accent ? <span>{accent}</span> : null}</h2>
      {action && actionHref ? <Link to={actionHref}>{action} <ChevronRight size={17} /></Link> : null}
      {action && !actionHref ? <button type="button" onClick={actionOnClick}>{action} <ChevronRight size={17} /></button> : null}
    </div>
  );
}

function Metric({ icon, label, value, unit, note, tone }: { icon: string; label: string; value: string; unit: string; note: string; tone: string }) {
  return (
    <article className={`v1-metric v1-tone-${tone}`}>
      <span>{icon}</span>
      <div><strong>{label}</strong><p>{value}<small>{unit}</small></p><em>{note}</em></div>
      <ChevronRight className="v1-mobile-chevron" size={18} />
    </article>
  );
}

function StatCard({ emoji, title, value, unit, note, tone }: { emoji: string; title: string; value: string; unit: string; note: string; tone: string }) {
  return (
    <article className={`v1-stat v1-tone-${tone}`}>
      <span>{emoji}</span>
      <div><strong>{title}</strong><p>{value}{unit ? <small>{unit}</small> : null}</p><em>{note}</em></div>
    </article>
  );
}

type HomeSpecialDay = {
  id: string;
  title: string;
  date: string;
  type: LocalSpecialDay['type'];
  daysLeft: number;
  isBirthday?: boolean;
};

function HomeSpecialDayRow({ day }: { day: HomeSpecialDay }) {
  return (
    <section className="child-home-special-day-row">
      <span>{homeSpecialDayIcon(day.type)}</span>
      <strong>{day.isBirthday ? '生日' : day.title}</strong>
      <time>{formatChildDate(day.date)}</time>
      {day.daysLeft >= 0 ? <em>倒數 {day.daysLeft} 天</em> : null}
    </section>
  );
}

function getLatestChildBadge(state: LocalDatabaseState, childId: string): LocalChildBadge | null {
  return state.child_badges
    .filter((badge) => badge.child_id === childId)
    .sort((a, b) => b.awarded_at.localeCompare(a.awarded_at))[0] ?? null;
}

function formatMetric(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function TaskPage() {
  const localState = useLocalDataState();
  const [redeemStars, setRedeemStars] = useState('1');
  const [redeemMessage, setRedeemMessage] = useState('');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [flyingTaskId, setFlyingTaskId] = useState<string | null>(null);
  const [redeemHistoryPage, setRedeemHistoryPage] = useState(1);
  const [taskSnapshotReady, setTaskSnapshotReady] = useState(false);
  const completionTimerRef = useRef<number | null>(null);
  const flyingTimerRef = useRef<number | null>(null);
  const currentChildId = resolveCurrentChildId(localState);
  const selectedChild = currentChildId
    ? localState.children.find((child) => child.id === currentChildId && child.status === 'active')
    : null;
  const childTasks = selectedChild
    ? localState.tasks.filter((task) => task.child_id === selectedChild.id)
    : [];
  const todayAdventureTasks = sortTodayTasks(getChildTodayTasks(childTasks));
  const todayPendingTasks = todayAdventureTasks.filter((task) => task.status === 'pending' || task.status === 'rejected');
  const visibleTasks = todayPendingTasks.slice(0, 8);
  const historyTasks = getChildHistoryTasks(childTasks).filter((task) => ['submitted', 'approved'].includes(task.status));
  const redeemLogs = selectedChild
    ? localState.screen_time_logs
        .filter((log) => log.child_id === selectedChild.id && log.type === 'redeem')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    : [];
  const completedToday = todayAdventureTasks.length - todayPendingTasks.length;
  const totalStars = selectedChild ? starRepository.getStarBalance(selectedChild.id) : 0;
  const pageSize = 5;
  const visibleRedeemHistory = redeemLogs.slice((redeemHistoryPage - 1) * pageSize, redeemHistoryPage * pageSize);
  const redeemHistoryPages = Math.max(1, Math.ceil(redeemLogs.length / pageSize));
  const redeemAmount = Math.max(0, Number(redeemStars) || 0);
  const redeemMinutes = redeemAmount;
  const submitRedeem = (event: FormEvent) => {
    event.preventDefault();
    setRedeemMessage('');
    if (!selectedChild) return;
    if (!Number.isInteger(redeemAmount) || redeemAmount <= 0) {
      setRedeemMessage('請輸入要兌換的星星數量');
      return;
    }
    if (totalStars < redeemAmount) {
      setRedeemMessage('星星不足，無法兌換');
      return;
    }
    try {
      taskRepository.redeemStarsForScreenTime(
        selectedChild.id,
        getTodayTaskDate(),
        redeemAmount,
        `孩子申請兌換 ${redeemAmount} 顆星星為 ${redeemMinutes} 分鐘平板時間`
      );
      setRedeemMessage(`已兌換 ${redeemMinutes} 分鐘平板時間`);
      setRedeemStars('1');
      setRedeemHistoryPage(1);
    } catch (caught) {
      setRedeemMessage(caught instanceof Error && caught.message.includes('Not enough stars') ? '星星不足，無法兌換' : caught instanceof Error ? caught.message : '兌換失敗');
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => setTaskSnapshotReady(true), 450);
    return () => window.clearTimeout(timer);
  }, [localState.updated_at]);
  useEffect(() => {
    return () => {
      if (completionTimerRef.current) window.clearTimeout(completionTimerRef.current);
      if (flyingTimerRef.current) window.clearTimeout(flyingTimerRef.current);
    };
  }, []);
  const completeTask = (task: LocalTask) => {
    if (task.status !== 'pending' && task.status !== 'rejected') return;
    if (completingTaskId) return;
    setCompletingTaskId(task.id);
    setFlyingTaskId(task.id);
    if (completionTimerRef.current) window.clearTimeout(completionTimerRef.current);
    if (flyingTimerRef.current) window.clearTimeout(flyingTimerRef.current);
    completionTimerRef.current = window.setTimeout(() => {
      try {
        taskCompletionRepository.completeTask(task.id, '孩子已完成任務');
      } finally {
        setCompletingTaskId(null);
        flyingTimerRef.current = window.setTimeout(() => setFlyingTaskId(null), 160);
      }
    }, 360);
  };
  return (
    <div className="v1-page v2-task-page">
      <ChildPageHeader emoji="⭐" title="任務" subtitle="完成今天的冒險，獲得冒險星星。" />
      <div className="v1-task-layout">
        <div className="v1-task-content">
          <section className="child-task-carousel-section">
            <SectionHeading title={taskSnapshotReady ? `今日冒險 (${completedToday}/${todayAdventureTasks.length})` : '今日冒險（載入中）'} accent="⭐" />
            <div className="v1-task-list child-task-grid" aria-label="今日冒險任務">
              {!selectedChild ? (
                <ChildTaskEmpty text="請家長先在孩子管理選擇目前孩子" />
              ) : !taskSnapshotReady ? (
                <ChildTaskEmpty text="任務載入中，請稍候" />
              ) : visibleTasks.length ? (
                visibleTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isCompleting={completingTaskId === task.id}
                    isFlying={flyingTaskId === task.id}
                    onComplete={() => completeTask(task)}
                  />
                ))
              ) : (
                <ChildTaskEmpty text="今天目前沒有待完成任務" />
              )}
            </div>
          </section>

          <section className="v1-panel child-task-history child-completed-task-history">
            <SectionHeading title="完成的任務" accent="⭐" />
            {historyTasks.length ? (
              <div className="child-completed-task-grid child-task-carousel" aria-label="完成的任務">
                {historyTasks.map((task) => <CompletedTaskCard key={task.id} task={task} />)}
              </div>
            ) : <ChildTaskEmpty text="家長審核通過後，完成紀錄會出現在這裡" />}
          </section>

          <section className="v1-panel child-task-history child-screen-redeem-history">
            <SectionHeading title="平板時間兌換紀錄" accent="⏱" />
            {redeemLogs.length ? (
              <div>
                {visibleRedeemHistory.map((log) => (
                  <article key={log.id}>
                    <span>⏱</span>
                    <div><strong>使用 {log.starsUsed ?? 0} 顆星星</strong><small>{formatChildTaskDate(log.created_at)}</small></div>
                    <b>{Math.abs(log.minutes ?? log.minutes_delta)} 分鐘</b>
                    <time>已兌換</time>
                  </article>
                ))}
                <HistoryPagination
                  currentPage={redeemHistoryPage}
                  totalPages={redeemHistoryPages}
                  onPageChange={setRedeemHistoryPage}
                />
              </div>
            ) : <ChildTaskEmpty text="還沒有平板時間兌換紀錄" />}
          </section>
        </div>
        <aside className="v1-task-side">
          <article className="v2-task-streak"><small>冒險星星</small><strong>⭐ {totalStars}<em>顆</em></strong><p>家長審核任務後會自動增加。</p></article>
          <article className="v2-task-reward child-screen-redeem-card">
            <small>申請兌換平板時間</small>
            <p>目前星星：<strong>{totalStars} 顆</strong></p>
            <p>兌換比例：1 顆星星 = 1 分鐘</p>
            <form onSubmit={submitRedeem}>
              <label>
                我要兌換幾顆星星
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={redeemStars}
                  onChange={(event) => setRedeemStars(event.target.value)}
                />
              </label>
              <output>可兌換 {redeemMinutes} 分鐘</output>
              <button type="submit" disabled={!selectedChild}>申請兌換</button>
            </form>
            {redeemMessage ? <em className={redeemMessage.includes('不足') || redeemMessage.includes('失敗') ? 'is-error' : ''}>{redeemMessage}</em> : null}
          </article>
        </aside>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  isCompleting,
  isFlying,
  onComplete
}: {
  task: LocalTask;
  isCompleting: boolean;
  isFlying: boolean;
  onComplete: () => void;
}) {
  return (
    <article className={`v1-task-row child-task-card${isCompleting ? ' is-completing' : ''}`}>
      <span className={`child-task-category-badge v1-tone-${childTaskTone(task.category)}`}>{childTaskBadgeLabel(task.category)}</span>
      <div className="v1-task-media-wrap">
        <LocalTaskMedia
          mediaId={task.thumbnail_media_id ?? task.task_image_media_id ?? null}
          alt={task.title || '任務圖片'}
          fallback={childTaskPlaceholderIcon()}
          className={`v1-task-media v1-tone-${childTaskTone(task.category)}`}
        />
      </div>
      <div className="v1-task-copy">
        <strong>{task.title || '任務'}</strong>
        {task.status === 'rejected' ? <small className="child-task-rejected">請重新完成後送出</small> : null}
      </div>
      <em>+{task.reward_stars} ⭐</em>
      <button
        aria-label="打勾完成"
        className="child-task-complete-button"
        onClick={onComplete}
      >
        <span className="child-task-check-icon"><CheckCircle2 size={19} /></span>
        <span>打勾完成</span>
      </button>
      {isCompleting ? <span className="child-task-floating-reward">+{task.reward_stars}</span> : null}
      {isFlying ? <span className="child-task-flying-star" aria-hidden="true">⭐</span> : null}
    </article>
  );
}

function CompletedTaskCard({ task }: { task: LocalTask }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const mediaId = task.thumbnail_media_id ?? task.task_image_media_id ?? null;
  return (
    <>
      <article className="child-completed-task-card">
        <button type="button" className="child-completed-task-image-button" aria-label="查看完成任務圖片" onClick={() => setPreviewOpen(true)}>
          <LocalTaskMedia
            mediaId={mediaId}
            alt={task.title || '任務圖片'}
            fallback={childTaskPlaceholderIcon()}
            className={`child-completed-task-media v1-tone-${childTaskTone(task.category)}`}
          />
        </button>
      </article>
      {previewOpen ? (
        <div className="child-completed-task-lightbox" role="dialog" aria-modal="true" onClick={() => setPreviewOpen(false)}>
          <button type="button" aria-label="關閉圖片" onClick={() => setPreviewOpen(false)}>×</button>
          <LocalTaskMedia
            mediaId={mediaId}
            alt={task.title || '任務圖片'}
            fallback={childTaskPlaceholderIcon()}
            className={`child-completed-task-lightbox-media v1-tone-${childTaskTone(task.category)}`}
          />
        </div>
      ) : null}
    </>
  );
}

function ChildTaskEmpty({ text }: { text: string }) {
  return <div className="child-task-empty"><span>🐰</span><p>{text}</p></div>;
}

function HistoryPagination({
  currentPage,
  totalPages,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="child-history-pagination">
      <button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>上一頁</button>
      <span>{currentPage} / {totalPages}</span>
      <button type="button" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>下一頁</button>
    </nav>
  );
}

function childTaskTone(category: LocalTask['category']) {
  return ({ daily: 'blue', habit: 'yellow', household: 'pink', challenge: 'green' } as const)[category];
}

function childTaskPlaceholderIcon() {
  return '⭐';
}

function childTaskBadgeLabel(category: LocalTask['category']) {
  return ({ daily: '每日', habit: '習慣', household: '家事', challenge: '挑戰' } as const)[category];
}

function formatChildTaskDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function sortTodayTasks(tasks: LocalTask[]) {
  return [...tasks].sort((a, b) => {
    const aDone = ['submitted', 'approved'].includes(a.status);
    const bDone = ['submitted', 'approved'].includes(b.status);
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a.task_date.localeCompare(b.task_date) || a.created_at.localeCompare(b.created_at);
  });
}

type ShareFormMode = LocalShareMedia['media_type'];
type ChildShareFilter = 'all' | ShareFormMode;

type ChildRecordedMedia = ShareRecordedMedia;

type SelectedSharePhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

const SHARE_VIDEO_MAX_BYTES = 300 * 1024 * 1024;
const SHARE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const SHARE_PHOTO_MAX_COUNT = 10;

function SharePage() {
  const localState = useLocalDataState();
  const [formMode, setFormMode] = useState<ShareFormMode | null>(null);
  const [formError, setFormError] = useState('');
  const [isSubmittingShare, setIsSubmittingShare] = useState(false);
  const [shareFilter, setShareFilter] = useState<ChildShareFilter>('all');
  const [redeemStars, setRedeemStars] = useState('1');
  const [redeemMessage, setRedeemMessage] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<ShareMediaChunk[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordingTokenRef = useRef(0);
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedSharePhoto[]>([]);
  const [shareUploadStatus, setShareUploadStatus] = useState<'idle' | 'preparing' | 'uploading' | 'success' | 'error'>('idle');
  const [shareUploadProgress, setShareUploadProgress] = useState('');
  const cameraVideoInputRef = useRef<HTMLInputElement | null>(null);
  const libraryVideoInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedVideoPreviewUrl, setSelectedVideoPreviewUrl] = useState<string | null>(null);
  const [videoSelectionSource, setVideoSelectionSource] = useState<'camera' | 'library' | null>(null);
  const [sharePageIndex, setSharePageIndex] = useState(1);
  const galleryPagerRef = useRef<HTMLDivElement | null>(null);
  const [shareForm, setShareForm] = useState({
    title: '',
    caption: '',
    photos: [] as File[],
    file: null as File | null,
    recording: null as ChildRecordedMedia | null,
    recording_accepted: false,
    is_recording: false,
    recording_seconds: 0
  });
  const currentChildId = resolveCurrentChildId(localState);
  const selectedChild = currentChildId
    ? localState.children.find((child) => child.id === currentChildId && child.status === 'active')
    : null;
  const totalStars = selectedChild ? starRepository.getStarBalance(selectedChild.id) : 0;
  const childShares = useMemo(
    () =>
      selectedChild
        ? buildChildShares(localState).filter((share) => share.child_id === selectedChild.id)
        : [],
    [localState, selectedChild]
  );
  const shareRewards = useMemo(() => {
    const rewards = new Map<string, number>();
    localState.stars
      .filter((star) => star.transaction_type === 'share_reward' && star.share_id && (!selectedChild || star.child_id === selectedChild.id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach((star) => {
        if (star.share_id && !rewards.has(star.share_id)) rewards.set(star.share_id, Math.max(0, star.amount));
      });
    return rewards;
  }, [localState.stars, selectedChild]);
  const filteredShares = childShares.filter((share) => shareFilter === 'all' || share.share_type === shareFilter);
  const shareFilters = [
    { value: 'all' as const, label: '全部', count: childShares.length },
    { value: 'photo' as const, label: '照片', count: childShares.filter((share) => share.share_type === 'photo').length },
    { value: 'audio' as const, label: '語音', count: childShares.filter((share) => share.share_type === 'audio').length },
    { value: 'video' as const, label: '影片', count: childShares.filter((share) => share.share_type === 'video').length }
  ];
  const redeemAmount = Math.max(0, Number(redeemStars) || 0);
  const redeemMinutes = redeemAmount;
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filteredShares.length / pageSize));
  const safePageIndex = Math.min(sharePageIndex, totalPages);
  const visibleShares = filteredShares.slice((safePageIndex - 1) * pageSize, safePageIndex * pageSize);
  useEffect(() => {
    setSharePageIndex(1);
  }, [selectedChild?.id, shareFilter]);
  const openShareForm = (mode: ShareFormMode) => {
    stopActiveShareRecording(false);
    clearSelectedPhotoPreview();
    clearFileInput(photoInputRef.current);
    clearSelectedVideoPreview();
    clearShareVideoInputs();
    setShareUploadStatus('idle');
    setShareUploadProgress('');
    setFormMode(mode);
    setShareForm({
      title: '',
      caption: '',
      photos: [],
      file: null,
      recording: null,
      recording_accepted: false,
      is_recording: false,
      recording_seconds: 0
    });
    setFormError('');
  };
  const jumpToGalleryPager = () => {
    galleryPagerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const submitRedeem = (event: FormEvent) => {
    event.preventDefault();
    setRedeemMessage('');
    if (!selectedChild) return;
    if (!Number.isInteger(redeemAmount) || redeemAmount <= 0) {
      setRedeemMessage('請輸入要兌換的星星數量');
      return;
    }
    if (totalStars < redeemAmount) {
      setRedeemMessage('星星不足，無法兌換');
      return;
    }
    try {
      taskRepository.redeemStarsForScreenTime(
        selectedChild.id,
        getTodayTaskDate(),
        redeemAmount,
        `孩子申請兌換 ${redeemAmount} 顆星星為 ${redeemMinutes} 分鐘平板時間`
      );
      setRedeemMessage(`已兌換 ${redeemMinutes} 分鐘平板時間`);
      setRedeemStars('1');
    } catch (caught) {
      setRedeemMessage(caught instanceof Error && caught.message.includes('Not enough stars') ? '星星不足，無法兌換' : caught instanceof Error ? caught.message : '兌換失敗');
    }
  };
  const closeShareForm = () => {
    stopActiveShareRecording(false);
    clearSelectedPhotoPreview();
    clearFileInput(photoInputRef.current);
    clearSelectedVideoPreview();
    clearShareVideoInputs();
    setShareUploadStatus('idle');
    setShareUploadProgress('');
    setFormMode(null);
    setFormError('');
  };
  const clearRecordingTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const stopRecordingStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };
  const clearRecordingPreviewUrl = () => {
    setRecordingPreviewUrl((current) => {
      shareRepository.releasePreviewUrl(current);
      return null;
    });
  };
  const clearSelectedVideoPreview = () => {
    setSelectedVideoPreviewUrl((current) => {
      shareRepository.releasePreviewUrl(current);
      return null;
    });
    setVideoSelectionSource(null);
  };
  const clearSelectedPhotoPreview = () => {
    setSelectedPhotos((current) => {
      current.forEach((item) => shareRepository.releasePreviewUrl(item.previewUrl));
      return [];
    });
    setShareForm((current) => ({ ...current, photos: [] }));
  };
  const clearShareVideoInputs = () => {
    clearFileInput(cameraVideoInputRef.current);
    clearFileInput(libraryVideoInputRef.current);
  };
  function stopActiveShareRecording(saveRecording = true) {
    clearRecordingTimer();
    recordingTokenRef.current += saveRecording ? 0 : 1;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      stopRecordingStream();
      recorderRef.current = null;
      chunksRef.current = [];
      if (!saveRecording) {
        setShareForm((current) => ({
          ...current,
          is_recording: false,
          recording_seconds: 0
        }));
      }
    }
  }
  const resetShareRecording = () => {
    stopActiveShareRecording(false);
    clearRecordingPreviewUrl();
    setShareForm((current) => ({
      ...current,
      recording: null,
      recording_accepted: false,
      is_recording: false,
      recording_seconds: 0
    }));
    setFormError('');
  };
  const startShareAudioRecording = async () => {
    setFormError('');
    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function' ||
      typeof window.MediaRecorder === 'undefined'
    ) {
      setFormError('目前瀏覽器不支援錄音功能');
      return;
    }
    try {
      stopActiveShareRecording(false);
      clearRecordingPreviewUrl();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const selectedMimeType = getShareAudioRecordingMimeType();
      const recorder = selectedMimeType ? new MediaRecorder(stream, { mimeType: selectedMimeType }) : new MediaRecorder(stream);
      const token = recordingTokenRef.current + 1;
      recordingTokenRef.current = token;
      recorderRef.current = recorder;
      chunksRef.current = [];
      console.info('[child/share] recording started', {
        mode: 'audio',
        selectedMimeType,
        'recorder.mimeType': recorder.mimeType
      });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        console.error('[child/share] recorder error', event);
      };
      recorder.onstop = () => {
        clearRecordingTimer();
        stopRecordingStream();
        recorderRef.current = null;
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (recordingTokenRef.current !== token) return;
        const fallbackType = 'audio/webm';
        const mediaMimeType = recorder.mimeType || selectedMimeType || fallbackType;
        const recording = shareRepository.createRecordedMedia({
          chunks,
          mimeType: mediaMimeType,
          mediaType: 'audio',
          fileName: `child-share-recording-${Date.now()}.${getShareRecordingExtension(mediaMimeType)}`,
          durationSeconds: shareForm.recording_seconds
        });
        console.info('[child/share] recording completed', {
          mode: 'audio',
          selectedMimeType,
          'recorder.mimeType': recorder.mimeType,
          'chunks.length': chunks.length,
          'blob.size': recording.file_size_bytes,
          'blob.type': recording.mime_type
        });
        if (recording.file_size_bytes === 0) {
          setFormError('錄音失敗，沒有錄到聲音資料，請重新錄音。');
          setShareForm((current) => ({
            ...current,
            recording: null,
            recording_accepted: false,
            is_recording: false,
            recording_seconds: 0
          }));
          clearRecordingPreviewUrl();
          return;
        }
        setRecordingPreviewUrl((current) => {
          shareRepository.releasePreviewUrl(current);
          return recording.preview_url;
        });
        setShareForm((current) => ({
          ...current,
          recording: { ...recording, duration_seconds: current.recording_seconds },
          recording_accepted: false,
          is_recording: false
        }));
      };
      recorder.start();
      setShareForm((current) => ({
        ...current,
        recording: null,
        recording_accepted: false,
        is_recording: true,
        recording_seconds: 0
      }));
      timerRef.current = window.setInterval(() => {
        setShareForm((current) => ({
          ...current,
          recording_seconds: current.is_recording ? current.recording_seconds + 1 : current.recording_seconds
        }));
      }, 1000);
    } catch (caught) {
      stopActiveShareRecording(false);
      const errorName = caught instanceof DOMException ? caught.name : '';
      console.error('[child/share] recording start failed', caught);
      setFormError(['NotAllowedError', 'PermissionDeniedError'].includes(errorName)
        ? '請允許麥克風權限後再錄音。'
        : '錄音失敗，請稍後再試。');
    }
  };
  useEffect(() => () => {
    stopActiveShareRecording(false);
    clearRecordingPreviewUrl();
    clearSelectedPhotoPreview();
    clearFileInput(photoInputRef.current);
    clearSelectedVideoPreview();
    clearShareVideoInputs();
  }, []);
  const createShare = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedChild || !formMode) return;
    setFormError('');
    const validationError = getShareFormValidationError(formMode, shareForm);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setIsSubmittingShare(true);
    setShareUploadStatus(formMode === 'photo' ? 'preparing' : 'uploading');
    setShareUploadProgress('');
    const uploadedMediaIds: string[] = [];
    try {
      const shareId = createLocalMediaId();
      const mediaInputs: Array<{
        id: string;
        media_type: ShareFormMode;
        bucket: LocalShareMedia['bucket'];
        storage_path: string;
        thumbnail_path?: string | null;
        mime_type: string;
        file_name: string;
        file_size_bytes: number;
        width?: number | null;
        height?: number | null;
        duration_seconds?: number | null;
      }> = [];

      if (formMode === 'photo') {
        const total = shareForm.photos.length;
        for (let index = 0; index < total; index += 1) {
          setShareUploadStatus('preparing');
          setShareUploadProgress(`正在準備第 ${index + 1}／${total} 張照片`);
          const preparedPhoto = await prepareSharePhotoForUpload(shareForm.photos[index]);
          if (preparedPhoto.blob.size <= 0) throw new Error(`第 ${index + 1} 張照片準備失敗：檔案沒有內容。`);
          setShareUploadStatus('uploading');
          setShareUploadProgress(`正在上傳第 ${index + 1}／${total} 張照片`);
          const mediaId = createLocalMediaId();
          const uploadedMedia = await shareRepository.saveShareMedia({
            id: mediaId,
            shareId,
            childId: selectedChild.id,
            mediaType: 'photo',
            mimeType: preparedPhoto.mimeType,
            fileName: normalizeShareFileName(preparedPhoto.fileName, preparedPhoto.mimeType, 'photo'),
            fileSizeBytes: preparedPhoto.blob.size,
            blob: preparedPhoto.blob
          });
          uploadedMediaIds.push(uploadedMedia.id);
          if ((uploadedMedia.file_size_bytes ?? 0) <= 0) throw new Error(`第 ${index + 1} 張照片上傳失敗：Storage 檔案大小為 0。`);
          mediaInputs.push({
            id: uploadedMedia.id,
            media_type: 'photo',
            bucket: uploadedMedia.bucket as LocalShareMedia['bucket'],
            storage_path: uploadedMedia.storage_path,
            thumbnail_path: uploadedMedia.thumbnail_path,
            mime_type: uploadedMedia.mime_type,
            file_name: normalizeShareFileName(preparedPhoto.fileName, preparedPhoto.mimeType, 'photo'),
            file_size_bytes: uploadedMedia.file_size_bytes,
            width: uploadedMedia.width,
            height: uploadedMedia.height,
            duration_seconds: uploadedMedia.duration_seconds
          });
          setShareUploadProgress(`已完成 ${index + 1}／${total} 張`);
        }
      } else {
        const mediaBlob = shareForm.recording?.blob ?? shareForm.file ?? null;
        const uploadFileName = shareForm.recording?.file_name ?? shareForm.file?.name ?? `share-${formMode}`;
        const uploadMimeType = mediaBlob?.type || shareForm.recording?.mime_type || defaultMimeType(formMode);
        if (!mediaBlob) {
          setFormError('媒體檔案準備失敗，請重新選擇或錄製。');
          setShareUploadStatus('error');
          return;
        }
        if (mediaBlob.size <= 0) {
          setFormError(`${childMediaTypeLabel(formMode)}檔案沒有內容，請重新選擇後再試。`);
          setShareUploadStatus('error');
          return;
        }
        if (formMode === 'video') {
          const videoError = getShareVideoFileError(shareForm.file);
          if (videoError) {
            setFormError(videoError);
            setShareUploadStatus('error');
            return;
          }
          logVideoStorageDiagnostics(mediaBlob);
          const diagnostics = shareRepository.getStorageDiagnostics();
          console.info('[child/share] localStorage diagnostics before video share', {
            'JSON.stringify(localStorage).length': diagnostics.jsonStringifyLength,
            estimatedLocalStorageBytes: diagnostics.estimatedBytes,
            estimatedLocalStorageKb: diagnostics.estimatedKb
          });
        }
        const mediaId = createLocalMediaId();
        const uploadedMedia = await shareRepository.saveShareMedia({
          id: mediaId,
          shareId,
          childId: selectedChild.id,
          mediaType: formMode,
          mimeType: uploadMimeType,
          fileName: normalizeShareFileName(uploadFileName, uploadMimeType, formMode),
          fileSizeBytes: mediaBlob.size,
          durationSeconds: shareForm.recording?.duration_seconds,
          blob: mediaBlob
        });
        uploadedMediaIds.push(uploadedMedia.id);
        if ((uploadedMedia.file_size_bytes ?? 0) <= 0) {
          throw new Error(`${childMediaTypeLabel(formMode)}上傳失敗：Storage 檔案大小為 0。`);
        }
        mediaInputs.push({
          id: uploadedMedia.id,
          media_type: formMode,
          bucket: uploadedMedia.bucket as LocalShareMedia['bucket'],
          storage_path: uploadedMedia.storage_path,
          thumbnail_path: uploadedMedia.thumbnail_path,
          mime_type: uploadedMedia.mime_type,
          file_name: normalizeShareFileName(uploadFileName, uploadMimeType, formMode),
          file_size_bytes: uploadedMedia.file_size_bytes,
          width: uploadedMedia.width,
          height: uploadedMedia.height,
          duration_seconds: uploadedMedia.duration_seconds
        });
      }
      const createdShare = shareRepository.createShare({
        id: shareId,
        child_id: selectedChild.id,
        title: shareForm.title || null,
        caption: shareForm.caption || null,
        source_type: 'child_device',
        status: 'approved',
        media: mediaInputs
      });
      setShareUploadStatus('success');
      setShareUploadProgress(formMode === 'photo' ? '全部上傳完成' : '上傳成功');
      closeShareForm();
    } catch (caught) {
      if (uploadedMediaIds.length) {
        await Promise.allSettled(uploadedMediaIds.map((mediaId) => shareRepository.deleteShareMedia(mediaId)));
      }
      const diagnostics = shareRepository.getStorageDiagnostics();
      const errorDiagnostics = getErrorDiagnostics(caught);
      console.error('[child/share] createShare failed', {
        'error.name': errorDiagnostics.name ?? errorDiagnostics.type,
        'error.message': getErrorMessage(caught),
        error: errorDiagnostics,
        'JSON.stringify(localStorage).length': diagnostics.jsonStringifyLength,
        estimatedLocalStorageBytes: diagnostics.estimatedBytes,
        estimatedLocalStorageKb: diagnostics.estimatedKb,
        videoBlobSize: shareForm.recording?.blob?.size ?? null,
        estimatedEncodedLength: shareForm.recording?.blob ? Math.ceil(shareForm.recording.blob.size / 3) * 4 : null
      });
      setShareUploadStatus('error');
      setFormError(getShareCreateErrorMessage(caught, formMode));
    } finally {
      setIsSubmittingShare(false);
    }
  };
  const processSelectedPhotos = async (files: File[]) => {
    setFormError('');
    setShareUploadStatus('idle');
    setShareUploadProgress('');
    if (files.length > SHARE_PHOTO_MAX_COUNT) {
      setFormError('一次最多選擇 10 張照片，請減少後再上傳。');
      return;
    }
    const validationError = files.map((file, index) => {
      const error = getSharePhotoFileError(file);
      return error ? `第 ${index + 1} 張：${error}` : '';
    }).find(Boolean);
    setSelectedPhotos((current) => {
      current.forEach((item) => shareRepository.releasePreviewUrl(item.previewUrl));
      return files.map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        previewUrl: shareRepository.createPreviewUrl(file)
      }));
    });
    setShareForm((current) => ({ ...current, photos: files, file: null }));
    if (validationError) setFormError(validationError);
  };
  const removeSelectedPhoto = (photoId: string) => {
    setFormError('');
    setShareUploadStatus('idle');
    setShareUploadProgress('');
    setSelectedPhotos((current) => {
      const removed = current.find((item) => item.id === photoId);
      if (removed) shareRepository.releasePreviewUrl(removed.previewUrl);
      const next = current.filter((item) => item.id !== photoId);
      setShareForm((share) => ({ ...share, photos: next.map((item) => item.file) }));
      if (!next.length) clearFileInput(photoInputRef.current);
      return next;
    });
  };
  const processSelectedVideo = async (file: File, source: 'camera' | 'library') => {
    setFormError('');
    resetShareRecording();
    const validationError = getShareVideoFileError(file);
    setSelectedVideoPreviewUrl((current) => {
      shareRepository.releasePreviewUrl(current);
      return shareRepository.createPreviewUrl(file);
    });
    setVideoSelectionSource(source);
    setShareForm((current) => ({
      ...current,
      file,
      recording: null,
      recording_accepted: false,
      is_recording: false
    }));
    if (validationError) setFormError(validationError);
  };
  const handlePhotoFileChange = (event: { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    void processSelectedPhotos(files);
  };
  const handleCameraVideoFileChange = (event: { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget;
    const file = captureFirstSelectedFile(input, { clear: false });
    if (!file) return;
    void processSelectedVideo(file, 'camera');
  };
  const handleLibraryVideoFileChange = (event: { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget;
    const file = captureFirstSelectedFile(input, { clear: false });
    if (!file) return;
    void processSelectedVideo(file, 'library');
  };

  return (
    <div className="v1-page v2-share-page">
      <ChildPageHeader emoji="📷" title="分享" accent="✦" subtitle="記錄每一次的冒險時刻" />
      <main className="v2-share-main">
        <section className="v1-panel v2-share-actions-panel">
          <SectionHeading title="今日分享" accent="✦" />
          <div className="v1-share-actions">
            <ShareAction art="📷" title="照片分享" subtitle="選擇本機照片" tone="blue" onClick={() => openShareForm('photo')} />
            <ShareAction art="🎤" title="語音分享" subtitle="直接錄音分享" tone="green" onClick={() => openShareForm('audio')} />
            <ShareAction art="🎬" title="影片分享" subtitle="選擇本機影片" tone="yellow" onClick={() => openShareForm('video')} />
          </div>
        </section>

        <section className="v1-panel v2-recent-panel">
          <SectionHeading icon={Camera} title="最近分享" action="查看更多" actionOnClick={jumpToGalleryPager} />
          <div className="child-share-filter-tabs" role="tablist" aria-label="分享類型篩選">
            {shareFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                className={shareFilter === item.value ? 'is-active' : ''}
                onClick={() => setShareFilter(item.value)}
              >
                <span>{item.label}</span>
                <b>{item.count}</b>
              </button>
            ))}
          </div>
          <div className="v2-share-grid">
            {visibleShares.length ? visibleShares.map((share) => <ShareGridCard key={share.id} share={share} encouragementStars={shareRewards.get(share.id) ?? 0} />) : <ChildTaskEmpty text={shareFilter === 'all' ? '還沒有分享紀錄，先新增照片、語音或影片分享' : '這個分類目前沒有分享'} />}
          </div>
          <div ref={galleryPagerRef} className="v2-share-pagination">
            <button type="button" onClick={() => setSharePageIndex((value) => Math.max(1, value - 1))} disabled={safePageIndex === 1}>上一頁</button>
            <span>{safePageIndex} / {totalPages} 頁</span>
            <button type="button" onClick={() => setSharePageIndex((value) => Math.min(totalPages, value + 1))} disabled={safePageIndex === totalPages}>下一頁</button>
          </div>
        </section>
      </main>
      {formMode ? (
        <div className="local-form-backdrop" role="presentation" onMouseDown={closeShareForm}>
          <section className="local-form-dialog child-share-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><small>{dataModeBadgeLabel}</small><h2>新增{childMediaTypeLabel(formMode)}分享</h2></div><button type="button" aria-label="關閉" onClick={closeShareForm}>×</button></header>
            <form onSubmit={createShare}>
              {formMode === 'audio' ? (
                <ShareAudioRecorder
                  recording={shareForm.recording}
                  accepted={shareForm.recording_accepted}
                  isRecording={shareForm.is_recording}
                  seconds={shareForm.recording_seconds}
                  onStart={startShareAudioRecording}
                  onStop={() => stopActiveShareRecording(true)}
                  onReset={resetShareRecording}
                  onUse={() => setShareForm((current) => ({ ...current, recording_accepted: true }))}
                />
              ) : formMode === 'video' ? (
                <ShareNativeVideoPicker
                  file={shareForm.file}
                  previewUrl={selectedVideoPreviewUrl}
                  source={videoSelectionSource}
                  cameraInputRef={cameraVideoInputRef}
                  libraryInputRef={libraryVideoInputRef}
                  onCameraChange={handleCameraVideoFileChange}
                  onLibraryChange={handleLibraryVideoFileChange}
                  onReselect={() => {
                    clearShareVideoInputs();
                    clearSelectedVideoPreview();
                    setFormError('');
                    setShareForm((current) => ({ ...current, file: null }));
                  }}
                />
              ) : (
                <SharePhotoPicker
                  photos={selectedPhotos}
                  inputRef={photoInputRef}
                  onPhotoChange={handlePhotoFileChange}
                  onRemove={removeSelectedPhoto}
                  onReselect={() => {
                    clearFileInput(photoInputRef.current);
                    clearSelectedPhotoPreview();
                    setShareUploadStatus('idle');
                    setShareUploadProgress('');
                    setFormError('');
                  }}
                />
              )}
              <label className="is-full">
                標題
                <input autoFocus maxLength={60} value={shareForm.title} onChange={(event) => setShareForm({ ...shareForm, title: event.target.value })} placeholder="例如：今天的積木作品" />
              </label>
              <label className="is-full">
                想說的話
                <textarea rows={3} maxLength={200} value={shareForm.caption} onChange={(event) => setShareForm({ ...shareForm, caption: event.target.value })} placeholder="寫下這次分享的故事" />
              </label>
              {formError ? <p className="local-form-error">{formError}</p> : null}
              {shareUploadStatus !== 'idle' ? <p className="local-form-hint">{shareUploadProgress || shareUploadStatusLabel(formMode, shareUploadStatus)}</p> : null}
              {shareUploadStatus === 'error' ? <button type="submit" className="local-form-retry" disabled={isSubmittingShare}>重試上傳</button> : null}
              {!formError && formMode ? <p className="local-form-hint">{getShareFormValidationError(formMode, shareForm) || '媒體已準備好，可以送出分享。'}</p> : null}
              <footer><button type="button" onClick={closeShareForm}>取消</button><button className="ds-primary-button" type="submit" disabled={isSubmittingShare}>{isSubmittingShare ? '上傳中...' : '送出分享'}</button></footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ShareAudioRecorder({
  recording,
  accepted,
  isRecording,
  seconds,
  onStart,
  onStop,
  onReset,
  onUse
}: {
  recording: ChildRecordedMedia | null;
  accepted: boolean;
  isRecording: boolean;
  seconds: number;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onUse: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  return (
    <section className="mailbox-recorder child-share-recorder is-full" aria-label="語音錄音">
      {!recording && !isRecording ? (
        <button type="button" className="mailbox-recorder-primary" onClick={onStart}>
          <span>🎤</span>
          開始錄音
        </button>
      ) : null}
      {isRecording ? (
        <div className="mailbox-recorder-live">
          <div><strong>🔴 錄音中</strong><time>{formatRecordingTime(seconds)}</time></div>
          <button type="button" onClick={onStop}>停止錄音</button>
        </div>
      ) : null}
      {recording && !isRecording ? (
        <div className="mailbox-recorder-ready">
          <audio ref={audioRef} src={recording.preview_url} controls />
          <div>
            <button type="button" onClick={() => void audioRef.current?.play()}>播放預聽</button>
            <button type="button" onClick={onReset}>🗑 重新錄音</button>
            <button type="button" className={accepted ? 'is-selected' : ''} disabled={accepted} onClick={onUse}>
              {accepted ? '已使用這段錄音' : '使用這段錄音'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SharePhotoPicker({
  photos,
  inputRef,
  onPhotoChange,
  onRemove,
  onReselect
}: {
  photos: SelectedSharePhoto[];
  inputRef: { current: HTMLInputElement | null };
  onPhotoChange: (event: { currentTarget: HTMLInputElement }) => void;
  onRemove: (photoId: string) => void;
  onReselect: () => void;
}) {
  const [previewPhoto, setPreviewPhoto] = useState<SelectedSharePhoto | null>(null);
  const totalBytes = photos.reduce((total, item) => total + item.file.size, 0);
  return (
    <section className="mailbox-recorder child-share-photo-picker is-full" aria-label="照片選擇">
      <label className="mailbox-recorder-primary child-share-photo-option">
        <span>📷</span>
        選擇照片
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onClick={() => clearFileInput(inputRef.current)}
          onChange={onPhotoChange}
        />
      </label>
      <p className="local-form-hint">照片容量上限：{formatFileSize(SHARE_PHOTO_MAX_BYTES)}。支援 JPG、PNG、WebP、HEIC、HEIF。</p>
      {photos.length ? (
        <div className="mailbox-recorder-ready child-share-photo-selected">
          <div className="child-share-photo-summary">
            <strong>已選擇 {photos.length} 張照片</strong>
            <span>總檔案大小：{formatFileSize(totalBytes)}</span>
          </div>
          <div className="child-share-photo-preview-grid">
            {photos.map((photo, index) => (
              <figure key={photo.id}>
                <button type="button" onClick={() => setPreviewPhoto(photo)} aria-label={`放大第 ${index + 1} 張照片`}>
                  <img src={photo.previewUrl} alt={photo.file.name || `已選照片 ${index + 1}`} />
                  <span>{index + 1}</span>
                </button>
                <figcaption>
                  <b>{photo.file.name || '未命名照片'}</b>
                  <small>{formatFileSize(photo.file.size)}</small>
                  <button type="button" onClick={() => onRemove(photo.id)}>移除</button>
                </figcaption>
              </figure>
            ))}
          </div>
          <div>
            <button type="button" onClick={onReselect}>重新選擇照片</button>
          </div>
        </div>
      ) : null}
      {previewPhoto ? (
        <div className="local-share-lightbox" role="dialog" aria-modal="true" onClick={() => setPreviewPhoto(null)}>
          <button type="button" aria-label="關閉照片預覽" onClick={() => setPreviewPhoto(null)}>x</button>
          <img src={previewPhoto.previewUrl} alt={previewPhoto.file.name || '照片預覽'} />
        </div>
      ) : null}
    </section>
  );
}

function ShareNativeVideoPicker({
  file,
  previewUrl,
  source,
  cameraInputRef,
  libraryInputRef,
  onCameraChange,
  onLibraryChange,
  onReselect
}: {
  file: File | null;
  previewUrl: string | null;
  source: 'camera' | 'library' | null;
  cameraInputRef: { current: HTMLInputElement | null };
  libraryInputRef: { current: HTMLInputElement | null };
  onCameraChange: (event: { currentTarget: HTMLInputElement }) => void;
  onLibraryChange: (event: { currentTarget: HTMLInputElement }) => void;
  onReselect: () => void;
}) {
  return (
    <section className="mailbox-recorder child-share-recorder child-share-video-recorder is-full" aria-label="影片選擇">
      <div className="child-share-video-options">
        <label className="mailbox-recorder-primary child-share-video-option">
          <span>🎥</span>
          使用相機錄影
          <input
            ref={cameraInputRef}
            type="file"
            accept="video/*"
            capture="environment"
            onClick={() => clearFileInput(cameraInputRef.current)}
            onChange={onCameraChange}
          />
        </label>
        <label className="mailbox-recorder-primary child-share-video-option is-secondary">
          <span>▣</span>
          從照片圖庫選擇影片
          <input
            ref={libraryInputRef}
            type="file"
            accept="video/*"
            onClick={() => clearFileInput(libraryInputRef.current)}
            onChange={onLibraryChange}
          />
        </label>
      </div>
      <p className="local-form-hint">影片容量上限：{formatFileSize(SHARE_VIDEO_MAX_BYTES)}。原生相機錄影會保留原始影片檔。</p>
      {file && previewUrl ? (
        <div className="mailbox-recorder-ready child-share-video-selected">
          <video src={previewUrl} controls playsInline preload="metadata" />
          <div className="child-share-file-meta">
            <strong>{source === 'camera' ? '相機錄影已選擇' : '影片已選擇'}</strong>
            <span>{file.name || '未命名影片'}</span>
            <span>目前檔案大小：{formatFileSize(file.size)}</span>
            <span>系統允許的最大容量：{formatFileSize(SHARE_VIDEO_MAX_BYTES)}</span>
          </div>
          <div>
            <button type="button" onClick={onReselect}>重新選擇影片</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
function ShareAction({ art, title, subtitle, tone, onClick }: { art: string; title: string; subtitle: string; tone: string; onClick: () => void }) {
  return (
    <button className={`v1-share-action v1-tone-${tone}`} onClick={onClick}>
      <span className="v2-action-art" aria-hidden="true">
        <i className="v2-action-sparkle">✦</i>
        <b>{art}</b>
        <i className="v2-action-note">{tone === 'green' ? '♪' : tone === 'yellow' ? '✦' : '♥'}</i>
      </span>
      <strong>{title}</strong>
      <small>{subtitle}</small>
    </button>
  );
}

function ShareGridCard({ share, encouragementStars }: { share: ShareWithMedia; encouragementStars?: number }) {
  const media = share.media[0];
  const photoMedia = share.media.filter((item) => item.media_type === 'photo');
  const type = childShareTypeLabel(share.share_type);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (media?.media_type === 'audio') {
      void shareRepository.getMediaUrl(media.id).then((url) => {
        if (!cancelled) setAudioUrl(url);
        else shareRepository.releaseMediaUrl(media.id);
      });
    } else {
      setAudioUrl(null);
    }
    return () => {
      cancelled = true;
      if (media?.media_type === 'audio') shareRepository.releaseMediaUrl(media.id);
    };
  }, [media?.id, media?.media_type]);

  const playAudio = () => {
    if (!audioUrl) return;
    void new Audio(audioUrl).play();
  };

  return (
    <article
      className={`v2-share-card v2-share-card-${share.share_type}`}
      role={media?.media_type === 'audio' ? 'button' : undefined}
      tabIndex={media?.media_type === 'audio' ? 0 : undefined}
      onClick={media?.media_type === 'audio' ? playAudio : undefined}
      onKeyDown={media?.media_type === 'audio' ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          playAudio();
        }
      } : undefined}
    >
      <div className={`v2-share-card-media${share.share_type === 'audio' ? ' is-audio' : ''}`}>
        {photoMedia.length ? (
          <LocalShareAlbum media={photoMedia} title={share.title ?? share.caption} />
        ) : media?.media_type === 'video' ? (
          <>
            <LocalShareMediaView mediaId={media.id} mediaType="video" controls />
            <span className="v2-share-video-play" aria-hidden="true"><Play size={30} fill="currentColor" /></span>
          </>
        ) : media?.media_type === 'audio' ? (
          <>
            <span className="v2-share-audio-art" aria-hidden="true">🎤</span>
            <span className="v2-share-audio-wave" aria-hidden="true">∿∿∿∿∿</span>
          </>
        ) : (
          <span>{childShareTypeIcon(share.share_type)}</span>
        )}
      </div>
      <div className="v2-share-card-body">
        <small className={`v2-share-card-type is-${share.share_type}`}>{type}</small>
        <strong>{share.title || share.caption || (share.share_type === 'audio' ? '錄音分享' : type)}</strong>
        {encouragementStars ? <ChildShareStarBadge stars={encouragementStars} /> : null}
        <time>{share.created_at.slice(0, 10).replace(/-/g, '/')}</time>
        <span>{share.share_type === 'audio' && media?.duration_seconds ? `錄音 · ${formatRecordingTime(media.duration_seconds)}` : type}</span>
      </div>
    </article>
  );
}

function ChildShareStarBadge({ stars }: { stars: number }) {
  return (
    <div className="child-share-star-badge" aria-label={`家長鼓勵 ${stars} 顆星`}>
      <span aria-hidden="true">{'⭐'.repeat(Math.max(1, Math.min(5, stars)))}</span>
      <b>家長鼓勵 {stars}顆星</b>
    </div>
  );
}

function LocalRecentCard({ share }: { share: ShareWithMedia }) {
  const media = share.media[0];
  const photoMedia = share.media.filter((item) => item.media_type === 'photo');
  const type = childShareTypeLabel(share.share_type);
  const Icon = share.share_type === 'audio' ? Mic : share.share_type === 'video' ? Play : Image;
  return (
    <article className="v1-recent-card">
      <div className={`v1-media-thumb${share.share_type === 'audio' ? ' is-voice' : ''}`}>
        {photoMedia.length ? (
          <LocalShareAlbum media={photoMedia} title={share.title ?? ''} />
        ) : media?.media_type === 'video' ? (
          <LocalShareMediaView mediaId={media.id} mediaType="video" />
        ) : media ? <span>{childShareTypeIcon(share.share_type)}</span> : null}
        {share.share_type === 'audio' ? <b className="v2-voice-wave" aria-hidden="true">⌁⌁⌁⌁⌁</b> : null}
        <i><Icon size={20} fill={share.share_type === 'video' ? 'currentColor' : 'none'} /></i>
      </div>
      <div><strong>{share.title || type}</strong><time>{childShareStatusLabel(share.status)}</time></div>
    </article>
  );
}

function buildChildShares(state: LocalDatabaseState): ShareWithMedia[] {
  return state.shares
    .filter((share) => !share.deleted_at)
    .map((share) => ({
      ...share,
      media: state.share_media
        .filter((media) => media.share_id === share.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function childShareTypeLabel(type: LocalShare['share_type']) {
  return ({ text: '文字', photo: '照片', audio: '語音', video: '影片', mixed: '混合' } as const)[type];
}

function childShareTypeIcon(type: LocalShare['share_type']) {
  return ({ text: '✎', photo: '📷', audio: '🎤', video: '▶', mixed: '▣' } as const)[type];
}

function childShareStatusLabel(status: LocalShare['status']) {
  void status;
  return '已分享';
}

function legacyChildShareStatusLabel(status: LocalShare['status']) {
  return ({ draft: '草稿', pending_review: '待家長審核', approved: '已審核', rejected: '已退回', archived: '已封存' } as const)[status];
}

function childMediaTypeLabel(type: ShareFormMode) {
  return ({ photo: '照片', audio: '語音', video: '影片' } as const)[type];
}

function shareAccept(type: ShareFormMode) {
  return ({ photo: 'image/*', audio: 'audio/*', video: 'video/*' } as const)[type];
}

function defaultMimeType(type: ShareFormMode) {
  return ({ photo: 'image/jpeg', audio: 'audio/mpeg', video: 'video/mp4' } as const)[type];
}

function shareUploadStatusLabel(formMode: ShareFormMode | null, status: 'idle' | 'preparing' | 'uploading' | 'success' | 'error') {
  const label = formMode ? childMediaTypeLabel(formMode) : '媒體';
  if (status === 'preparing') return `${label}準備中。`;
  if (status === 'uploading') return `${label}上傳中，請勿關閉頁面。`;
  if (status === 'success') return '上傳成功。';
  if (status === 'error') return '上傳失敗，請確認原因後重試。';
  return '';
}

function replaceFileExtension(fileName: string, extension: string) {
  return `${fileName.replace(/\.[^.]+$/, '') || 'share-photo'}.${extension}`;
}

function normalizeShareFileName(fileName: string, mimeType: string, type: ShareFormMode) {
  return replaceFileExtension(fileName, getShareFileExtension(mimeType, fileName, type));
}

function createLocalMediaId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getShareFormValidationError(
  formMode: ShareFormMode,
  shareForm: {
    photos: File[];
    file: File | null;
    recording: ChildRecordedMedia | null;
    recording_accepted: boolean;
    is_recording: boolean;
  }
) {
  if (shareForm.is_recording) return '錄音尚未停止，請先停止錄音。';
  if (formMode === 'photo') {
    if (!shareForm.photos.length) return '請選擇要分享的照片檔案。';
    if (shareForm.photos.length > SHARE_PHOTO_MAX_COUNT) return '一次最多選擇 10 張照片，請減少後再上傳。';
    return shareForm.photos.map((file, index) => {
      const error = getSharePhotoFileError(file);
      return error ? `第 ${index + 1} 張：${error}` : '';
    }).find(Boolean) || '';
  }
  if (formMode === 'audio' && (!shareForm.recording || !shareForm.recording_accepted)) return '請先錄音，並按「使用錄音」後再送出。';
  if (formMode === 'video') {
    if (!shareForm.file) return '請使用相機錄影，或從照片圖庫選擇影片。';
    return getShareVideoFileError(shareForm.file);
  }
  return '';
}

async function compressSharePhoto(file: File) {
  return compressImageFile(file);
}

async function prepareSharePhotoForUpload(file: File) {
  const validationError = getSharePhotoFileError(file);
  if (validationError) throw new Error(validationError);
  try {
    if (isHeicSharePhoto(file)) {
      const jpegBlob = await convertSharePhotoToJpeg(file);
      return {
        blob: jpegBlob,
        mimeType: 'image/jpeg',
        fileName: replaceFileExtension(file.name || 'share-photo.heic', 'jpg')
      };
    }
    const blob = await compressSharePhoto(file);
    return {
      blob,
      mimeType: blob.type || defaultMimeType('photo'),
      fileName: file.name || 'share-photo'
    };
  } catch (caught) {
    if (isHeicSharePhoto(file)) {
      throw new Error('HEIC/HEIF 照片轉換失敗，請在照片 App 匯出為 JPEG 後再上傳。');
    }
    throw new Error(getErrorMessage(caught, '照片準備失敗，請重新選擇照片後再試。'));
  }
}

async function convertSharePhotoToJpeg(file: File) {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
    throw new Error('目前瀏覽器無法轉換 HEIC/HEIF 照片。');
  }
  let bitmap: ImageBitmap | null = null;
  try {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bitmap = await createImageBitmap(file);
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('照片轉換失敗，無法建立畫布。');
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob || blob.size <= 0) throw new Error('照片轉換失敗，沒有產生有效檔案。');
    return blob;
  } finally {
    bitmap?.close();
  }
}

function getShareAudioRecordingMimeType() {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

function getShareRecordingExtension(mimeType: string) {
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'webm';
}

function getShareFileExtension(mimeType: string, fileName: string, type: ShareFormMode) {
  const existing = fileName.split('.').pop()?.toLowerCase();
  if (existing && ['jpg', 'jpeg', 'png', 'webp', 'mp3', 'm4a', 'mp4', 'mov', 'm4v', 'wav', 'webm'].includes(existing)) {
    return existing === 'jpeg' ? 'jpg' : existing;
  }
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (type === 'audio') return 'm4a';
  if (type === 'video') return 'mp4';
  return 'jpg';
}

function getShareVideoFileError(file: File | null) {
  if (!file) return '';
  if (file.size > SHARE_VIDEO_MAX_BYTES) {
    return `影片檔案太大，目前檔案大小 ${formatFileSize(file.size)}，系統允許的最大容量為 ${formatFileSize(SHARE_VIDEO_MAX_BYTES)}。請選擇較短的影片後再送出。`;
  }
  if (isSupportedShareVideoFile(file)) return '';
  return '目前只支援 MOV、MP4、M4V 或 WebM 影片，請重新選擇影片。';
}

function getSharePhotoFileError(file: File | null) {
  if (!file) return '';
  if (file.size > SHARE_PHOTO_MAX_BYTES) {
    return `照片檔案太大，目前檔案大小 ${formatFileSize(file.size)}，系統允許的最大容量為 ${formatFileSize(SHARE_PHOTO_MAX_BYTES)}。請選擇較小的照片後再送出。`;
  }
  if (isSupportedSharePhotoFile(file)) return '';
  return '目前只支援 JPG、PNG、WebP、HEIC 或 HEIF 照片，請重新選擇照片。';
}

function isSupportedSharePhotoFile(file: File) {
  const mimeType = file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mimeType)) return true;
  if (!mimeType && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension)) return true;
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension);
}

function isHeicSharePhoto(file: File) {
  const mimeType = file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return mimeType === 'image/heic' || mimeType === 'image/heif' || extension === 'heic' || extension === 'heif';
}

function isSupportedShareVideoFile(file: File) {
  const mimeType = file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['video/quicktime', 'video/mp4', 'video/x-m4v', 'video/webm'].includes(mimeType)) return true;
  if (!mimeType && ['mov', 'mp4', 'm4v', 'webm'].includes(extension)) return true;
  return ['mov', 'mp4', 'm4v', 'webm'].includes(extension);
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getShareCreateErrorMessage(caught: unknown, formMode: ShareFormMode) {
  const message = caught instanceof Error ? caught.message : '';
  if (message.includes('Video media must be 300MB or smaller')) {
    return `影片檔案太大，系統允許的最大容量為 ${formatFileSize(SHARE_VIDEO_MAX_BYTES)}。`;
  }
  if (message.toLowerCase().includes('storage') || message.includes('upload')) {
    return `${childMediaTypeLabel(formMode)}上傳失敗：${message || '請確認網路連線後再試。'}`;
  }
  return message || '新增分享失敗，請稍後再試。';
}

function formatRecordingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

const dreamParts = [
  { label: '第一步', kind: 'front-wheel' },
  { label: '第二步', kind: 'back-wheel' },
  { label: '第三步', kind: 'frame' },
  { label: '第四步', kind: 'seat' },
  { label: '第五步', kind: 'handle' },
  { label: '完成', kind: 'basket' }
];

function DreamPage() {
  useDreamCoverMigration();
  const localState = useLocalDataState();
  const currentChildId = resolveCurrentChildId(localState);
  const selectedChild = currentChildId
    ? localState.children.find((child) => child.id === currentChildId && child.status === 'active')
    : null;
  const childDreams = useMemo(
    () =>
      selectedChild
        ? buildChildDreamBalances(localState).filter((dream) => dream.child_id === selectedChild.id)
        : [],
    [localState, selectedChild]
  );
  const activeDreams = childDreams.filter((dream) => dream.status !== 'completed');
  const completedDreams = childDreams.filter((dream) => dream.status === 'completed');
  const currentDream = activeDreams[0] ?? completedDreams[0] ?? null;
  const totalSaved = childDreams.reduce((total, dream) => total + dream.current_amount, 0);
  const unlockedCount = currentDream ? Math.min(6, Math.floor(currentDream.progress_percent / 20) + (currentDream.progress_percent > 0 ? 1 : 0)) : 0;

  return (
    <div className="v1-page v2-dream-page">
      <ChildPageHeader emoji="🌈" title="夢想" subtitle="存錢實現夢想，讓夢想成真！" />
      {currentDream ? (
        <section className="v1-dream-hero">
          <div className="v1-dream-copy">
            <span>目前夢想 ✦</span>
            <h2>{currentDream.title} <Pencil size={18} /></h2>
            <p>{currentDream.description || '家長新增夢想後，孩子端會同步看到存款進度。'}</p>
            <div className="v1-money">
              <div><small>目標金額</small><strong>{formatChildMoney(currentDream.target_amount)}</strong></div>
              <div><small>目前存款</small><strong>{formatChildMoney(currentDream.current_amount)}</strong></div>
            </div>
            <label><span>完成度</span><strong>{currentDream.progress_percent}%</strong></label>
            <div className="v1-progress"><i style={{ width: `${currentDream.progress_percent}%` }} /></div>
            <em>{currentDream.status === 'completed' ? '♥ 夢想完成了！' : currentDream.status === 'funded' ? '♥ 已經達標，等家長標記完成！' : `♥ 距離夢想還差 ${formatChildMoney(Math.max(0, currentDream.target_amount - currentDream.current_amount))}`}</em>
          </div>
          <div className="v2-dream-bike">
            <span className="v2-bike-cloud v2-bike-cloud-one" />
            <span className="v2-bike-cloud v2-bike-cloud-two" />
            <span className="v2-bike-sparkle">✦</span>
            <LocalDreamCover mediaId={childDreamCoverMediaId(currentDream)} fallbackSrc={childDreamCover(currentDream)} alt={currentDream.title} />
          </div>
        </section>
      ) : (
        <section className="v1-dream-hero child-dream-empty">
          <div className="v1-dream-copy">
            <span>目前夢想 ✦</span>
            <h2>還沒有夢想</h2>
            <p>{selectedChild ? '請家長到夢想管理新增第一個夢想基金。' : '請家長先選擇目前孩子。'}</p>
          </div>
          <div className="v2-dream-bike"><span className="child-dream-placeholder">🌈</span></div>
        </section>
      )}
      <section className="v1-dream-middle">
        <div className="v1-panel v2-puzzle-panel">
          <SectionHeading title="我的夢想拼圖" accent="★" action="查看更多" />
          <p>每存到一個階段就會解鎖一塊喔！</p>
          <div className="v1-parts">
            {dreamParts.map((part, index) => {
              const unlocked = index < unlockedCount || currentDream?.status === 'completed';
              return (
              <article key={part.label}>
                <span className={`v2-dream-part v2-dream-part-${part.kind}`} />
                <small>{part.label}</small>
                <i className={unlocked ? 'is-unlocked' : 'is-locked'}>{unlocked ? '✓' : '▣'}</i>
              </article>
              );
            })}
          </div>
        </div>
        <div className="v1-dream-summary">
          <DreamSummaryCard tone="saved" icon="💰" label="已存金額" value={formatChildMoney(totalSaved)} />
          <DreamSummaryCard tone="count" icon="🌈" label="夢想數量" value={`${childDreams.length} 個`} />
          <DreamSummaryCard tone="done" icon="🏆" label="已完成夢想" value={`${completedDreams.length} 個`} />
        </div>
      </section>
      <section className="v1-dream-bottom">
        <div className="v1-panel v2-dream-list-panel">
          <SectionHeading title="我的夢想清單" action="查看更多" />
          <div className="v1-dream-list">
            {childDreams.length ? childDreams.map((item) => <DreamListItem key={item.id} dream={item} />) : <ChildTaskEmpty text="家長新增夢想後，會出現在這裡" />}
          </div>
        </div>
        <div className="v1-panel v2-completed-panel">
          <SectionHeading title="已完成夢想" action="查看更多" />
          <div className="v1-completed">
            {completedDreams.length ? completedDreams.map((dream) => (
              <article key={dream.id}>
                <LocalDreamCover mediaId={childDreamCoverMediaId(dream)} fallbackSrc={childDreamCover(dream)} alt={dream.title} />
                <div><strong>{dream.title}</strong><small>完成日期<br />{formatChildDate(dream.completed_at ?? dream.updated_at)}</small><i>♥</i></div>
              </article>
            )) : <ChildTaskEmpty text="完成夢想後，會收藏在這裡" />}
          </div>
          <button className="v2-dream-history">查看全部歷史 <ChevronRight size={16} /></button>
        </div>
      </section>
    </div>
  );
}

function DreamSummaryCard({ tone, icon, label, value }: { tone: string; icon: string; label: string; value: string }) {
  return <article className={`v2-dream-summary-${tone}`}><b>{icon}</b><span>{label}<strong>{value}</strong></span></article>;
}

function DreamListItem({ dream }: { dream: DreamWithBalance }) {
  const coverUrl = useLocalDreamCoverUrl(childDreamCoverMediaId(dream), childDreamCover(dream));
  return (
    <article>
      <div style={{ backgroundImage: `url(${coverUrl})` }} />
      <section><strong>{dream.title}</strong><small>目標金額　{formatChildMoney(dream.target_amount)}</small><div className="v1-progress"><i style={{ width: `${dream.progress_percent}%` }} /></div></section>
      <span>{dream.progress_percent}%</span>
      <em>🐷<i>●</i></em>
    </article>
  );
}

function buildChildDreamBalances(state: LocalDatabaseState): DreamWithBalance[] {
  return state.dreams
    .map((dream) => {
      const currentAmount = state.dream_funds
        .filter((fund) => fund.dream_id === dream.id)
        .reduce((total, fund) => total + fund.amount, 0);
      return {
        ...dream,
        current_amount: currentAmount,
        progress_percent:
          dream.target_amount === 0
            ? 100
            : Math.min(100, Math.round((currentAmount / dream.target_amount) * 100))
      };
    })
    .sort((a, b) => b.priority - a.priority || b.created_at.localeCompare(a.created_at));
}

function formatChildMoney(value: number) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0
  }).format(value);
}

function formatChildDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function getHomeSpecialDays(state: LocalDatabaseState, childId: string): HomeSpecialDay[] {
  const child = state.children.find((item) => item.id === childId && item.status === 'active');
  const birthday = child ? getBirthdaySpecialDays([child])[0] ?? null : null;
  const birthdayRows: HomeSpecialDay[] = birthday
    ? [{
        id: `birthday:${birthday.childId}`,
        title: birthday.title,
        date: birthday.date,
        type: 'birthday',
        daysLeft: birthday.daysLeft,
        isBirthday: true
      }]
    : [];
  const childDays = state.special_days
    .filter((day) => !day.deleted_at && day.child_id === childId && day.type !== 'birthday')
    .map((day) => ({
      id: day.id,
      title: day.title,
      date: day.date,
      type: day.type,
      daysLeft: homeDaysUntil(day.date)
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft || a.date.localeCompare(b.date));

  return [...birthdayRows, ...childDays];
}

function homeDaysUntil(date: string) {
  const start = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}

function homeSpecialDayIcon(type: LocalSpecialDay['type']) {
  return ({
    birthday: '🎂',
    anniversary: '🌟',
    holiday: '🎁',
    family_event: '🌟',
    other: '🌟'
  } as const)[type];
}

function childDreamCover(dream: Pick<DreamWithBalance, 'cover_path' | 'coverUrl' | 'imageUrl' | 'title'>) {
  return safeChildAssetCover(dream.cover_path) || safeChildAssetCover(dream.coverUrl) || safeChildAssetCover(dream.imageUrl) || defaultChildDreamCover(dream.title);
}

function childDreamCoverMediaId(dream: Pick<DreamWithBalance, 'cover_media_id' | 'coverMediaId'>) {
  return dream.cover_media_id ?? dream.coverMediaId ?? null;
}

function safeChildAssetCover(value?: string | null) {
  if (!value || value.startsWith('data:image')) return null;
  return value;
}

function defaultChildDreamCover(title: string) {
  if (title.includes('熊')) return asset('teddy-bear.jpg');
  if (title.includes('火車')) return asset('wooden-train.jpg');
  if (title.includes('車') || title.toLowerCase().includes('bike')) return asset('sage-scooter.png');
  return asset('wooden-train.jpg');
}

function legacyChildDreamCover(title: string) {
  if (title.includes('腳踏車') || title.toLowerCase().includes('bike')) return asset('sage-scooter.png');
  if (title.includes('熊')) return asset('teddy-bear.jpg');
  if (title.includes('火車')) return asset('wooden-train.jpg');
  if (title.includes('滑板') || title.includes('車')) return asset('sage-scooter.png');
  return asset('wooden-train.jpg');
}

type MailboxFilter = '全部' | '未讀' | '鼓勵卡' | '語音' | '圖片';

function MailboxPage() {
  const localState = useLocalDataState();
  const [activeCategory, setActiveCategory] = useState<MailboxFilter>('全部');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [mailboxError, setMailboxError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const currentChildId = resolveCurrentChildId(localState);
  const selectedChild = currentChildId
    ? localState.children.find((child) => child.id === currentChildId && child.status === 'active')
    : null;
  const childMessages = selectedChild
    ? localState.encouragement_cards
        .filter((message) => message.child_id === selectedChild.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    : [];
  const unreadCount = childMessages.filter((message) => message.status !== 'opened').length;
  const mailboxCategories = [
    { label: '全部' as const, icon: Mail, count: childMessages.length },
    { label: '未讀' as const, icon: Heart, count: unreadCount },
    { label: '鼓勵卡' as const, icon: Heart, count: childMessages.filter((message) => message.card_type === 'card').length },
    { label: '語音' as const, icon: Mic, count: childMessages.filter((message) => message.card_type === 'audio').length },
    { label: '圖片' as const, icon: Image, count: childMessages.filter((message) => ['image', 'video'].includes(message.card_type)).length }
  ];
  const visibleMessages = childMessages.filter((message) => {
    if (activeCategory === '全部') return true;
    if (activeCategory === '未讀') return message.status !== 'opened';
    if (activeCategory === '鼓勵卡') return message.card_type === 'card';
    if (activeCategory === '語音') return message.card_type === 'audio';
    if (activeCategory === '圖片') return ['image', 'video'].includes(message.card_type);
    return true;
  });
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(visibleMessages.length / pageSize));
  const pagedMessages = visibleMessages.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedMessage =
    childMessages.find((message) => message.id === selectedMessageId) ?? null;

  useEffect(() => {
    setCurrentPage(1);
    setSelectedMessageId(null);
  }, [activeCategory]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const openMessage = (message: LocalMailboxMessage) => {
    setMailboxError('');
    try {
      if (message.status !== 'opened') mailboxRepository.markMessageRead(message.id);
      setSelectedMessageId(message.id);
    } catch (caught) {
      setMailboxError(caught instanceof Error ? caught.message : '開啟訊息失敗');
    }
  };

  return (
    <div className="v1-page v2-mailbox-page">
      <ChildPageHeader emoji="✉️" title="信箱" accent="♥" subtitle="家長鼓勵都在這裡 ✨" />
      <section className="v1-mail-layout">
        <aside className="v1-mail-categories">
          {mailboxCategories.map((item) => (
            (() => {
              const Icon = item.icon;
              return (
            <button
              className={activeCategory === item.label ? 'is-active' : ''}
              key={item.label}
              onClick={() => setActiveCategory(item.label)}
            >
              <span><Icon size={18} fill={item.label === '鼓勵卡' || item.label === '未讀' ? 'currentColor' : 'none'} /></span>
              <b className="v2-mail-full-label">{item.label}</b>
              <b className="v2-mail-short-label">{item.label}</b>
              {item.count ? <em>{item.count}</em> : null}
            </button>
              );
            })()
          ))}
        </aside>
        <div className="v1-message-area">
          <SectionHeading title={`${activeCategory}訊息`} accent="✦" action={`${unreadCount} 未讀`} />
          {mailboxError ? <p className="v2-mail-error">{mailboxError}</p> : null}
          <div className="v1-message-list" aria-live="polite">
            {pagedMessages.length ? pagedMessages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                onOpen={() => openMessage(message)}
              />
            )) : (
              <MailboxEmpty text={selectedChild ? '目前沒有訊息' : '請家長先選擇目前孩子'} />
            )}
          </div>
          <MailboxPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      </section>
      {selectedMessage ? <MessageDetail message={selectedMessage} onClose={() => setSelectedMessageId(null)} /> : null}
    </div>
  );
}

function MessageCard({ message, onOpen }: { message: LocalMailboxMessage; onOpen: () => void }) {
  const Icon = childMailboxIconComponent(message.card_type);
  const isRead = message.status === 'opened';
  const date = formatChildTaskDate(message.sent_at ?? message.created_at);
  const summary = message.message || childMailboxFallbackSummary(message.card_type);

  return (
    <article
      className={`v1-message-row v2-mail-card v2-mail-card-${message.card_type}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen();
      }}
    >
      <header>
        <span className="v2-mail-card-icon"><Icon size={26} fill={message.card_type === 'card' ? 'currentColor' : 'none'} /></span>
        <div>
          <small className="v2-mail-type-badge">{childMailboxTypeLabel(message.card_type)}</small>
          <b>家長</b>
        </div>
        <em className={isRead ? 'is-read' : ''}>{isRead ? '已讀' : '未讀'}</em>
      </header>
      <div className="v2-mail-card-copy">
        <h3>{message.title || childMailboxTypeLabel(message.card_type)}</h3>
        {summary ? <p>{summary}</p> : null}
      </div>
      <MailboxCardMedia message={message} />
      <footer>
        <time>{date}</time>
        <ChevronRight size={20} />
      </footer>
    </article>
  );
}

function MailboxCardMedia({ message }: { message: LocalMailboxMessage }) {
  if (message.card_type === 'audio' && message.media_id) {
    return <MailboxAudio mediaId={message.media_id} compact />;
  }
  if (message.card_type === 'image' && message.media_id) {
    return (
      <div className="v2-mail-media-preview">
        <LocalShareMediaView mediaId={message.media_id} mediaType="photo" alt={message.title ?? '圖片訊息'} />
      </div>
    );
  }
  if (message.card_type === 'video' && message.media_id) {
    return (
      <div className="v2-mail-media-preview">
        <LocalShareMediaView mediaId={message.media_id} mediaType="video" />
      </div>
    );
  }
  if (message.card_type === 'card') {
    return (
      <div className="v2-mail-encouragement-preview">
        {message.media_id ? <LocalShareMediaView mediaId={message.media_id} mediaType="photo" alt={message.title ?? '鼓勵卡'} /> : <Heart size={58} fill="currentColor" />}
      </div>
    );
  }
  return null;
}

function MailboxAudio({ mediaId, compact = false }: { mediaId: string; compact?: boolean }) {
  return (
    <div className={`v2-mail-audio${compact ? ' is-compact' : ''}`} onClick={(event) => event.stopPropagation()}>
      <LocalShareMediaView mediaId={mediaId} mediaType="audio" className="v2-mail-audio-control" />
    </div>
  );
}

function MessageDetail({ message, onClose }: { message: LocalMailboxMessage; onClose: () => void }) {
  const Icon = childMailboxIconComponent(message.card_type);
  const isMediaLightbox = ['image', 'video'].includes(message.card_type);

  return (
    <div className={`v2-mail-modal${isMediaLightbox ? ' is-lightbox' : ''}`} role="dialog" aria-modal="true" onClick={onClose}>
      <article onClick={(event) => event.stopPropagation()}>
        <button type="button" className="v2-mail-modal-close" onClick={onClose} aria-label="關閉">×</button>
        <header>
          <span><Icon size={28} fill={message.card_type === 'card' ? 'currentColor' : 'none'} /></span>
          <div>
            <small>{childMailboxTypeLabel(message.card_type)}</small>
            <h2>{message.title || childMailboxTypeLabel(message.card_type)}</h2>
            <b>家長</b>
          </div>
          <em className={message.status === 'opened' ? 'is-read' : ''}>{message.status === 'opened' ? '已讀' : '未讀'}</em>
        </header>
        {message.message ? <p>{message.message}</p> : null}
        {message.card_type === 'audio' && message.media_id ? <MailboxAudio mediaId={message.media_id} /> : null}
        {message.card_type === 'image' && message.media_id ? (
          <div className="v2-mail-modal-media"><LocalShareMediaView mediaId={message.media_id} mediaType="photo" alt={message.title ?? '圖片訊息'} /></div>
        ) : null}
        {message.card_type === 'video' && message.media_id ? (
          <div className="v2-mail-modal-media"><LocalShareMediaView mediaId={message.media_id} mediaType="video" autoPlay /></div>
        ) : null}
        {message.card_type === 'card' ? <MailboxCardMedia message={message} /> : null}
        <time>{formatChildTaskDate(message.sent_at ?? message.created_at)}</time>
      </article>
    </div>
  );
}

function MailboxPagination({
  currentPage,
  totalPages,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="v2-mail-pagination" aria-label="信箱分頁">
      <button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>上一頁</button>
      <span>{currentPage} / {totalPages}</span>
      <button type="button" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>下一頁</button>
    </nav>
  );
}

function MailboxEmpty({ text }: { text: string }) {
  return (
    <div className="v2-mail-empty">
      <span>🐰</span>
      <strong>{text}</strong>
      <p>等家長送來鼓勵吧！</p>
    </div>
  );
}

function childMailboxTypeLabel(type: LocalMailboxMessage['card_type']) {
  return ({ text: '文字', card: '鼓勵卡', audio: '語音', image: '圖片', video: '影片', mixed: '混合' } as const)[type];
}

function childMailboxIconComponent(type: LocalMailboxMessage['card_type']) {
  return ({ text: Mail, card: Heart, audio: Mic, image: Image, video: Video, mixed: MoreHorizontal } as const)[type];
}

function childMailboxFallbackSummary(type: LocalMailboxMessage['card_type']) {
  return ({ text: '', card: '家長送來一張鼓勵卡', audio: '家長錄了一段語音給你', image: '家長分享了一張圖片', video: '家長分享了一段影片', mixed: '家長送來新的訊息' } as const)[type];
}




