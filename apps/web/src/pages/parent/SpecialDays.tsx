import { useEffect, useMemo, useState, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { CalendarDays, CalendarHeart, Edit3, Plus, Trash2 } from 'lucide-react';
import { dataModeBadgeLabel } from '../../lib/dataRepository';
import { specialDayRepository } from '../../lib/specialDayRepository';
import type { LocalSpecialDay, SpecialDayType } from '../../lib/localTypes';
import { getBirthdaySpecialDays } from '../../lib/specialDays';
import { useLocalDataState } from '../../lib/useLocalData';

type SpecialDayForm = {
  child_id: string;
  title: string;
  date: string;
  type: SpecialDayType;
  description: string;
  image_media_id: string | null;
};

const emptyForm: SpecialDayForm = {
  child_id: 'family',
  title: '',
  date: new Date().toISOString().slice(0, 10),
  type: 'anniversary',
  description: '',
  image_media_id: null
};

const typeOptions: { value: SpecialDayType; label: string; icon: string }[] = [
  { value: 'birthday', label: '生日', icon: '🎂' },
  { value: 'anniversary', label: '紀念日', icon: '💝' },
  { value: 'holiday', label: '節日', icon: '🎉' },
  { value: 'family_event', label: '家庭活動', icon: '🏡' },
  { value: 'other', label: '其他', icon: '⭐' }
];

const manualTypeOptions = typeOptions.filter((type) => type.value !== 'birthday');

type SpecialDayItem = LocalSpecialDay & {
  source?: 'manual' | 'child_birthday';
  recurring?: 'yearly';
  daysLeft?: number;
  createdBy?: 'parent' | 'child' | 'system';
};

type SpecialDateFilter = 'all' | 'this-month' | 'next-30-days' | 'this-year';

const dateFilters: { value: SpecialDateFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'this-month', label: '本月' },
  { value: 'next-30-days', label: '30 天內' },
  { value: 'this-year', label: '今年' }
];

