import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, CalendarHeart, Edit3, Plus, Trash2 } from 'lucide-react';
import { dataModeBadgeLabel } from '../../lib/dataRepository';
import { specialDayRepository } from '../../lib/specialDayRepository';
import type { LocalSpecialDay, SpecialDayType } from '../../lib/localTypes';
import { getBirthdaySpecialDays } from '../../lib/specialDays';
import { useLocalDataState } from '../../lib/useLocalData';
import { useSubmitLock } from '../../lib/useSubmitLock';

type SpecialDayForm = {
  child_id: string;
  title: string;
  date: string;
  type: Exclude<SpecialDayType, 'birthday'>;
  description: string;
  image_media_id: string | null;
};

type SpecialDayItem = LocalSpecialDay & {
  source?: 'manual' | 'child_birthday';
  recurring?: 'yearly';
  daysLeft?: number;
  createdBy?: 'parent' | 'child' | 'system';
};

const typeOptions: Record<SpecialDayType, { label: string; icon: string }> = {
  birthday: { label: '生日', icon: '🎂' },
  anniversary: { label: '紀念日', icon: '💚' },
  holiday: { label: '節日', icon: '🎉' },
  family_event: { label: '家庭活動', icon: '🏡' },
  other: { label: '其他', icon: '⭐' }
};

const manualTypeOptions: Array<{ value: SpecialDayForm['type']; label: string; icon: string }> = [
  { value: 'anniversary', label: '紀念日', icon: '💚' },
  { value: 'holiday', label: '節日', icon: '🎉' },
  { value: 'family_event', label: '家庭活動', icon: '🏡' },
  { value: 'other', label: '其他', icon: '⭐' }
];

const todayIso = () => new Date().toISOString().slice(0, 10);

