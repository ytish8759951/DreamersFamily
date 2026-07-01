import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarHeart, Clock3, Gift, Plus, PartyPopper } from 'lucide-react';
import { specialDayRepository } from '../../lib/specialDayRepository';
import type { LocalSpecialDay, SpecialDayType } from '../../lib/localTypes';
import { getBirthdaySpecialDays } from '../../lib/specialDays';
import { useLocalDataState } from '../../lib/useLocalData';

type ChildSpecialDayItem = LocalSpecialDay & {
  source?: 'manual' | 'child_birthday';
  recurring?: 'yearly';
  daysLeft?: number;
  createdBy?: 'parent' | 'child' | 'system';
};

type ChildSpecialDayForm = {
  title: string;
  date: string;
  type: Exclude<SpecialDayType, 'birthday'>;
  description: string;
};

const emptyForm: ChildSpecialDayForm = {
  title: '',
  date: new Date().toISOString().slice(0, 10),
  type: 'anniversary',
  description: ''
};

const typeLabels: Record<SpecialDayType, { label: string; icon: string }> = {
  birthday: { label: '生日', icon: '🎂' },
  anniversary: { label: '紀念日', icon: '💗' },
  holiday: { label: '節日', icon: '🎄' },
  family_event: { label: '家庭活動', icon: '🏕' },
  other: { label: '其他', icon: '✨' }
};

const manualTypeOptions: { value: ChildSpecialDayForm['type']; label: string; icon: string }[] = [
  { value: 'anniversary', label: '紀念日', icon: '💗' },
  { value: 'family_event', label: '家庭活動', icon: '🏕' },
  { value: 'other', label: '其他', icon: '✨' }
];

