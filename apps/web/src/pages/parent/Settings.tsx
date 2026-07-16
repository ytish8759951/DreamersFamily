import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Database, Download, LogOut, Settings as SettingsIcon, Trash2, Upload, UserRound, X } from 'lucide-react';
import QRCode from 'react-qr-code';
import { dataMode, dataModeLabel } from '../../lib/dataRepository';
import {
  createProductionFamilyInvite,
  leaveProductionFamily,
  listProductionFamilyParents,
  revokeDeviceBoundParent,
  unbindParentDeviceFromFamily,
  type ProductionFamilyParent
} from '../../lib/supabaseData';
import { createParentInviteToken, getParentInviteUrl } from '../../lib/parentDeviceBinding';
import { settingsRepository } from '../../lib/settingsRepository';
import type { LocalFamilySettings } from '../../lib/localTypes';
import type { TestDataCleanupCounts, TestDataCleanupPreview, TestDataCleanupResult } from '../../lib/localData';
import { useLocalDataState } from '../../lib/useLocalData';
import { useSupabaseRuntimeInfo } from '../../lib/useSupabaseRuntimeInfo';
import { getErrorMessage } from '../../lib/errorDiagnostics';

type SettingsForm = Omit<LocalFamilySettings, 'family_created_at' | 'updated_at'>;
const CLEANUP_CONFIRM_TEXT = '清空測試資料';

