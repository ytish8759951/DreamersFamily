import { useEffect, useMemo, useState } from 'react';
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
import { captureFirstSelectedFile } from '../../lib/fileInput';
import { createParentInviteToken, getParentInviteUrl } from '../../lib/parentDeviceBinding';
import { settingsRepository } from '../../lib/settingsRepository';
import type { LocalDatabaseState, LocalFamilySettings } from '../../lib/localTypes';
import type { TestDataCleanupCounts, TestDataCleanupPreview, TestDataCleanupResult } from '../../lib/localData';
import { useLocalDataState } from '../../lib/useLocalData';
import { useSupabaseRuntimeInfo } from '../../lib/useSupabaseRuntimeInfo';
import { getErrorMessage } from '../../lib/errorDiagnostics';
import { beginTimingTrace, startupTrace } from '../../lib/startupTrace';
import { restoreDocumentInteractionState } from '../../lib/touchInteractions';

type SettingsForm = Omit<LocalFamilySettings, 'family_created_at' | 'updated_at'>;
const CLEANUP_CONFIRM_TEXT = '清空測試資料';
const CLEANUP_OPERATION_TIMEOUT_MS = 30000;

type SettingsTraceWindow = Window & {
  __settingsRenderCount?: number;
  __settingsRenderWindowStartedAt?: number;
  __settingsTraceStopped?: boolean;
};

function timestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const millis = String(now.getMilliseconds()).padStart(3, '0');
  return `[${hours}:${minutes}:${seconds}.${millis}]`;
}

function traceSettings(label: string, payload: Record<string, unknown> = {}) {
  if (typeof window !== 'undefined' && (window as SettingsTraceWindow).__settingsTraceStopped) return;
  console.log(`${timestamp()} ${label}`, payload);
}

function trackSettingsRenderLoop(): boolean {
  if (typeof window === 'undefined') return false;
  const traceWindow = window as SettingsTraceWindow;
  if (traceWindow.__settingsTraceStopped) return true;
  if (!traceWindow.__settingsRenderWindowStartedAt) {
    traceWindow.__settingsRenderWindowStartedAt = Date.now();
    traceWindow.__settingsRenderCount = 0;
  }
  traceWindow.__settingsRenderCount = (traceWindow.__settingsRenderCount ?? 0) + 1;
  if (traceWindow.__settingsRenderCount > 10) {
    traceWindow.__settingsTraceStopped = true;
    console.error(`${timestamp()} SETTINGS INFINITE RENDER`, {
      renderCount: traceWindow.__settingsRenderCount
    });
    return true;
  }
  return false;
}

