import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Database, Download, RotateCcw, Settings as SettingsIcon, Upload, UserRound } from 'lucide-react';
import { settingsRepository } from '../../lib/settingsRepository';
import type { LocalFamilySettings } from '../../lib/localTypes';
import { useLocalDataState } from '../../lib/useLocalData';

type SettingsForm = Omit<LocalFamilySettings, 'family_created_at' | 'updated_at'>;

export function Settings() {
  const state = useLocalDataState();
  const settings = state.family_settings;
  const [form, setForm] = useState<SettingsForm>(() => toForm(settings));
  const [message, setMessage] = useState('');
  const usage = useMemo(() => estimateStorageUsage(), [state]);

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

  const resetAll = () => {
    if (!window.confirm('確定要清除所有本機 MVP 資料嗎？')) return;
    settingsRepository.resetAllData();
    setForm(toForm(settingsRepository.getSettings()));
    setMessage('資料已重設');
  };

  return (
    <form className="settings-page" onSubmit={save}>
      <header className="settings-hero">
        <div>
          <span><SettingsIcon size={30} /></span>
          <h1>設定</h1>
          <p>管理家庭資料、分享權限與本機資料匯入匯出。</p>
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
          <header><h2>孩子預設值</h2><small>Local MVP</small></header>
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

      <section className="settings-data-panel">
        <header><div><h2>資料管理</h2><p>localStorage 只保存文字、設定與 mediaId metadata。</p></div><Database size={28} /></header>
        <div className="settings-data-actions">
          <button type="button" onClick={exportData}><Download size={18} /> 匯出 JSON</button>
          <label><Upload size={18} /> 匯入 JSON<input type="file" accept="application/json,.json" onChange={importData} /></label>
          <button type="button" className="is-danger" onClick={resetAll}><RotateCcw size={18} /> 重設資料</button>
        </div>
        <dl>
          <div><dt>localStorage 用量</dt><dd>{usage.kb} KB</dd></div>
          <div><dt>資料筆數</dt><dd>{usage.records}</dd></div>
          <div><dt>最後更新</dt><dd>{formatDate(state.updated_at)}</dd></div>
        </dl>
      </section>
    </form>
  );
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