export function SpecialDays() {
  const state = useLocalDataState();
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const defaultChildId = state.active_child_id ?? activeChildren[0]?.id ?? '';
  const [childFilter, setChildFilter] = useState(defaultChildId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<SpecialDayForm>(() => emptyForm(defaultChildId));
  const { acquire, release, isLocked } = useSubmitLock();

  useEffect(() => {
    if (!activeChildren.length) {
      setChildFilter('');
      return;
    }
    if (!childFilter || !activeChildren.some((child) => child.id === childFilter)) {
      setChildFilter(defaultChildId);
    }
  }, [activeChildren, childFilter, defaultChildId]);

  const birthdayDays = useMemo(
    () => getBirthdaySpecialDays(activeChildren).map((day): SpecialDayItem => ({
      id: `child-birthday:${day.childId}`,
      family_id: state.family_id,
      child_id: day.childId,
      childId: day.childId,
      title: day.title,
      date: day.date,
      type: 'birthday',
      description: '孩子生日由正式孩子資料自動產生',
      image_media_id: null,
      image_data_url: null,
      created_by: 'system',
      createdBy: 'system',
      created_at: day.date,
      updated_at: day.date,
      deleted_at: null,
      source: day.source,
      recurring: day.recurring,
      daysLeft: day.daysLeft
    })),
    [activeChildren, state.family_id]
  );

  const manualDays = state.special_days
    .filter((day) => !day.deleted_at && day.type !== 'birthday')
    .map((day): SpecialDayItem => ({
      ...day,
      source: day.source ?? 'manual',
      createdBy: day.createdBy ?? 'parent'
    }));
  const visibleDays = [...birthdayDays, ...manualDays]
    .filter((day) => !childFilter || day.child_id === childFilter)
    .sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
  const upcoming = visibleDays.filter((day) => daysUntil(day.date) >= 0);
  const history = visibleDays.filter((day) => daysUntil(day.date) < 0).sort((a, b) => b.date.localeCompare(a.date));
  const recent = visibleDays.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  const notifications = state.notifications
    .filter((notification) => notification.source_type === 'special_day' && (!childFilter || notification.child_id === childFilter))
    .slice(0, 5);

  const childName = (childId: string | null) =>
    childId ? state.children.find((child) => child.id === childId)?.display_name ?? '已封存孩子' : '未指定孩子';

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(childFilter || defaultChildId));
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (day: SpecialDayItem) => {
    if (day.source === 'child_birthday') {
      window.alert('生日由孩子資料自動產生，請到孩子管理修改生日。');
      return;
    }
    setEditingId(day.id);
    setForm({
      child_id: day.child_id ?? childFilter,
      title: day.title,
      date: day.date,
      type: day.type === 'birthday' ? 'anniversary' : day.type,
      description: day.description ?? '',
      image_media_id: day.image_media_id
    });
    setFormError('');
    setShowForm(true);
  };

  const saveDay = (event: FormEvent) => {
    event.preventDefault();
    const lockKey = `special-day:parent:${editingId ?? 'create'}`;
    if (!acquire(lockKey)) return;
    setFormError('');
    try {
      if (!form.child_id) throw new Error('請先選擇孩子');
      const payload = {
        child_id: form.child_id,
        title: form.title,
        date: form.date,
        type: form.type,
        description: form.description || null,
        image_media_id: form.image_media_id,
        image_data_url: null,
        source: 'manual' as const,
        createdBy: 'parent' as const,
        client_request_id: editingId ? `special-day:parent:update:${editingId}:${Date.now()}` : `special-day:parent:create:${crypto.randomUUID()}`
      };
      if (editingId) specialDayRepository.updateSpecialDay(editingId, payload);
      else specialDayRepository.createSpecialDay({ ...payload, id: crypto.randomUUID() });
      setChildFilter(form.child_id);
      setShowForm(false);
      setEditingId(null);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '重要日子儲存失敗');
    } finally {
      release(lockKey);
    }
  };

  const deleteDay = (day: SpecialDayItem) => {
    if (day.source === 'child_birthday') {
      window.alert('生日由孩子資料自動產生，不能刪除。');
      return;
    }
    if (window.confirm(`確定刪除「${day.title}」？刪除後兩端會同步移除。`)) {
      specialDayRepository.deleteSpecialDay(day.id);
    }
  };

  const isSaving = isLocked(`special-day:parent:${editingId ?? 'create'}`);

  return (
    <div className="special-days-page">
      <header className="special-days-hero">
        <div><span><CalendarHeart size={30} /></span><h1>重要日子</h1><p>家長與孩子共同記錄生日、紀念日、表演日與家庭活動。</p></div>
        <button onClick={openCreate} disabled={!activeChildren.length}><Plus size={18} /> 新增重要日子</button>
      </header>

      <div className="special-filter-bar">
        <section className="special-filter-group" aria-label="孩子篩選">
          <strong>孩子</strong>
          <div className="special-filter-tabs" role="tablist" aria-label="孩子篩選">
            {activeChildren.map((child) => (
              <button type="button" className={childFilter === child.id ? 'is-active' : ''} aria-selected={childFilter === child.id} onClick={() => setChildFilter(child.id)} key={child.id}>
                {child.display_name}
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="special-days-stats">
        <Stat label="即將到來" value={`${upcoming.length} 筆`} icon="📅" tone="green" />
        <Stat label="歷史回顧" value={`${history.length} 筆`} icon="🕰" tone="blue" />
        <Stat label="最近重要日子" value={`${recent.length} 筆`} icon="⭐" tone="pink" />
      </section>

      <section className="special-days-grid">
        <article className="special-panel special-upcoming">
          <header><h2>即將到來</h2><small>{upcoming.length} 筆</small></header>
          {upcoming.length ? upcoming.map((day) => <DayCard key={day.id} day={day} childName={childName(day.child_id)} onEdit={() => openEdit(day)} onDelete={() => deleteDay(day)} />) : <Empty text="目前沒有即將到來的重要日子" />}
        </article>
        <article className="special-panel">
          <header><h2>最近重要日子</h2><small>{recent.length} 筆</small></header>
          {recent.length ? recent.map((day) => <DayCard key={day.id} day={day} childName={childName(day.child_id)} onEdit={() => openEdit(day)} onDelete={() => deleteDay(day)} />) : <Empty text="尚未建立重要日子" />}
        </article>
        <article className="special-panel special-history">
          <header><h2>歷史回顧</h2><small>{history.length} 筆</small></header>
          {history.length ? history.map((day) => <DayCard key={day.id} day={day} childName={childName(day.child_id)} onEdit={() => openEdit(day)} onDelete={() => deleteDay(day)} />) : <Empty text="目前沒有歷史重要日子" />}
        </article>
        <article className="special-panel">
          <header><h2>站內通知</h2><small>{notifications.length} 則</small></header>
          {notifications.length ? notifications.map((notification) => <section className="special-day-card is-other" key={notification.id}><span>🔔</span><div><small>{childName(notification.child_id)}</small><strong>{notification.title}</strong><p>{notification.body}</p><time>{notification.created_at.slice(0, 10)}</time></div></section>) : <Empty text="目前沒有重要日子通知" />}
        </article>
      </section>

      {showForm ? (
        <div className="local-form-backdrop" role="presentation" onMouseDown={() => !isSaving && setShowForm(false)}>
          <section className="local-form-dialog special-day-form-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><small>{dataModeBadgeLabel}</small><h2>{editingId ? '修改重要日子' : '新增重要日子'}</h2></div><button type="button" aria-label="關閉" disabled={isSaving} onClick={() => setShowForm(false)}>×</button></header>
            <form onSubmit={saveDay}>
              <label>孩子<select value={form.child_id} onChange={(event) => setForm({ ...form, child_id: event.target.value })}>{activeChildren.map((child) => <option value={child.id} key={child.id}>{child.display_name}</option>)}</select></label>
              <label>類型<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as SpecialDayForm['type'] })}>{manualTypeOptions.map((type) => <option value={type.value} key={type.value}>{type.icon} {type.label}</option>)}</select></label>
              <p className="local-form-hint">生日由孩子資料自動產生，不會因同步或重新整理而重複建立。</p>
              <label className="is-full">標題<input autoFocus required maxLength={60} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：家庭旅行" /></label>
              <label>日期<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
              <label className="is-full">備註<textarea rows={3} maxLength={220} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="提醒設定：預設提前 7 天站內提醒" /></label>
              {form.image_media_id ? <MediaImage className="special-form-preview" mediaId={form.image_media_id} alt="重要日子圖片" /> : null}
              {formError ? <p className="local-form-error">{formError}</p> : null}
              <footer><button type="button" disabled={isSaving} onClick={() => setShowForm(false)}>取消</button><button className="ds-primary-button" type="submit" disabled={isSaving}>{isSaving ? '處理中' : '儲存'}</button></footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function emptyForm(childId: string): SpecialDayForm {
  return {
    child_id: childId,
    title: '',
    date: todayIso(),
    type: 'anniversary',
    description: '',
    image_media_id: null
  };
}

function DayCard({ day, childName, onEdit, onDelete }: { day: SpecialDayItem; childName: string; onEdit: () => void; onDelete: () => void }) {
  const type = typeOptions[day.type] ?? typeOptions.other;
  const remaining = daysUntil(day.date);
  const origin = day.source === 'child_birthday' ? '生日自動產生' : day.createdBy === 'child' ? '孩子新增' : '家長新增';
  return (
    <section className={`special-day-card is-${day.type}`}>
      {day.image_media_id ? <MediaImage mediaId={day.image_media_id} alt={day.title} /> : <span>{type.icon}</span>}
      <div><small>{type.label} · {childName} · {origin}</small><strong>{day.title}</strong><p>{day.source === 'child_birthday' ? '孩子生日' : day.description || '沒有備註'}</p><time>{day.date}</time></div>
      <b>{remaining >= 0 ? `${remaining} 天` : '已過'}</b>
      <footer>{day.source === 'child_birthday' ? <button onClick={onEdit}><Edit3 size={15} /> 管理生日</button> : <><button onClick={onEdit}><Edit3 size={15} /> 修改</button><button onClick={onDelete}><Trash2 size={15} /> 刪除</button></>}</footer>
    </section>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: string }) {
  return <article className={`is-${tone}`}><span>{icon}</span><small>{label}</small><strong>{value}</strong></article>;
}

function Empty({ text }: { text: string }) {
  return <div className="special-empty"><CalendarDays size={34} /><p>{text}</p></div>;
}

function MediaImage({ mediaId, alt, className }: { mediaId: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    void specialDayRepository.getSpecialDayImageUrl(mediaId).then((value) => {
      if (!cancelled) setUrl(value);
      else specialDayRepository.releaseSpecialDayImageUrl(mediaId);
    });
    return () => {
      cancelled = true;
      specialDayRepository.releaseSpecialDayImageUrl(mediaId);
    };
  }, [mediaId]);

  return url ? <img className={className} src={url} alt={alt} /> : null;
}

function daysUntil(date: string) {
  const start = new Date(`${todayIso()}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}