async function traceSettingsAwait<T>(label: string, operation: () => T | Promise<T>) {
  const startedAt = Date.now();
  traceSettings(`before await ${label}`);
  try {
    const result = await Promise.resolve(operation());
    traceSettings(`after await ${label}`, { durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    traceSettings(`catch ${label}`, {
      durationMs: Date.now() - startedAt,
      message: getErrorMessage(error)
    });
    throw error;
  } finally {
    traceSettings(`finally ${label}`, { durationMs: Date.now() - startedAt });
  }
}

function useLoggedState<T>(name: string, initialState: T | (() => T)) {
  const [value, setValue] = useState(initialState);
  const loggedSetValue: typeof setValue = (next) => {
    traceSettings(`setState ${name}`);
    setValue(next);
  };
  return [value, loggedSetValue] as const;
}

function restoreCleanupModalInteractionState() {
  if (typeof document === 'undefined') return;
  const elements = [document.documentElement, document.body, document.getElementById('root')].filter(Boolean) as HTMLElement[];
  elements.forEach((element) => {
    element.removeAttribute('inert');
    element.removeAttribute('aria-hidden');
    if (element.style.pointerEvents === 'none') element.style.pointerEvents = '';
    if (element.style.touchAction === 'none') element.style.touchAction = '';
  });
  document.body.classList.remove('modal-open');
  if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
  document.querySelectorAll('[data-radix-dialog-overlay], .modal-backdrop, .local-form-backdrop').forEach((overlay) => {
    if (!document.getElementById('root')?.contains(overlay)) overlay.remove();
  });
  restoreDocumentInteractionState();
  window.requestAnimationFrame(() => {
    document.querySelectorAll('.settings-modal-backdrop').forEach((backdrop) => {
      backdrop.remove();
    });
  });
}

function withCleanupTimeout<T>(operation: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    if (typeof window === 'undefined') {
      operation.then(resolve, reject);
      return;
    }
    const timeout = window.setTimeout(() => {
      reject(new Error('清空測試資料逾時，請重新整理後確認資料狀態。'));
    }, CLEANUP_OPERATION_TIMEOUT_MS);
    operation.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export function Settings() {
  trackSettingsRenderLoop();
  traceSettings('Settings render start');
  const renderTrace = beginTimingTrace('Settings render', {}, 'span');
  const navigate = useNavigate();
  const state = useLocalDataState();
  const runtimeInfo = useSupabaseRuntimeInfo();
  const settings = state.family_settings;
  const [form, setForm] = useLoggedState<SettingsForm>('form', () => toForm(settings));
  const [message, setMessage] = useLoggedState('message', '');
  const [inviteLink, setInviteLink] = useLoggedState('inviteLink', '');
  const [inviteCode, setInviteCode] = useLoggedState('inviteCode', '');
  const [members, setMembers] = useLoggedState<ProductionFamilyParent[]>('members', []);
  const [cleanupOpen, setCleanupOpen] = useLoggedState('cleanupOpen', false);
  const [cleanupPreview, setCleanupPreview] = useLoggedState<TestDataCleanupPreview | null>('cleanupPreview', null);
  const [cleanupResult, setCleanupResult] = useLoggedState<TestDataCleanupResult | null>('cleanupResult', null);
  const [cleanupRemoveFamily, setCleanupRemoveFamily] = useLoggedState('cleanupRemoveFamily', false);
  const [cleanupConfirmText, setCleanupConfirmText] = useLoggedState('cleanupConfirmText', '');
  const [isPreviewLoading, setIsPreviewLoading] = useLoggedState('isPreviewLoading', false);
  const [isDeleting, setIsDeleting] = useLoggedState('isDeleting', false);
  const [cleanupError, setCleanupError] = useLoggedState('cleanupError', '');
  const usage = useMemo(() => estimateStorageUsage(state), [state]);
  const familyName = settings.family_name || '小小夢想家 Family';
  const parentRoleLabel = runtimeInfo.parentRole === 'owner' ? 'Owner' : runtimeInfo.parentRole ? 'Parent' : '-';
  const canManageTestData = dataMode !== 'supabase' || runtimeInfo.parentRole === 'owner';
  const cleanupBusy = isPreviewLoading || isDeleting;
  const canExecuteCleanup = Boolean(cleanupPreview) && cleanupConfirmText === CLEANUP_CONFIRM_TEXT && !isDeleting;

  const closeCleanupDialog = () => {
    setCleanupOpen(false);
    setIsPreviewLoading(false);
    setIsDeleting(false);
    restoreCleanupModalInteractionState();
  };

  useEffect(() => {
    traceSettings('effect cleanupOpen start', { cleanupOpen });
    if (!cleanupOpen) restoreCleanupModalInteractionState();
    traceSettings('effect cleanupOpen end', { cleanupOpen });
    return restoreCleanupModalInteractionState;
  }, [cleanupOpen]);

  useEffect(() => {
    traceSettings('effect mountInteractionRestore start');
    restoreCleanupModalInteractionState();
    traceSettings('effect mountInteractionRestore end');
    return restoreCleanupModalInteractionState;
  }, []);

  useEffect(() => {
    traceSettings('effect settingsMountTrace start');
    const mountTrace = beginTimingTrace('Settings mount', {
      familyId: runtimeInfo.familyId,
      parentRole: runtimeInfo.parentRole
    });
    mountTrace.end({
      familyId: runtimeInfo.familyId,
      parentRole: runtimeInfo.parentRole
    });
    traceSettings('effect settingsMountTrace end');
  }, []);

  useEffect(() => {
    traceSettings('effect runtimeTrace start', {
      familyId: runtimeInfo.familyId,
      parentRole: runtimeInfo.parentRole
    });
    startupTrace('SETTINGS START', {
      familyId: runtimeInfo.familyId,
      parentRole: runtimeInfo.parentRole
    });
    startupTrace('SETTINGS END', {
      familyId: runtimeInfo.familyId,
      parentRole: runtimeInfo.parentRole
    });
    traceSettings('effect runtimeTrace end', {
      familyId: runtimeInfo.familyId,
      parentRole: runtimeInfo.parentRole
    });
  }, [runtimeInfo.familyId, runtimeInfo.parentRole]);

  useEffect(() => {
    traceSettings('effect membersHydrate start', { familyId: runtimeInfo.familyId, dataMode });
    let cancelled = false;
    if (dataMode !== 'supabase' || !runtimeInfo.familyId) {
      setMembers([]);
      traceSettings('effect membersHydrate end', { reason: 'no family scope' });
      return;
    }
    void traceSettingsAwait('listProductionFamilyParents', () => listProductionFamilyParents(runtimeInfo.familyId!))
      .then((parents) => {
        if (!cancelled) setMembers(parents);
        traceSettings('effect membersHydrate end', { cancelled, count: parents.length });
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
        traceSettings('effect membersHydrate end', { cancelled, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [runtimeInfo.familyId]);

  const update = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = () => {
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

  const readImage = async (file: File, key: 'family_avatar_media_id' | 'parent_avatar_media_id') => {
    const mediaId = await traceSettingsAwait('settingsRepository.saveAvatarFile', () =>
      settingsRepository.saveAvatarFile({
        ownerId: key === 'family_avatar_media_id' ? 'family-avatar' : 'parent-avatar',
        file
      })
    );
    update(key, mediaId);
  };

  const exportData = () => {
    const raw = settingsRepository.exportData();
    settingsRepository.downloadJson(raw, `little-dreamers-family-${new Date().toISOString().slice(0, 10)}.json`);
    setMessage('已匯出 JSON');
  };

  const importData = async (file: File) => {
    try {
      const raw = await traceSettingsAwait('file.text', () => file.text());
      settingsRepository.importData(raw);
      setForm(toForm(settingsRepository.getSettings()));
      setMessage('資料已匯入');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '匯入資料失敗');
    }
  };

  const openCleanupPreview = async () => {
    setCleanupOpen(true);
    setCleanupPreview(null);
    setCleanupResult(null);
    setCleanupConfirmText('');
    setCleanupError('');
    setIsPreviewLoading(true);
    try {
      const preview = await traceSettingsAwait('settingsRepository.previewTestDataCleanup', () =>
        settingsRepository.previewTestDataCleanup(runtimeInfo.familyId ?? null)
      );
      setCleanupPreview(preview);
      setCleanupRemoveFamily(false);
    } catch (caught) {
      setCleanupError(getErrorMessage(caught, '無法讀取清理預覽'));
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const executeCleanup = async () => {
    if (isDeleting || cleanupConfirmText !== CLEANUP_CONFIRM_TEXT || !cleanupPreview) return;
    setIsDeleting(true);
    setCleanupError('');
    setCleanupResult(null);
    try {
      const result = await traceSettingsAwait('settingsRepository.executeTestDataCleanup', () =>
        withCleanupTimeout(settingsRepository.executeTestDataCleanup({
          familyId: cleanupPreview?.familyId ?? runtimeInfo.familyId ?? null,
          removeFamily: cleanupRemoveFamily
        }))
      );
      setCleanupResult(result);
      setForm(toForm(settingsRepository.getSettings()));
      setMessage(cleanupRemoveFamily ? '已清空測試資料並移除目前家庭，請重新建立家庭。' : '已清空目前家庭的測試資料。');
      closeCleanupDialog();
      if (result.removedFamily) {
        traceSettings('navigate', { to: '/create-family', from: 'executeCleanup' });
        navigate('/create-family', { replace: true });
      }
    } catch (caught) {
      const errorMessage = getErrorMessage(caught, '清空測試資料失敗');
      setCleanupError(errorMessage);
      setMessage(errorMessage);
      closeCleanupDialog();
    } finally {
      setIsDeleting(false);
      restoreCleanupModalInteractionState();
    }
  };

  const createInvite = async () => {
    setMessage('');
    try {
      const invite = await traceSettingsAwait('createProductionFamilyInvite', () => createProductionFamilyInvite('guardian'));
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
      await traceSettingsAwait('navigator.clipboard.writeText', () => navigator.clipboard.writeText(inviteLink));
      setMessage('邀請連結已複製');
    } catch {
      setMessage('無法複製邀請連結，請手動選取連結。');
    }
  };

  const leaveFamily = async () => {
    if (!window.confirm('確定要退出目前家庭嗎？這只會移除你的家長關聯，不會刪除家庭資料。')) return;
    try {
      if (runtimeInfo.userId) await traceSettingsAwait('leaveProductionFamily', () => leaveProductionFamily());
      else unbindParentDeviceFromFamily();
      setMessage('已退出家庭');
      traceSettings('navigate', { to: '/login', from: 'leaveFamily' });
      navigate('/login', { replace: true });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '退出家庭失敗');
    }
  };

  const revokeMember = async (member: ProductionFamilyParent) => {
    const familyId = runtimeInfo.familyId;
    if (!familyId || !window.confirm(`確定解除 ${member.display_name} 的家長裝置綁定嗎？`)) return;
    try {
      await traceSettingsAwait('revokeDeviceBoundParent', () => revokeDeviceBoundParent(member.id, familyId));
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setMessage('已解除家長裝置綁定');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '解除綁定失敗');
    }
  };

  renderTrace.end({
    familyId: runtimeInfo.familyId,
    parentRole: runtimeInfo.parentRole,
    childrenCount: state.children.length
  });
  traceSettings('Settings render end', {
    familyId: runtimeInfo.familyId,
    parentRole: runtimeInfo.parentRole,
    childrenCount: state.children.length
  });

  return (
    <div className="settings-page">
      <header className="settings-hero">
        <div>
          <span><SettingsIcon size={30} /></span>
          <h1>設定</h1>
          <p>管理家庭資料、分享權限與資料匯入匯出。</p>
        </div>
        <button type="button" onClick={saveSettings}>儲存設定</button>
      </header>

      {message ? <p className="settings-message">{message}</p> : null}

      <section className="settings-grid">
        <article className="settings-panel">
          <header><h2>家庭資料</h2><small>{formatDate(settings.family_created_at)} 建立</small></header>
          <div className="settings-avatar-row">
            <span><AvatarPreview mediaId={form.family_avatar_media_id} fallback="🏠" alt="家庭頭像" /></span>
            <label>家庭頭像<input type="file" accept="image/*" onChange={(event) => {
              const input = event.currentTarget;
              const file = captureFirstSelectedFile(input);
              if (!file) return;
              void readImage(file, 'family_avatar_media_id');
            }} /></label>
          </div>
          <label>家庭名稱<input value={form.family_name} onChange={(event) => update('family_name', event.target.value)} /></label>
          <label>家庭介紹<textarea rows={3} value={form.family_intro} onChange={(event) => update('family_intro', event.target.value)} /></label>
        </article>

        <article className="settings-panel">
          <header><h2>家長資料</h2><UserRound size={22} /></header>
          <div className="settings-avatar-row">
            <span><AvatarPreview mediaId={form.parent_avatar_media_id} fallback="👤" alt="家長頭像" /></span>
            <label>家長頭像<input type="file" accept="image/*" onChange={(event) => {
              const input = event.currentTarget;
              const file = captureFirstSelectedFile(input);
              if (!file) return;
              void readImage(file, 'parent_avatar_media_id');
            }} /></label>
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
        <div className="settings-modal-backdrop" role="presentation" onMouseDown={() => !cleanupBusy && closeCleanupDialog()}>
          <section className="local-form-dialog settings-cleanup-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-cleanup-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <small>危險操作</small>
                <h2 id="settings-cleanup-title">清空所有測試資料</h2>
              </div>
              <button type="button" onClick={closeCleanupDialog} disabled={cleanupBusy} aria-label="關閉"><X size={18} /></button>
            </header>
            <div className="settings-cleanup-body">
              <p className="settings-cleanup-warning">此操作會永久刪除目前家庭的測試資料，無法從介面復原。Supabase Auth 家長帳號、schema、migration、RLS、RPC 與部署設定會保留。</p>
              {isPreviewLoading ? <p className="settings-operation-summary">正在讀取即將刪除的資料數量...</p> : null}
              {isDeleting ? <p className="settings-operation-summary"><span className="settings-inline-spinner" aria-hidden="true" /> 正在清空測試資料，請勿關閉視窗。</p> : null}
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
              <button type="button" onClick={closeCleanupDialog} disabled={cleanupBusy}>取消</button>
              <button type="button" className="is-danger" onClick={() => void executeCleanup()} disabled={!canExecuteCleanup}>
                {isDeleting ? <><span className="settings-inline-spinner" aria-hidden="true" /> 正在清空</> : '永久清空測試資料'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <section className="settings-data-panel">
        <header><div><h2>測試資料管理</h2><p>{dataMode === 'supabase' ? '正式資料清理會先預覽數量，並透過 Owner 限定 RPC transaction 執行。' : '本機模式會清理目前瀏覽器內的 local/mock 測試資料。'}</p></div><Database size={28} /></header>
        <div className="settings-data-actions">
          <button type="button" onClick={exportData}><Download size={18} /> 匯出備份 JSON</button>
          <label><Upload size={18} /> 匯入 JSON<input type="file" accept="application/json,.json" onChange={(event) => {
            const input = event.currentTarget;
            const file = captureFirstSelectedFile(input);
            if (!file) return;
            void importData(file);
          }} /></label>
          <button type="button" className="is-danger" onClick={() => void openCleanupPreview()} disabled={!canManageTestData || cleanupBusy}><Trash2 size={18} /> {isPreviewLoading ? '讀取中...' : '清空所有測試資料'}</button>
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
    </div>
  );
}

const cleanupCountLabels: Record<string, string> = {
  families: '家庭',
  family_members: '家庭成員',
  family_memberships: '家庭成員',
  family_invitations: '家庭邀請',
  parents: '家長資料',
  children: '孩子',
  child_devices: '孩子裝置',
  child_login_challenges: '孩子登入邀請',
  child_onboarding_tokens: '舊版孩子 QR 邀請',
  child_sessions: '孩子登入狀態',
  device_bindings: '裝置綁定',
  child_device_heartbeats: '裝置在線紀錄',
  task_records: '任務完成紀錄',
  tasks: '任務',
  stars: '星星與獎勵',
  reward_transactions: '舊版獎勵紀錄',
  badges: '徽章',
  child_badges: '孩子徽章',
  dreams: '撲滿目標',
  dream_funds: '撲滿流水',
  dream_fund_reversals: '撲滿沖銷紀錄',
  wishes: '舊版願望',
  wish_stages: '願望階段',
  wish_progress_entries: '願望進度',
  piggy_banks: '撲滿帳戶',
  piggy_bank_records: '撲滿紀錄',
  store_items: '商品／兌換項目',
  purchases: '兌換紀錄',
  growth_categories: '成長分類',
  growth_measurements: '身高體重紀錄',
  growth_records: '成長紀錄',
  shares: '分享內容',
  share_media: '分享附件',
  encouragement_cards: '鼓勵卡片',
  album_entries: '相簿項目',
  comments: '留言',
  artifacts: '作品紀錄',
  media_assets: '媒體檔案',
  achievement_messages: '成就訊息',
  mailbox_messages: '信箱訊息',
  special_events: '特別事件',
  special_days: '特殊日',
  notification_events: '通知事件',
  notification_preferences: '通知偏好',
  notifications: '通知',
  tablet_time: '平板時間紀錄',
  screen_time: '舊版平板時間',
  screen_time_logs: '平板時間紀錄',
  screen_time_log_reversals: '平板時間沖銷紀錄',
  screen_time_requests: '平板時間申請',
  screen_time_schedules: '平板時間設定',
  reminders: '提醒',
  device_tokens: '推播裝置 Token',
  milestones: '里程碑'
};

const cleanupCountGroups: Array<{ title: string; keys: string[] }> = [
  {
    title: '家庭與孩子',
    keys: ['families', 'family_members', 'family_memberships', 'family_invitations', 'parents', 'children']
  },
  {
    title: '裝置與登入',
    keys: ['device_bindings', 'child_devices', 'child_login_challenges', 'child_onboarding_tokens', 'child_sessions', 'child_device_heartbeats', 'device_tokens']
  },
  {
    title: '任務與獎勵',
    keys: ['tasks', 'task_records', 'stars', 'star_reversals', 'reward_transactions', 'badges', 'child_badges']
  },
  {
    title: '撲滿與成長',
    keys: ['dreams', 'dream_funds', 'dream_fund_reversals', 'wishes', 'wish_stages', 'wish_progress_entries', 'piggy_banks', 'piggy_bank_records', 'store_items', 'purchases', 'growth_categories', 'growth_measurements', 'growth_records', 'milestones', 'child_milestones', 'tablet_time', 'screen_time', 'screen_time_logs', 'screen_time_log_reversals', 'screen_time_requests', 'screen_time_schedules']
  },
  {
    title: '分享與信箱',
    keys: ['shares', 'share_media', 'encouragement_cards', 'album_entries', 'comments', 'artifacts', 'media_assets', 'mailbox_messages', 'achievement_messages', 'special_events', 'special_days', 'reminders', 'notification_events', 'notification_preferences', 'notifications']
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
    traceSettings('effect AvatarPreview start', { mediaId });
    let cancelled = false;
    setUrl(null);
    if (!mediaId) {
      traceSettings('effect AvatarPreview end', { mediaId, reason: 'no mediaId' });
      return () => {
        cancelled = true;
      };
    }
    void traceSettingsAwait('settingsRepository.getAvatarUrl', () => settingsRepository.getAvatarUrl(mediaId)).then((value) => {
      if (!cancelled) setUrl(value);
      else settingsRepository.releaseAvatarUrl(mediaId);
      traceSettings('effect AvatarPreview end', { mediaId, cancelled, hasUrl: Boolean(value) });
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

function estimateStorageUsage(state: LocalDatabaseState) {
  const records =
    state.children.length +
    state.tasks.length +
    state.stars.length +
    state.dreams.length +
    state.dream_funds.length +
    state.shares.length +
    state.share_media.length +
    state.encouragement_cards.length +
    state.badges.length +
    state.child_badges.length +
    state.special_days.length +
    state.screen_time_logs.length +
    state.growth_records.length;
  const estimatedBytes =
    2048 +
    state.children.length * 768 +
    state.tasks.length * 768 +
    state.stars.length * 256 +
    state.dreams.length * 768 +
    state.dream_funds.length * 512 +
    state.shares.length * 768 +
    state.share_media.length * 512 +
    state.encouragement_cards.length * 512 +
    state.badges.length * 256 +
    state.child_badges.length * 256 +
    state.special_days.length * 512 +
    state.screen_time_logs.length * 384 +
    state.growth_records.length * 384;
  return {
    kb: (estimatedBytes / 1024).toFixed(1),
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
