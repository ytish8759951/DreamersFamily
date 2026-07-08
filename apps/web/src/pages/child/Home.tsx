import type { LucideIcon } from 'lucide-react';
import { Camera, ChevronRight, Image, Mic, Play, Volume2 } from 'lucide-react';
import { Component, useEffect, useMemo, type ErrorInfo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LocalShareMedia as LocalShareMediaView } from '../../components/LocalShareMedia';
import { debugChildBinding, getRepositoryDebugInfo, getRouteDebugInfo } from '../../lib/childBindingDebug';
import { dataMode } from '../../lib/dataRepository';
import { deviceBindingRepository } from '../../lib/deviceBindingRepository';
import { useDreamCoverMigration } from '../../lib/dreamCoverMigration';
import { growthRepository } from '../../lib/growthRepository';
import { piggyRepository } from '../../lib/piggyRepository';
import { starRepository } from '../../lib/starRepository';
import { tabletRepository } from '../../lib/tabletRepository';
import type {
  LocalDatabaseState,
  LocalSpecialDay,
  LocalShare,
  ShareWithMedia
} from '../../lib/localTypes';
import { getBirthdaySpecialDays } from '../../lib/specialDays';
import { useLocalDataState } from '../../lib/useLocalData';

type VoiceSource = { text: string; audioUrl?: string };

type ChildHomeErrorBoundaryState = {
  error: Error | null;
  componentStack: string;
};

class ChildHomeErrorBoundary extends Component<{ children: ReactNode }, ChildHomeErrorBoundaryState> {
  state: ChildHomeErrorBoundaryState = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): ChildHomeErrorBoundaryState {
    return { error, componentStack: '' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[child-home-runtime] ChildHome render error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack
    });
    this.setState({ error, componentStack: info.componentStack ?? '' });
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <main style={{ minHeight: '100vh', padding: 24, whiteSpace: 'pre-wrap', fontFamily: 'monospace', background: '#fff9f0', color: '#2f2e2b' }}>
        <h1>ChildHome Render Error</h1>
        <p>{error.name}: {error.message}</p>
        <h2>stack</h2>
        <pre>{error.stack ?? 'No error stack'}</pre>
        <h2>componentStack</h2>
        <pre>{componentStack || 'No component stack'}</pre>
      </main>
    );
  }
}

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

function traceChildHomeStep<T>(step: string, compute: () => T): T {
  try {
    console.log('[child-home-runtime] step start', { step });
    const result = compute();
    console.log('[child-home-runtime] step success', { step, result });
    return result;
  } catch (error) {
    console.error('[child-home-runtime] step error', {
      step,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      error
    });
    throw error;
  }
}

export function ChildHome() {
  return (
    <ChildHomeErrorBoundary>
      <ChildHomeContent />
    </ChildHomeErrorBoundary>
  );
}