export function Settings() {
  const navigate = useNavigate();
  const state = useLocalDataState();
  const runtimeInfo = useSupabaseRuntimeInfo();
  const settings = state.family_settings;
  const [form, setForm] = useState<SettingsForm>(() => toForm(settings));
  const [message, setMessage] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [members, setMembers] = useState<ProductionFamilyParent[]>([]);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState<TestDataCleanupPreview | null>(null);
  const [cleanupResult, setCleanupResult] = useState<TestDataCleanupResult | null>(null);
  const [cleanupRemoveFamily, setCleanupRemoveFamily] = useState(false);
  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupError, setCleanupError] = useState('');
  const usage = useMemo(() => estimateStorageUsage(), [state]);
  const familyName = settings.family_name || '小小夢想家 Family';
  const parentRoleLabel = runtimeInfo.parentRole === 'owner' ? 'Owner' : runtimeInfo.parentRole ? 'Parent' : '-';
  const canManageTestData = dataMode !== 'supabase' || runtimeInfo.parentRole === 'owner';

  useEffect(() => {
    let cancelled = false;
    if (dataMode !== 'supabase' || !runtimeInfo.familyId) {
      setMembers([]);
      return;
    }
    void listProductionFamilyParents(runtimeInfo.familyId)
      .then((parents) => {
        if (!cancelled) setMembers(parents);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [runtimeInfo.familyId]);

  const update = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      settingsRepository.updateSettings({
        ...form,
        family_avatar_data_url: null,
        parent_avatar_data_url: null,
        default_daily_screen_minutes: Number(form.default_daily_screen_minutes),
        default_daily_star_limit: Number(form.default_daily_star_limit),
        screen_time_star_minutes_per_star: Number(form.screen_time_star_minutes_per_star)
      });
      setMessage('設定已儲存');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '設定儲存失敗');
    }
  };

  const readImage = async (event: ChangeEvent<HTMLInputElement>, key: 'family_avatar_media_id' | 'parent_avatar_media_id') => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const mediaId = await settingsRepository.saveAvatarFile({
      ownerId: key === 'family_avatar_media_id' ? 'family-avatar' : 'parent-avatar',
      file
    });
    update(key, mediaId);
  };

  const exportData = () => {
    const raw = settingsRepository.exportData();
    settingsRepository.downloadJson(raw, `little-dreamers-family-${new Date().toISOString().slice(0, 10)}.json`);
    setMessage('已匯出 JSON');
  };

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      settingsRepository.importData(await file.text());
      setForm(toForm(settingsRepository.getSettings()));
      setMessage('資料已匯入');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '匯入資料失敗');
    } finally {
      event.currentTarget.value = '';
    }
  };

  const openCleanupPreview = async () => {
    setCleanupOpen(true);
    setCleanupPreview(null);
    setCleanupResult(null);
    setCleanupConfirmText('');
    setCleanupError('');
    setCleanupBusy(true);
    try {
      const preview = await settingsRepository.previewTestDataCleanup(runtimeInfo.familyId ?? null);
      setCleanupPreview(preview);
      setCleanupRemoveFamily(false);
    } catch (caught) {
      setCleanupError(getErrorMessage(caught, '無法讀取清理預覽'));
    } finally {
      setCleanupBusy(false);
    }
  };

  const executeCleanup = async () => {
    if (cleanupConfirmText !== CLEANUP_CONFIRM_TEXT || cleanupBusy) return;
    setCleanupBusy(true);
    setCleanupError('');
    setCleanupResult(null);
    try {
      const result = await settingsRepository.executeTestDataCleanup({
        familyId: cleanupPreview?.familyId ?? runtimeInfo.familyId ?? null,
        removeFamily: cleanupRemoveFamily
      });
      setCleanupResult(result);
      setForm(toForm(settingsRepository.getSettings()));
      setMessage(cleanupRemoveFamily ? '已清空測試資料並移除目前家庭，請重新建立家庭。' : '已清空目前家庭的測試資料。');
      if (result.removedFamily) {
        navigate('/create-family', { replace: true });
      }
    } catch (caught) {
      setCleanupError(getErrorMessage(caught, '清空測試資料失敗'));
    } finally {
      setCleanupBusy(false);
    }
  };

  const createInvite = async () => {
    setMessage('');
    try {
      const invite = await createProductionFamilyInvite('guardian');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const token = createParentInviteToken({
        familyId: invite?.family_id ?? runtimeInfo.familyId ?? '',
        familyName,
        ownerName: form.parent_name || 'Owner',
        inviteCode: invite?.invite_code ?? '',
        expiresAt,
        createdAt: new Date().toISOString()
      });
      const link = getParentInviteUrl(token);
      setInviteLink(link);
      setInviteCode(invite?.invite_code ?? '');
      setMessage(invite?.invite_code ? `邀請碼已建立：${invite.invite_code}` : '邀請碼已建立');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '建立邀請碼失敗');
    }
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setMessage('邀請連結已複製');
    } catch {
      setMessage('無法複製邀請連結，請手動選取連結。');
    }
  };

  const leaveFamily = async () => {
    if (!window.confirm('確定要退出目前家庭嗎？這只會移除你的家長關聯，不會刪除家庭資料。')) return;
    try {
      if (runtimeInfo.userId) await leaveProductionFamily();
      else unbindParentDeviceFromFamily();
      setMessage('已退出家庭');
      navigate('/login', { replace: true });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '退出家庭失敗');
    }
  };

  const revokeMember = async (member: ProductionFamilyParent) => {
    if (!runtimeInfo.familyId || !window.confirm(`確定解除 ${member.display_name} 的家長裝置綁定嗎？`)) return;
    try {
      await revokeDeviceBoundParent(member.id, runtimeInfo.familyId);
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setMessage('已解除家長裝置綁定');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '解除綁定失敗');
    }
  };

  return (
    <form className="settings-page" onSubmit={save}>
      <header className="settings-hero">
        <div>
          <span><SettingsIcon size={30} /></span>
          <h1>設定</h1>
          <p>管理家庭資料、分享權限與資料匯入匯出。</p>
        </div>
        <button type="submit">儲存設定</button>
      </header>

      {message ? <p className="settings-message">{message}</p> : null}

      <section className="settings-grid">
        <article className="settings-panel">
          <header><h2>家庭資料</h2><small>{formatDate(settings.family_created_at)} 建立</small></header>
          <div className="settings-avatar-row">
            <span><AvatarPreview mediaId={form.family_avatar_media_id} fallback="🏠" alt="家庭頭像" /></span>
            <label>家庭頭像<input type="file" accept="image/*" onChange={(event) => void readImage(event, 'family_avatar_media_id')} /></label>
          </div>
          <label>家庭名稱<input value={form.family_name} onChange={(event) => update('family_name', event.target.value)} /></label>
          <label>家庭介紹<textarea rows={3} value={form.family_intro} onChange={(event) => update('family_intro', event.target.value)} /></label>
        </article>

        <article className="settings-panel">
          <header><h2>家長資料</h2><UserRound size={22} /></header>
          <div className="settings-avatar-row">
            <span><AvatarPreview mediaId={form.parent_avatar_media_id} fallback="👤" alt="家長頭像" /></span>
            <label>家長頭像<input type="file" accept="image/*" onChange={(event) => void readImage(event, 'parent_avatar_media_id')} /></label>
          </div>
          <label>家長名稱<input value={form.parent_name} onChange={(event) => update('parent_name', event.target.value)} /></label>
          <label>電子郵件<input type="email" value={form.parent_email} onChange={(event) => update('parent_email', event.target.value)} /></label>
        </article>

        <article className="settings-panel">
          <header><h2>孩子預設值</h2><small>{dataModeLabel}</small></header>
          <label>每日螢幕時間<input type="number" min="0" value={form.default_daily_screen_minutes} onChange={(event) => update('default_daily_screen_minutes', Number(event.target.value))} /></label>
          <label>每日星星上限<input type="number" min="0" value={form.default_daily_star_limit} onChange={(event) => update('default_daily_star_limit', Number(event.target.value))} /></label>
          <label>每顆星兌換分鐘<input type="number" min="1" value={form.screen_time_star_minutes_per_star} onChange={(event) => update('screen_time_star_minutes_per_star', Number(event.target.value))} /></label>
          <label>預設主題<select value={form.default_theme_color} onChange={(event) => update('default_theme_color', event.target.value)}><option value="blue">藍色</option><option value="green">綠色</option><option value="pink">粉色</option><option value="yellow">黃色</option></select></label>
          <Toggle label="允許照片分享" checked={form.allow_photo_sharing} onChange={(value) => update('allow_photo_sharing', value)} />
          <Toggle label="允許影片分享" checked={form.allow_video_sharing} onChange={(value) => update('allow_video_sharing', value)} />
          <Toggle label="允許語音分享" checked={form.allow_audio_sharing} onChange={(value) => update('allow_audio_sharing', value)} />
        </article>

        <article className="settings-panel">
          <header><h2>通知設定</h2><small>保留 V1.0 欄位</small></header>
          <Toggle label="任務完成" checked={form.notify_task_completed} onChange={(value) => update('notify_task_completed', value)} />
          <Toggle label="夢想完成" checked={form.notify_dream_completed} onChange={(value) => update('notify_dream_completed', value)} />
          <Toggle label="分享待審" checked={form.notify_share_pending} onChange={(value) => update('notify_share_pending', value)} />
          <Toggle label="特殊日提醒" checked={form.notify_special_day} onChange={(value) => update('notify_special_day', value)} />
        </article>
      </section>

      {cleanupOpen ? (
        <div className="settings-modal-backdrop" role="presentation" onMouseDown={() => !cleanupBusy && setCleanupOpen(false)}>
          <section className="local-form-dialog settings-cleanup-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-cleanup-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <small>危險操作</small>
                <h2 id="settings-cleanup-title">清空所有測試資料</h2>
              </div>
              <button type="button" onClick={() => setCleanupOpen(false)} disabled={cleanupBusy} aria-label="關閉"><X size={18} /></button>
            </header>
            <div className="settings-cleanup-body">
              <p className="settings-cleanup-warning">此操作會永久刪除目前家庭的測試資料，無法從介面復原。Supabase Auth 家長帳號、schema、migration、RLS、RPC 與部署設定會保留。</p>
              {cleanupBusy && !cleanupPreview ? <p className="settings-operation-summary">正在讀取即將刪除的資料數量...</p> : null}
              {cleanupError ? <p className="settings-cleanup-error">{cleanupError}</p> : null}
              {cleanupPreview ? (
                <>
                  <CleanupCounts counts={cleanupPreview.counts} />
                  <div className="settings-cleanup-options">
                    <label className="settings-toggle">
                      <span>保留目前家庭，只清除家庭內內容</span>
                      <input type="radio" name="cleanupScope" checked={!cleanupRemoveFamily} onChange={() => setCleanupRemoveFamily(false)} disabled={cleanupBusy} />
                    </label>
                    <label className="settings-toggle">
                      <span>連目前家庭一起移除，登入後重新建立家庭</span>
                      <input type="radio" name="cleanupScope" checked={cleanupRemoveFamily} onChange={() => setCleanupRemoveFamily(true)} disabled={cleanupBusy} />
                    </label>
                  </div>
                  <label className="settings-confirm-input">
                    請輸入「{CLEANUP_CONFIRM_TEXT}」啟用最終確認
                    <input value={cleanupConfirmText} onChange={(event) => setCleanupConfirmText(event.target.value)} disabled={cleanupBusy} />
                  </label>
                  {cleanupResult ? <p className="settings-operation-summary">{formatCleanupResult(cleanupResult)}</p> : null}
                </>
              ) : null}
            </div>
            <footer>
              <button type="button" onClick={() => setCleanupOpen(false)} disabled={cleanupBusy}>取消</button>
              <button type="button" className="is-danger" onClick={() => void executeCleanup()} disabled={!cleanupPreview || cleanupConfirmText !== CLEANUP_CONFIRM_TEXT || cleanupBusy}>
                {cleanupBusy ? '執行中...' : '永久清空測試資料'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <section className="settings-data-panel">
        <header><div><h2>測試資料管理</h2><p>{dataMode === 'supabase' ? '正式資料清理會先預覽數量，並透過 Owner 限定 RPC transaction 執行。' : '本機模式會清理目前瀏覽器內的 local/mock 測試資料。'}</p></div><Database size={28} /></header>
        <div className="settings-data-actions">
          <button type="button" onClick={exportData}><Download size={18} /> 匯出備份 JSON</button>
          <label><Upload size={18} /> 匯入 JSON<input type="file" accept="application/json,.json" onChange={importData} /></label>
          <button type="button" className="is-danger" onClick={() => void openCleanupPreview()} disabled={!canManageTestData || cleanupBusy}><Trash2 size={18} /> 清空所有測試資料</button>
        </div>
        {!canManageTestData ? <p className="settings-cleanup-error">只有目前家庭的 Owner 可以管理測試資料。</p> : null}
        <dl>
          <div><dt>{dataMode === 'supabase' ? 'Repository JSON 大小' : 'localStorage 用量'}</dt><dd>{usage.kb} KB</dd></div>
          <div><dt>dataMode</dt><dd>{dataMode}</dd></div>
          <div><dt>資料筆數</dt><dd>{usage.records}</dd></div>
          <div><dt>最後更新</dt><dd>{formatDate(state.updated_at)}</dd></div>
        </dl>
      </section>

      <section className="settings-data-panel">
        <header><div><h2>家庭管理</h2><p>邀請第二位家長加入目前家庭，加入後會共用同一份家庭資料。</p></div><UserRound size={28} /></header>
        <dl>
          <div><dt>家庭名稱</dt><dd>{familyName}</dd></div>
          <div><dt>目前家長角色</dt><dd>{parentRoleLabel}</dd></div>
        </dl>
        <h3 className="settings-subtitle">家庭成員</h3>
        <div className="settings-member-list">
          {members.length ? members.map((member) => (
            <article key={member.id}>
              <strong>{member.display_name}{member.parent_role === 'owner' ? '（Owner）' : ''}</strong>
              <small>{member.relation || (member.parent_role === 'owner' ? 'Owner' : 'Parent')}</small>
              <span>{member.device_label || '未知裝置'} · {member.last_seen_at ? formatDate(member.last_seen_at) : '尚無上線紀錄'}</span>
              {runtimeInfo.parentRole === 'owner' && member.parent_role !== 'owner' ? (
                <button type="button" className="settings-inline-danger" onClick={() => void revokeMember(member)}>解除綁定</button>
              ) : null}
            </article>
          )) : <p>尚未讀取到家庭成員。</p>}
        </div>
        <h3 className="settings-subtitle">邀請家長</h3>
        <div className="settings-data-actions">
          <button type="button" onClick={() => void createInvite()} disabled={dataMode !== 'supabase' || runtimeInfo.parentRole !== 'owner'}>
            {inviteCode ? '重新產生 QR' : '產生家長邀請 QR'}
          </button>
          <button type="button" onClick={() => void copyInviteLink()} disabled={!inviteLink}>
            <Copy size={18} /> 複製邀請連結
          </button>
          <button type="button" className="is-danger" onClick={() => void leaveFamily()} disabled={dataMode !== 'supabase'}>
            <LogOut size={18} /> 退出家庭
          </button>
        </div>
        {inviteLink ? (
          <div className="settings-invite-card">
            <div className="settings-invite-qr" aria-label="邀請連結 QR Code">
              <QRCode value={inviteLink} size={132} />
            </div>
            <dl>
              <div><dt>邀請碼</dt><dd>{inviteCode || '-'}</dd></div>
              <div><dt>邀請連結</dt><dd>{inviteLink}</dd></div>
            </dl>
          </div>
        ) : (
          <p className="settings-invite-empty">尚未產生邀請。Owner 可產生邀請碼、連結與 QR Code。</p>
        )}
      </section>
    </form>
  );
}

const cleanupCountLabels: Record<string, string> = {
  families: '家庭',
  family_members: '家庭成員',
  family_memberships: '家庭成員',
  children: '孩子',
  child_login_challenges: '孩子登入邀請',
  child_onboarding_tokens: '舊版孩子 QR 邀請',
  child_sessions: '孩子登入狀態',
  device_bindings: '裝置綁定',
  child_device_heartbeats: '裝置在線紀錄',
  task_records: '任務完成紀錄',
  tasks: '任務',
  stars: '星星與獎勵',
  badges: '徽章',
  child_badges: '孩子徽章',
  dreams: '撲滿目標',
  dream_funds: '撲滿流水',
  piggy_bank_records: '撲滿紀錄',
  store_items: '商品／兌換項目',
  purchases: '兌換紀錄',
  growth_records: '成長紀錄',
  shares: '分享內容',
  share_media: '分享附件',
  encouragement_cards: '鼓勵卡片',
  mailbox_messages: '信箱訊息',
  special_days: '特殊日',
  notifications: '通知',
  tablet_time: '平板時間紀錄',
  screen_time_logs: '平板時間紀錄',
  screen_time_requests: '平板時間申請',
  screen_time_schedules: '平板時間設定'
};

const cleanupCountGroups: Array<{ title: string; keys: string[] }> = [
  {
    title: '家庭與孩子',
    keys: ['families', 'family_members', 'family_memberships', 'children']
  },
  {
    title: '裝置與登入',
    keys: ['device_bindings', 'child_login_challenges', 'child_onboarding_tokens', 'child_sessions', 'child_device_heartbeats']
  },
  {
    title: '任務與獎勵',
    keys: ['tasks', 'task_records', 'stars', 'badges', 'child_badges']
  },
  {
    title: '撲滿與成長',
    keys: ['dreams', 'dream_funds', 'piggy_bank_records', 'store_items', 'purchases', 'growth_records', 'tablet_time', 'screen_time_logs', 'screen_time_requests', 'screen_time_schedules']
  },
  {
    title: '分享與信箱',
    keys: ['shares', 'share_media', 'encouragement_cards', 'mailbox_messages', 'special_days', 'notifications']
  }
];

const fallbackCleanupWords: Record<string, string> = {
  family: '家庭',
  families: '家庭',
  members: '成員',
  children: '孩子',
  child: '孩子',
  login: '登入',
  challenges: '邀請',
  challenge: '邀請',
  device: '裝置',
  devices: '裝置',
  bindings: '綁定',
  binding: '綁定',
  heartbeat: '在線紀錄',
  heartbeats: '在線紀錄',
  presence: '在線狀態',
  task: '任務',
  tasks: '任務',
  records: '紀錄',
  record: '紀錄',
  store: '商品',
  items: '項目',
  item: '項目',
  piggy: '撲滿',
  bank: '帳本',
  stars: '星星',
  rewards: '獎勵',
  growth: '成長',
  shares: '分享',
  share: '分享',
  media: '附件',
  inbox: '信箱',
  mailbox: '信箱',
  messages: '訊息',
  message: '訊息',
  notifications: '通知',
  notification: '通知',
  screen: '平板',
  time: '時間',
  tablet: '平板',
  sessions: '登入狀態',
  session: '登入狀態',
  purchases: '兌換紀錄',
  purchase: '兌換紀錄'
};

function getCleanupCountLabel(key: string) {
  if (cleanupCountLabels[key]) return cleanupCountLabels[key];
  const translated = key
    .split('_')
    .filter(Boolean)
    .map((word) => fallbackCleanupWords[word.toLowerCase()] ?? word.replace(/^\w/, (value) => value.toUpperCase()))
    .join(' ');
  return `其他資料：${translated || '未分類項目'}`;
}

function CleanupCounts({ counts }: { counts: TestDataCleanupCounts }) {
  const knownKeys = new Set(cleanupCountGroups.flatMap((group) => group.keys));
  const unknownKeys = Object.keys(counts).filter((key) => !knownKeys.has(key));
  const groups = unknownKeys.length
    ? [...cleanupCountGroups, { title: '其他資料', keys: unknownKeys }]
    : cleanupCountGroups;
  return (
    <div className="settings-cleanup-count-groups">
      {groups.map((group) => (
        <section key={group.title} className="settings-cleanup-count-group">
          <h3>{group.title}</h3>
          <dl className="settings-cleanup-counts">
            {group.keys.map((key) => {
              const value = Number(counts[key] ?? 0);
              return (
                <div key={key} className={value === 0 ? 'is-empty' : undefined}>
                  <dt>{getCleanupCountLabel(key)}</dt>
                  <dd>{value}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}

function formatCleanupResult(result: TestDataCleanupResult) {
  const total = Object.values(result.deletedCounts).reduce((sum, value) => sum + Number(value || 0), 0);
  return `已刪除 ${total} 筆測試資料；保留 ${Object.keys(result.preserved).join('、') || '必要系統資料'}。`;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="settings-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function AvatarPreview({ mediaId, fallback, alt }: { mediaId?: string | null; fallback: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!mediaId) return () => {
      cancelled = true;
    };
    void settingsRepository.getAvatarUrl(mediaId).then((value) => {
      if (!cancelled) setUrl(value);
      else settingsRepository.releaseAvatarUrl(mediaId);
    });
    return () => {
      cancelled = true;
      settingsRepository.releaseAvatarUrl(mediaId);
    };
  }, [mediaId]);

  return url ? <img src={url} alt={alt} /> : <>{fallback}</>;
}

function toForm(settings: LocalFamilySettings): SettingsForm {
  return {
    family_name: settings.family_name,
    family_intro: settings.family_intro,
    family_avatar_data_url: null,
    family_avatar_media_id: settings.family_avatar_media_id,
    parent_name: settings.parent_name,
    parent_email: settings.parent_email,
    parent_avatar_data_url: null,
    parent_avatar_media_id: settings.parent_avatar_media_id,
    default_daily_screen_minutes: settings.default_daily_screen_minutes,
    screen_time_star_minutes_per_star: settings.screen_time_star_minutes_per_star,
    default_daily_star_limit: settings.default_daily_star_limit,
    default_theme_color: settings.default_theme_color,
    allow_photo_sharing: settings.allow_photo_sharing,
    allow_video_sharing: settings.allow_video_sharing,
    allow_audio_sharing: settings.allow_audio_sharing,
    notify_task_completed: settings.notify_task_completed,
    notify_dream_completed: settings.notify_dream_completed,
    notify_share_pending: settings.notify_share_pending,
    notify_special_day: settings.notify_special_day
  };
}

function estimateStorageUsage() {
  const raw = settingsRepository.exportData();
  const parsed = settingsRepository.getState();
  const records =
    parsed.children.length +
    parsed.tasks.length +
    parsed.stars.length +
    parsed.dreams.length +
    parsed.dream_funds.length +
    parsed.shares.length +
    parsed.share_media.length +
    parsed.encouragement_cards.length +
    parsed.badges.length +
    parsed.child_badges.length +
    parsed.special_days.length +
    parsed.screen_time_logs.length +
    parsed.growth_records.length;
  return {
    kb: settingsRepository.estimateJsonKb(raw),
    records
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