export function SpecialDays() {
  const state = useLocalDataState();
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const birthdayDays = useMemo(
    () => getBirthdaySpecialDays(activeChildren).map((day): SpecialDayItem => ({
      id: `child-birthday:${day.childId}`,
      family_id: state.family_id,
      child_id: day.childId,
      childId: day.childId,
      title: day.title,
      date: day.date,
      type: 'birthday',
      description: '孩子生日',
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
      createdBy: day.createdBy ?? (day.child_id ? 'child' : 'parent')
    }));
  const allDays = [...birthdayDays, ...manualDays];
  const [dateFilter, setDateFilter] = useState<SpecialDateFilter>('all');
  const [childFilter, setChildFilter] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<SpecialDayForm>(emptyForm);
  const filteredDays = allDays
    .filter((day) => isInDateFilter(day.date, dateFilter))
    .filter((day) => childFilter === 'all' || day.child_id === null || day.child_id === childFilter)
    .sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
  const upcoming = filteredDays.filter((day) => daysUntil(day.date) >= 0);
  const history = filteredDays.filter((day) => daysUntil(day.date) < 0).sort((a, b) => b.date.localeCompare(a.date));
  const childName = (childId: string | null) =>
    childId ? state.children.find((child) => child.id === childId)?.display_name ?? '已封存孩子' : '全家';

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, child_id: childFilter === 'all' ? 'family' : childFilter });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (day: SpecialDayItem) => {
    if (day.source === 'child_birthday') {
      window.alert('生日由孩子資料自動產生，請到孩子資料修改。');
      return;
    }
    setEditingId(day.id);
    setForm({
      child_id: day.child_id ?? 'family',
      title: day.title,
      date: day.date,
      type: day.type,
      description: day.description ?? '',
      image_media_id: day.image_media_id
    });
    setFormError('');
    setShowForm(true);
  };

  const saveDay = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (form.type === 'birthday') {
      setFormError('生日請從孩子資料管理。');
      return;
    }
    try {
      const payload = {
        child_id: form.child_id === 'family' ? null : form.child_id,
        title: form.title,
        date: form.date,
        type: form.type,
        description: form.description || null,
        image_media_id: form.image_media_id,
        image_data_url: null,
        source: 'manual' as const,
        createdBy: 'parent' as const
      };
      if (editingId) specialDayRepository.updateSpecialDay(editingId, payload);
      else specialDayRepository.createSpecialDay(payload);
      setShowForm(false);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '特殊日儲存失敗');
    }
  };

  const deleteDay = (day: SpecialDayItem) => {
    if (day.source === 'child_birthday') {
      window.alert('生日由孩子資料自動產生，不能在這裡刪除。');
      return;
    }
    if (window.confirm(`刪除 ${day.title}？`)) specialDayRepository.deleteSpecialDay(day.id);
  };

  return (
    <div className="special-days-page">
      <header className="special-days-hero">
        <div><span><CalendarHeart size={30} /></span><h1>特殊日</h1><p>記錄生日、紀念日、家庭活動與重要日子。</p></div>
        <button onClick={openCreate}><Plus size={18} /> 新增特殊日</button>
      </header>

      <section className="special-days-stats">
        <Stat label="全部日子" value={`${allDays.length} 天`} icon="📅" tone="blue" />
        <Stat label="即將到來" value={`${upcoming.length} 天`} icon="⏳" tone="green" />
        <Stat label="生日" value={`${allDays.filter((day) => day.type === 'birthday').length} 天`} icon="🎂" tone="pink" />
        <Stat label="家庭活動" value={`${allDays.filter((day) => day.type === 'family_event').length} 天`} icon="🏡" tone="yellow" />
      </section>

      <div className="special-filter-bar">
        <section className="special-filter-group" aria-label="孩子篩選">
          <strong>孩子</strong>
          <div className="special-filter-tabs" role="tablist" aria-label="孩子篩選">
            <button type="button" className={childFilter === 'all' ? 'is-active' : ''} aria-selected={childFilter === 'all'} onClick={() => setChildFilter('all')}>全部</button>
            {activeChildren.map((child) => (
              <button type="button" className={childFilter === child.id ? 'is-active' : ''} aria-selected={childFilter === child.id} onClick={() => setChildFilter(child.id)} key={child.id}>
                {child.display_name}
              </button>
            ))}
          </div>
        </section>
        <section className="special-filter-group" aria-label="日期篩選">
          <strong>日期</strong>
          <div className="special-filter-tabs" role="tablist" aria-label="日期篩選">
            {dateFilters.map((filter) => (
              <button type="button" className={dateFilter === filter.value ? 'is-active' : ''} aria-selected={dateFilter === filter.value} onClick={() => setDateFilter(filter.value)} key={filter.value}>
                {filter.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="special-days-grid">
        <article className="special-panel special-upcoming">
          <header><h2>即將到來</h2><small>{upcoming.length} 天</small></header>
          {upcoming.length ? upcoming.map((day) => <DayCard key={day.id} day={day} childName={childName(day.child_id)} onEdit={() => openEdit(day)} onDelete={() => deleteDay(day)} />) : <Empty text="尚無即將到來的特殊日子" />}
        </article>
        <article className="special-panel special-history">
          <header><h2>過去日子</h2><small>{history.length} 天</small></header>
          {history.length ? history.map((day) => <DayCard key={day.id} day={day} childName={childName(day.child_id)} onEdit={() => openEdit(day)} onDelete={() => deleteDay(day)} />) : <Empty text="過去的特殊日子會保留在這裡" />}
        </article>
      </section>

      {showForm ? (
        <div className="local-form-backdrop" role="presentation" onMouseDown={() => setShowForm(false)}>
          <section className="local-form-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><small>{dataModeBadgeLabel}</small><h2>{editingId ? '編輯特殊日' : '新增特殊日'}</h2></div><button type="button" aria-label="關閉" onClick={() => setShowForm(false)}>×</button></header>
            <form onSubmit={saveDay}>
              <label>孩子<select value={form.child_id} onChange={(event) => setForm({ ...form, child_id: event.target.value })}><option value="family">全家</option>{activeChildren.map((child) => <option value={child.id} key={child.id}>{child.display_name}</option>)}</select></label>
              <label>類型<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as SpecialDayType })}>{manualTypeOptions.map((type) => <option value={type.value} key={type.value}>{type.icon} {type.label}</option>)}</select></label>
              <p className="local-form-hint">生日由孩子生日資料自動建立。</p>
              <label className="is-full">標題<input autoFocus required maxLength={60} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：家庭旅行" /></label>
              <label>日期<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
              <label className="is-full">描述<textarea rows={3} maxLength={220} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="留下簡短備註" /></label>
              <label className="is-full">圖片（選填）<input type="file" accept="image/*" onChange={(event) => void saveSpecialDayImage(event, setForm, form.child_id === 'family' ? activeChildren[0]?.id ?? null : form.child_id)} /></label>
              {form.image_media_id ? <MediaImage className="special-form-preview" mediaId={form.image_media_id} alt="已選圖片" /> : null}
              {formError ? <p className="local-form-error">{formError}</p> : null}
              <footer><button type="button" onClick={() => setShowForm(false)}>取消</button><button className="ds-primary-button" type="submit">儲存</button></footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function DayCard({ day, childName, onEdit, onDelete }: { day: SpecialDayItem; childName: string; onEdit: () => void; onDelete: () => void }) {
  const type = typeOptions.find((item) => item.value === day.type) ?? typeOptions[4];
  const remaining = daysUntil(day.date);
  const origin = day.source === 'child_birthday' ? '生日自動產生' : day.createdBy === 'child' ? '孩子新增' : '家長新增';
  return (
    <section className={`special-day-card is-${day.type}`}>
      {day.image_media_id ? <MediaImage mediaId={day.image_media_id} alt={day.title} /> : <span>{type.icon}</span>}
      <div><small>{type.label} · {childName} · {origin}</small><strong>{day.title}</strong><p>{day.source === 'child_birthday' ? '孩子生日' : day.description || '沒有描述'}</p><time>{day.date}</time></div>
      <b>{remaining >= 0 ? `${remaining} 天` : '已過'}</b>
      <footer>{day.source === 'child_birthday' ? <button onClick={onEdit}><Edit3 size={15} /> 到孩子資料修改</button> : <><button onClick={onEdit}><Edit3 size={15} /> 編輯</button><button onClick={onDelete}><Trash2 size={15} /> 刪除</button></>}</footer>
    </section>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: string }) {
  return <article className={`is-${tone}`}><span>{icon}</span><small>{label}</small><strong>{value}</strong></article>;
}

function Empty({ text }: { text: string }) {
  return <div className="special-empty"><CalendarDays size={34} /><p>{text}</p></div>;
}

function daysUntil(date: string) {
  const start = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}

function isInDateFilter(date: string, filter: SpecialDateFilter) {
  if (filter === 'all') return true;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return false;
  if (filter === 'this-month') {
    return target.getFullYear() === today.getFullYear() && target.getMonth() === today.getMonth();
  }
  if (filter === 'next-30-days') {
    const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);
    return diff >= 0 && diff <= 30;
  }
  if (filter === 'this-year') {
    return target.getFullYear() === today.getFullYear();
  }
  return true;
}

async function saveSpecialDayImage(
  event: ChangeEvent<HTMLInputElement>,
  setForm: Dispatch<SetStateAction<SpecialDayForm>>,
  childId: string | null
) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  const mediaId = await specialDayRepository.saveSpecialDayImageFile({
    ownerId: 'new-special-day',
    childId,
    file
  });
  setForm((current) => ({ ...current, image_media_id: mediaId }));
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