function ChildHomeContent() {
  useDreamCoverMigration();
  const location = useLocation();
  const localState = useLocalDataState();
  const currentChildIdentity = localState.currentChildIdentity;
  const deviceBinding = localState.deviceBinding;
  const hasChildDeviceSession = Boolean(localState.currentChildIdentity || deviceBinding);
  const selectedChildId = useMemo(() => {
    const childId = new URLSearchParams(location.search).get('childId');
    return childId || localState.currentChildIdentity?.childId || deviceBinding || null;
  }, [deviceBinding, location.search, localState.currentChildIdentity?.childId]);
  const selectedChild = selectedChildId
    ? localState.children.find((child) => child.id === selectedChildId && child.status === 'active')
    : null;
  const latestDeviceBinding = selectedChildId
    ? localState.device_bindings
        .filter((record) => record.child_id === selectedChildId && record.binding_status === 'bound' && Boolean(record.used_at))
        .sort((first, second) => second.updated_at.localeCompare(first.updated_at))[0] ?? null
    : null;
  const hasActiveDeviceBinding = dataMode === 'supabase'
    ? Boolean(latestDeviceBinding)
    : hasChildDeviceSession;

  useEffect(() => {
    debugChildBinding('G.ui.render', {
      ...getRouteDebugInfo(location.pathname),
      ...getRepositoryDebugInfo(),
      renderSource: 'useLocalDataState -> dataRepository snapshot',
      selectedChildId,
      selectedChild: selectedChild
        ? {
            id: selectedChild.id,
            family_id: selectedChild.family_id,
            display_name: selectedChild.display_name,
            status: selectedChild.status
          }
        : null,
      deviceBindingRowsForChild: selectedChildId
        ? localState.device_bindings.filter((record) => record.child_id === selectedChildId)
        : [],
      latestDeviceBinding,
      hasActiveDeviceBinding,
      usesDeviceBindings: true,
      usesChildrenBindingFields: false,
      usesLocalStorageAsRenderSource: false,
      usesChildrenTableForBindingStatus: false,
      stateDeviceId: localState.device_id ?? null,
      currentChildIdentity: localState.currentChildIdentity,
      deviceBindingSession: localState.deviceBinding
    });
  }, [
    hasActiveDeviceBinding,
    latestDeviceBinding,
    localState.currentChildIdentity,
    localState.deviceBinding,
    localState.device_bindings,
    localState.device_id,
    location.pathname,
    selectedChild,
    selectedChildId
  ]);

  useEffect(() => {
    const sessionChildId = localState.currentChildIdentity?.childId ?? deviceBinding;
    if (!sessionChildId) return;
    try {
      deviceBindingRepository.syncChildDeviceLogin(sessionChildId);
    } catch (error) {
      console.error('[child-home-runtime] syncChildDeviceLogin error', {
        sessionChildId,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        error
      });
    }
  }, [deviceBinding, localState.currentChildIdentity?.childId]);

  if (!selectedChild && !hasActiveDeviceBinding) {
    return (
      <div className="v1-page v1-home v2-home-page">
        <section className="child-home-install-banner">
          <strong>此平板尚未綁定孩子，請家長重新掃描 QR Code</strong>
        </section>
        <div className="child-home-empty-state">
          <h1>孩子首頁</h1>
          <p>裝置綁定後會自動進入這裡。</p>
        </div>
      </div>
    );
  }

  const childName = selectedChild?.display_name ?? currentChildIdentity?.displayName ?? '小朋友';
  const childShares = traceChildHomeStep('buildChildShares', () => selectedChild
    ? buildChildShares(localState).filter((share) => share.child_id === selectedChild.id).slice(0, 3)
    : []);
  const piggySavings = traceChildHomeStep('piggyRepository.getPiggyBankSummary', () => selectedChild
    ? piggyRepository.getPiggyBankSummary(selectedChild.id).currentSavings
    : 0);
  const totalStars = traceChildHomeStep('starRepository.getStarBalance', () => selectedChild
    ? starRepository.getStarBalance(selectedChild.id)
    : 0);
  const remainingScreenMinutes = traceChildHomeStep('tabletRepository.getTodayScreenTimeByChild', () => selectedChild
    ? tabletRepository.getTodayScreenTimeByChild(selectedChild.id).remainingMinutes
    : 0);
  const latestGrowth = traceChildHomeStep('growthRepository.getLatestGrowthRecordByChild', () => selectedChild
    ? growthRepository.getLatestGrowthRecordByChild(selectedChild.id)
    : null);
  const specialDaySummary = traceChildHomeStep('getHomeSpecialDaySummary', () => selectedChild ? getHomeSpecialDaySummary(localState, selectedChild.id) : null);
  const visibleSpecialDays = traceChildHomeStep('visibleSpecialDays', () => specialDaySummary?.specialDays.slice(0, 3) ?? []);

  return (
    <div className="v1-page v1-home v2-home-page">
      {hasActiveDeviceBinding ? (
        <section className="child-home-install-banner">
          <strong>孩子裝置已啟用</strong>
          <p>請在這個孩子首頁加入主畫面。</p>
        </section>
      ) : null}
      <header className="v1-brand-header">
        <h1>小小夢想家 Family <span>✦</span></h1>
        <p>今天也一起收集星星、分享與成長。</p>
      </header>

      <button
        className="v1-home-hero"
        onClick={() => playVoice({ text: `早安 ${childName}，今天也一起完成冒險吧。` })}
      >
        <div className="v1-bunny-card">☁</div>
        <div className="v1-home-copy">
          <small>小小夢想家 Family</small>
          <h2>早安，{childName}</h2>
          <p>今天想完成哪一個小冒險？</p>
        </div>
        <span className="v1-listen"><Volume2 size={19} fill="currentColor" /> 聽一聽</span>
      </button>

      <Link to="/child/share" className="v1-panel v1-recent-panel v1-home-link-panel">
        <SectionHeading icon={Camera} title="最近分享" action="查看全部" actionHref="/child/share" />
        <div className="v1-recent-grid">
          {childShares.length ? (
            childShares.map((share) => <LocalRecentCard key={share.id} share={share} />)
          ) : (
            <ChildTaskEmpty text={selectedChild ? '還沒有分享紀錄' : '請先選擇孩子'} />
          )}
        </div>
      </Link>

      <Link to="/child/growth" className="v1-panel v1-growth-panel v1-home-link-panel">
        <SectionHeading title="成長紀錄" accent="✿" action="查看全部" actionHref="/child/growth" />
        {latestGrowth ? (
          <div className="v1-growth-grid">
            <Metric icon="📏" label="身高" value={formatMetric(latestGrowth.height_cm)} unit="cm" note={`最近紀錄 ${formatChildDate(latestGrowth.date)}`} tone="blue" />
            <Metric icon="⚖" label="體重" value={formatMetric(latestGrowth.weight_kg)} unit="kg" note={`最近紀錄 ${formatChildDate(latestGrowth.date)}`} tone="green" />
            <Metric icon="📚" label="閱讀" value={String(latestGrowth.reading_count)} unit="本" note={latestGrowth.note || '最近閱讀紀錄'} tone="yellow" />
          </div>
        ) : (
          <ChildTaskEmpty text={selectedChild ? '尚未建立成長紀錄' : '請先選擇孩子'} />
        )}
      </Link>

      <section className="v1-home-stats v2-home-stats">
        <Link to="/child/dreams" className="v1-stat-link">
          <StatCard
            icon={<PiggyBankIllustration />}
            title="撲滿總金額"
            value={formatChildMoney(piggySavings)}
            unit=""
            note="目前已存起來的零用錢"
            tone="pink"
          />
        </Link>
        <StatCard icon="⭐" title="冒險星星" value={String(totalStars)} unit="顆" note="完成任務與分享可以收集星星" tone="yellow" />
        <StatCard icon="🕒" title="平板時間" value={String(remainingScreenMinutes)} unit="分" note="目前存摺平板時間餘額" tone="blue" />
      </section>

      <Link to="/child/special-days" className="child-home-special-days">
        <header>
          <h2>特殊日子</h2>
        </header>
        {specialDaySummary?.birthday ? (
          <div className="child-home-special-layout">
            <section className="child-home-birthday-age">
              <span>{specialDayIcon('birthday')}</span>
              <div>
                <strong>{specialDaySummary.birthday.age}<small>歲</small></strong>
                <time>{formatSlashDate(specialDaySummary.birthday.birthDate)}</time>
              </div>
            </section>
            <div className="child-home-special-events">
              {visibleSpecialDays.length ? (
                visibleSpecialDays.map((day) => <SpecialDayMiniItem key={day.id} day={day} />)
              ) : (
                <p>尚未新增特殊日子</p>
              )}
            </div>
            <section className="child-home-birthday-countdown">
              {specialDaySummary.birthday.daysLeft === 0 ? (
                <strong className="is-today">🎉 今天生日！</strong>
              ) : (
                <>
                  <time>{formatSlashDate(specialDaySummary.birthday.nextDate)}</time>
                  <span>距離生日</span>
                  <strong>{specialDaySummary.birthday.daysLeft}<small>天</small></strong>
                </>
              )}
            </section>
          </div>
        ) : (
          <ChildTaskEmpty text={selectedChild ? '請在孩子管理設定生日' : '請先選擇孩子'} />
        )}
      </Link>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  accent,
  action,
  actionHref
}: {
  icon?: LucideIcon;
  title: string;
  accent?: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="v1-section-heading">
      <h2>{Icon ? <Icon size={22} /> : null}{title}{accent ? <span>{accent}</span> : null}</h2>
      {action && actionHref ? <span className="v1-section-action">{action} <ChevronRight size={17} /></span> : null}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
  note,
  tone
}: {
  icon: string;
  label: string;
  value: string;
  unit: string;
  note: string;
  tone: string;
}) {
  return (
    <article className={`v1-metric v1-tone-${tone}`}>
      <span>{icon}</span>
      <div><strong>{label}</strong><p>{value}<small>{unit}</small></p><em>{note}</em></div>
      <ChevronRight className="v1-mobile-chevron" size={18} />
    </article>
  );
}