export function ChildSpecialDays() {
  const state = useLocalDataState();
  const activeChild = state.children.find(
    (child) => child.id === state.active_child_id && child.status === 'active'
  ) ?? null;
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<ChildSpecialDayForm>(emptyForm);

  const birthdayDays = useMemo(() => {
    if (!activeChild) return [];
    return getBirthdaySpecialDays([activeChild]).map((day): ChildSpecialDayItem => ({
      id: `child-birthday:${day.childId}`,
      family_id: state.family_id,
      child_id: day.childId,
      childId: day.childId,
      title: day.title,
      date: day.date,
      type: 'birthday',
      description: '來自孩子生日',
      image_media_id: null,
      image_data_url: null,
      created_by: 'system',
      createdBy: 'system',
      source: day.source,
      created_at: day.date,
      updated_at: day.date,
      deleted_at: null,
      recurring: day.recurring,
      daysLeft: day.daysLeft
    }));
  }, [activeChild, state.family_id]);

  const manualDays = useMemo(
    () =>
      state.special_days
        .filter((day) => !day.deleted_at && day.child_id === activeChild?.id && day.type !== 'birthday')
        .map((day): ChildSpecialDayItem => ({
          ...day,
          childId: day.child_id,
          source: day.source ?? 'manual',
          createdBy: day.createdBy ?? 'parent'
        })),
    [activeChild?.id, state.special_days]
  );

  const days = [...birthdayDays, ...manualDays].sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
  const upcoming = days.filter((day) => daysUntil(day.date) >= 0);
  const history = days.filter((day) => daysUntil(day.date) < 0).sort((a, b) => b.date.localeCompare(a.date));
  const nextDays = upcoming.filter((day) => day.type !== 'birthday').slice(0, 2);
  const birthday = birthdayDays[0] ?? null;

  const openCreate = () => {
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  };

  const saveDay = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!activeChild) {
      setFormError('請先選擇目前孩子');
      return;
    }
    try {
      specialDayRepository.createSpecialDay({
        child_id: activeChild.id,
        title: form.title.trim(),
        date: form.date,
        type: form.type,
        description: form.description.trim() || null,
        source: 'manual',
        createdBy: 'child'
      });
      setShowForm(false);
      setForm(emptyForm);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '儲存重要日子失敗');
    }
  };

  const specialDayText = activeChild
    ? `${activeChild.display_name}的重要日子`
    : '重要日子';

  return (
    <div className="child-special-page">
      <header className="child-special-hero">
        <div>
          <span><CalendarHeart size={30} /></span>
          <small>特殊日子</small>
          <h1>{specialDayText}</h1>
          <p>只顯示目前孩子自己的生日與重要日子。</p>
        </div>
        <PartyPopper size={58} />
      </header>

      <section className="child-special-topbar">
        <button className="ds-primary-button" onClick={openCreate} disabled={!activeChild}>
          <Plus size={18} /> 新增我的日子
        </button>
        {!activeChild ? <p className="child-special-empty-note">請先選擇目前孩子。</p> : null}
      </section>

      <section className="child-special-countdowns">
        <CountdownCard title="生日倒數" day={birthday} fallback="還沒有生日資料" icon={<Gift />} />
        <CountdownCard title="最近重要日子" day={nextDays[0] ?? null} fallback="還沒有重要日子" icon={<CalendarHeart />} />
        <CountdownCard title="下一個提醒" day={nextDays[1] ?? nextDays[0] ?? null} fallback="還沒有更多日子" icon={<Clock3 />} />
      </section>

      <section className="child-special-grid">
        <article className="child-special-panel">
          <header><h2>即將到來</h2><small>{upcoming.length} 件</small></header>
          {upcoming.length ? upcoming.map((day) => <SpecialDayItem key={day.id} day={day} />) : <Empty text="目前沒有可顯示的重要日子" />}
        </article>
        <article className="child-special-panel">
          <header><h2>歷史回顧</h2><small>{history.length} 件</small></header>
          {history.length ? history.map((day) => <SpecialDayItem key={day.id} day={day} />) : <Empty text="過去的重要日子會保留在這裡" />}
        </article>
      </section>

      {showForm ? (
        <div className="local-form-backdrop" role="presentation" onMouseDown={() => setShowForm(false)}>
          <section className="local-form-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <small>LOCAL TEST MODE</small>
                <h2>新增我的日子</h2>
              </div>
              <button type="button" aria-label="關閉" onClick={() => setShowForm(false)}>×</button>
            </header>
            <form onSubmit={saveDay}>
              <label className="is-full">
                類型
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ChildSpecialDayForm['type'] })}>
                  {manualTypeOptions.map((type) => (
                    <option value={type.value} key={type.value}>{type.icon} {type.label}</option>
                  ))}
                </select>
              </label>
              <label className="is-full">
                標題
                <input
                  autoFocus
                  required
                  maxLength={60}
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="例如：幼稚園表演"
                />
              </label>
              <label>
                日期
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                />
              </label>
              <label className="is-full">
                描述
                <textarea
                  rows={3}
                  maxLength={220}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="寫下提醒或回憶內容"
                />
              </label>
              {formError ? <p className="local-form-error">{formError}</p> : null}
              <footer>
                <button type="button" onClick={() => setShowForm(false)}>取消</button>
                <button className="ds-primary-button" type="submit">建立日子</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function CountdownCard({ title, day, fallback, icon }: { title: string; day: ChildSpecialDayItem | null; fallback: string; icon: ReactNode }) {
  return (
    <article>
      <span>{icon}</span>
      <small>{title}</small>
      <strong>{day ? `${daysUntil(day.date)} 天` : '-'}</strong>
      <p>{day ? day.title : fallback}</p>
    </article>
  );
}

function SpecialDayItem({ day }: { day: ChildSpecialDayItem }) {
  const type = typeLabels[day.type];
  const remaining = daysUntil(day.date);
  const origin = day.source === 'child_birthday' ? '生日自動產生' : day.createdBy === 'child' ? '孩子新增' : '家長新增';
  return (
    <section>
      {day.image_media_id ? <MediaImage mediaId={day.image_media_id} alt={day.title} /> : <span>{type.icon}</span>}
      <div>
        <small>{type.label} · {origin}</small>
        <strong>{day.title}</strong>
        <p>{day.source === 'child_birthday' ? '來自孩子生日' : day.description || '家人一起記住的重要日子。'}</p>
        <time>{day.date}</time>
      </div>
      <b>{remaining >= 0 ? `${remaining} 天` : '已結束'}</b>
    </section>
  );
}

function MediaImage({ mediaId, alt }: { mediaId: string; alt: string }) {
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

  return url ? <img src={url} alt={alt} /> : null;
}

function Empty({ text }: { text: string }) {
  return <div className="child-special-empty"><span>📅</span><p>{text}</p></div>;
}

function daysUntil(date: string) {
  const start = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}