function StatCard({
  icon,
  title,
  value,
  unit,
  note,
  tone
}: {
  icon: ReactNode;
  title: string;
  value: string;
  unit: string;
  note: string;
  tone: string;
}) {
  return (
    <article className={`v1-stat v1-tone-${tone}`}>
      <span className="child-home-stat-illustration">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{value}{unit ? <small>{unit}</small> : null}</p>
        <em>{note}</em>
      </div>
    </article>
  );
}

type HomeSpecialDay = {
  id: string;
  title: string;
  date: string;
  type: LocalSpecialDay['type'];
  daysLeft: number;
};

type HomeBirthdayInfo = {
  birthDate: string;
  nextDate: string;
  daysLeft: number;
  age: number;
};

function SpecialDayMiniItem({ day }: { day: HomeSpecialDay }) {
  return (
    <section className="child-home-special-mini-item">
      <span>{specialDayIcon(day.type)}</span>
      <div>
        <strong>{day.title}</strong>
        <time>{formatSlashDate(day.date)}</time>
      </div>
    </section>
  );
}

function PiggyBankIllustration() {
  return (
    <svg className="child-home-piggy-illustration" viewBox="0 0 120 100" aria-hidden="true">
      <ellipse cx="62" cy="57" rx="42" ry="31" fill="#ffaaa7" />
      <circle cx="34" cy="47" r="17" fill="#ffb9b5" />
      <path d="M23 33 18 17l18 9Z" fill="#ff9f9b" />
      <path d="M48 30 54 14l13 16Z" fill="#ff9f9b" />
      <ellipse cx="27" cy="48" rx="10" ry="8" fill="#ff8f8b" />
      <circle cx="24" cy="48" r="1.8" fill="#9a5650" />
      <circle cx="30" cy="48" r="1.8" fill="#9a5650" />
      <circle cx="37" cy="40" r="3.2" fill="#3f3430" />
      <circle cx="53" cy="39" r="3.2" fill="#3f3430" />
      <circle cx="90" cy="27" r="12" fill="#f4c95f" stroke="#c99e3a" strokeWidth="3" />
      <path d="M91 19v17M84 27h13" stroke="#b98625" strokeWidth="3" strokeLinecap="round" />
      <path d="M98 53c15 0 17 16 4 20" fill="none" stroke="#ff8f8b" strokeWidth="6" strokeLinecap="round" />
      <rect x="40" y="80" width="12" height="12" rx="5" fill="#ea8f8b" />
      <rect x="78" y="80" width="12" height="12" rx="5" fill="#ea8f8b" />
      <ellipse cx="47" cy="58" rx="4" ry="3" fill="#ed8f8a" opacity=".55" />
    </svg>
  );
}

function LocalRecentCard({ share }: { share: ShareWithMedia }) {
  const media = share.media[0];
  const type = childShareTypeLabel(share.share_type);
  const Icon = share.share_type === 'audio' ? Mic : share.share_type === 'video' ? Play : Image;
  return (
    <article className="v1-recent-card">
      <div
        className={`v1-media-thumb${share.share_type === 'audio' ? ' is-voice' : ''}`}
      >
        {media?.media_type === 'photo' ? (
          <LocalShareMediaView mediaId={media.id} mediaType="photo" alt={share.title ?? ''} />
        ) : media?.media_type === 'video' ? (
          <LocalShareMediaView mediaId={media.id} mediaType="video" controls={false} muted />
        ) : media ? <span>{childShareTypeIcon(share.share_type)}</span> : null}
        <i><Icon size={20} fill={share.share_type === 'video' ? 'currentColor' : 'none'} /></i>
      </div>
      <div><strong>{share.title || type}</strong><time>{childShareStatusLabel(share.status)}</time></div>
    </article>
  );
}

function ChildTaskEmpty({ text }: { text: string }) {
  return <div className="child-task-empty"><span>☁</span><p>{text}</p></div>;
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
  return ({ text: '✉', photo: '📷', audio: '🎙', video: '▶', mixed: '✨' } as const)[type];
}

function childShareStatusLabel(status: LocalShare['status']) {
  return ({ draft: '草稿', pending_review: '待家長審核', approved: '已通過', rejected: '已退回', archived: '已封存' } as const)[status];
}

function formatMetric(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatChildDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(`${value}T00:00:00`));
}

function formatChildMoney(value: number) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0
  }).format(value);
}

function getHomeSpecialDaySummary(state: LocalDatabaseState, childId: string): { birthday: HomeBirthdayInfo | null; specialDays: HomeSpecialDay[] } {
  const child = state.children.find((item) => item.id === childId && item.status === 'active');
  const birthday = child ? getBirthdaySpecialDays([child])[0] ?? null : null;
  const birthDate = child?.birth_date ?? child?.birthday ?? null;
  const birthdayInfo = birthday && birthDate
    ? {
        birthDate,
        nextDate: birthday.date,
        daysLeft: birthday.daysLeft,
        age: calculateAge(birthDate)
      }
    : null;
  const childDays = state.special_days
    .filter((day) => !day.deleted_at && day.child_id === childId && day.type !== 'birthday')
    .map((day) => ({
      id: day.id,
      title: day.title,
      date: day.date,
      type: day.type,
      daysLeft: daysUntil(day.date)
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  return { birthday: birthdayInfo, specialDays: childDays };
}

function daysUntil(date: string) {
  const start = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}

function specialDayIcon(type: LocalSpecialDay['type']) {
  return ({
    birthday: '🎂',
    anniversary: '🎈',
    holiday: '🎄',
    family_event: '🏕',
    other: '🎁'
  } as const)[type];
}

function formatSlashDate(value: string) {
  return value.replace(/-/g, '/');
}

function calculateAge(birthDate: string) {
  const date = new Date(`${birthDate}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const birthdayPassed =
    today.getMonth() > date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() >= date.getDate());
  if (!birthdayPassed) age -= 1;
  return Math.max(0, age);
}

