import { useMemo, useState, type FormEvent } from 'react';
import { Activity, Check, Edit3, Plus, Trash2 } from 'lucide-react';
import { dataModeBadgeLabel } from '../../lib/dataRepository';
import { growthRepository } from '../../lib/growthRepository';
import type { LocalGrowthRecord } from '../../lib/localTypes';
import { useLocalDataState } from '../../lib/useLocalData';

type GrowthFormValues = {
  child_id: string;
  date: string;
  height_cm: string;
  weight_kg: string;
  reading_count: string;
  note: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): GrowthFormValues => ({
  child_id: '',
  date: today(),
  height_cm: '',
  weight_kg: '',
  reading_count: '',
  note: ''
});

export function Growth() {
  const state = useLocalDataState();
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const [childFilter, setChildFilter] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<GrowthFormValues>(() => ({
    ...emptyForm(),
    child_id: state.active_child_id ?? activeChildren[0]?.id ?? ''
  }));
  const [error, setError] = useState('');

  const visibleChildren = useMemo(
    () => activeChildren.filter((child) => childFilter === 'all' || child.id === childFilter),
    [activeChildren, childFilter]
  );
  const records = useMemo(
    () =>
      visibleChildren
        .flatMap((child) => growthRepository.getGrowthRecordsByChild(child.id))
        .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)),
    [state.growth_records, visibleChildren]
  );
  const childName = (childId: string) =>
    state.children.find((child) => child.id === childId)?.display_name ?? '已封存孩子';
  const latestRecord = records[0] ?? null;

  const openCreate = (childId?: string) => {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      child_id: childId ?? (childFilter !== 'all' ? childFilter : state.active_child_id ?? activeChildren[0]?.id ?? '')
    });
    setError('');
    setShowForm(true);
  };

  const openEdit = (record: LocalGrowthRecord) => {
    setEditingId(record.id);
    setForm({
      child_id: record.child_id,
      date: record.date,
      height_cm: String(record.height_cm),
      weight_kg: String(record.weight_kg),
      reading_count: String(record.reading_count),
      note: record.note ?? ''
    });
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setError('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!activeChildren.length) {
      setError('請先新增孩子');
      return;
    }

    const payload = {
      child_id: form.child_id,
      date: form.date,
      height_cm: Number(form.height_cm),
      weight_kg: Number(form.weight_kg),
      reading_count: Number(form.reading_count),
      note: form.note || null
    };

    try {
      if (editingId) growthRepository.updateGrowthRecord(editingId, payload);
      else growthRepository.createGrowthRecord(payload);
      closeForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '儲存成長紀錄失敗');
    }
  };

  const remove = (record: LocalGrowthRecord) => {
    if (window.confirm(`刪除「${childName(record.child_id)} ${record.date}」成長紀錄？`)) {
      growthRepository.deleteGrowthRecord(record.id);
    }
  };

  return (
    <div className="ds-parent-page growth-page">
      <header className="ds-parent-heading">
        <div className="ds-parent-title">
          <span><Activity size={28} /></span>
          <div>
            <h1>成長紀錄</h1>
            <p>記錄孩子的身高、體重與閱讀累積，孩子首頁會顯示最新一筆。</p>
          </div>
        </div>
        <button className="ds-primary-button" onClick={() => openCreate()}>
          <Plus size={20} /> 新增成長紀錄
        </button>
      </header>

      <section className="ds-parent-stats">
        <Summary label="紀錄數" value={`${records.length} 筆`} />
        <Summary label="最新身高" value={latestRecord ? `${latestRecord.height_cm} cm` : '尚未紀錄'} />
        <Summary label="最新體重" value={latestRecord ? `${latestRecord.weight_kg} kg` : '尚未紀錄'} />
        <Summary label="最新閱讀" value={latestRecord ? `${latestRecord.reading_count} 本` : '尚未紀錄'} />
      </section>

      <section className="ds-parent-card">
        <header className="child-manager-section-title">
          <div>
            <h2>歷史紀錄</h2>
            <p>每個孩子一個欄位，最新資料會顯示在欄位頂部。</p>
          </div>
          <select value={childFilter} onChange={(event) => setChildFilter(event.target.value)}>
            <option value="all">全部孩子</option>
            {activeChildren.map((child) => <option value={child.id} key={child.id}>{child.display_name}</option>)}
          </select>
        </header>

        {visibleChildren.length ? (
          <div className="growth-columns">
            {visibleChildren.map((child) => (
              <GrowthColumn
                key={child.id}
                childId={child.id}
                childName={child.display_name}
                records={growthRepository.getGrowthRecordsByChild(child.id)}
                onCreate={() => openCreate(child.id)}
                onEdit={openEdit}
                onRemove={remove}
              />
            ))}
          </div>
        ) : (
          <div className="child-manager-empty">
            <span>🌱</span>
            <h2>尚未新增孩子</h2>
            <p>請先到孩子管理新增孩子，再建立成長紀錄。</p>
          </div>
        )}
      </section>

      {showForm ? (
        <div className="local-form-backdrop" role="presentation" onMouseDown={closeForm}>
          <section className="local-form-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><small>{dataModeBadgeLabel}</small><h2>{editingId ? '編輯成長紀錄' : '新增成長紀錄'}</h2></div>
              <button type="button" aria-label="關閉" onClick={closeForm}>×</button>
            </header>
            <form onSubmit={submit}>
              <label>
                選擇孩子
                <select required value={form.child_id} onChange={(event) => setForm({ ...form, child_id: event.target.value })}>
                  <option value="">請選擇孩子</option>
                  {activeChildren.map((child) => <option value={child.id} key={child.id}>{child.display_name}</option>)}
                </select>
              </label>
              <label>
                日期
                <input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
              </label>
              <label>
                身高 cm
                <input required type="number" min="0" step="0.1" value={form.height_cm} onChange={(event) => setForm({ ...form, height_cm: event.target.value })} />
              </label>
              <label>
                體重 kg
                <input required type="number" min="0" step="0.1" value={form.weight_kg} onChange={(event) => setForm({ ...form, weight_kg: event.target.value })} />
              </label>
              <label>
                閱讀本數
                <input required type="number" min="0" step="1" value={form.reading_count} onChange={(event) => setForm({ ...form, reading_count: event.target.value })} />
              </label>
              <label className="is-full">
                備註
                <textarea rows={3} maxLength={200} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="選填，例如：最近開始喜歡橋梁書" />
              </label>
              {error ? <p className="local-form-error">{error}</p> : null}
              <footer>
                <button type="button" onClick={closeForm}>取消</button>
                <button className="ds-primary-button" type="submit"><Check size={18} /> 儲存紀錄</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <article className="ds-parent-stat ds-tone-green child-manager-stat">
      <span><Activity /></span>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function GrowthColumn({
  childId,
  childName,
  records,
  onCreate,
  onEdit,
  onRemove
}: {
  childId: string;
  childName: string;
  records: LocalGrowthRecord[];
  onCreate: () => void;
  onEdit: (record: LocalGrowthRecord) => void;
  onRemove: (record: LocalGrowthRecord) => void;
}) {
  const latest = records[0] ?? null;
  return (
    <article className="growth-column">
      <header>
        <div className="child-manager-main">
          <span className="ds-avatar ds-tone-green">{childName.slice(0, 1)}</span>
          <div>
            <strong>{childName}</strong>
            <small>{latest ? `最近紀錄 ${formatDate(latest.date)}` : '尚無紀錄'}</small>
          </div>
        </div>
        <dl>
          <div><dt>最新身高</dt><dd>{latest ? `${formatMetric(latest.height_cm)} cm` : '尚無紀錄'}</dd></div>
          <div><dt>最新體重</dt><dd>{latest ? `${formatMetric(latest.weight_kg)} kg` : '尚無紀錄'}</dd></div>
          <div><dt>最新閱讀</dt><dd>{latest ? `${latest.reading_count} 本` : '尚無紀錄'}</dd></div>
        </dl>
      </header>

      <div className="growth-record-list">
        {records.length ? records.map((record) => (
          <section className="growth-record-card" key={record.id}>
            <time>{formatDate(record.date)}</time>
            <dl>
              <div><dt>身高</dt><dd>{formatMetric(record.height_cm)} cm</dd></div>
              <div><dt>體重</dt><dd>{formatMetric(record.weight_kg)} kg</dd></div>
              <div><dt>閱讀</dt><dd>{record.reading_count} 本</dd></div>
            </dl>
            {record.note ? <p>{record.note}</p> : <p className="is-muted">尚未新增備註</p>}
            <footer>
              <button onClick={() => onEdit(record)}><Edit3 size={16} /> 編輯</button>
              <button className="is-danger" onClick={() => onRemove(record)}><Trash2 size={16} /> 刪除</button>
            </footer>
          </section>
        )) : (
          <div className="growth-column-empty">
            <p>尚無成長紀錄</p>
            <button type="button" onClick={onCreate}><Plus size={16} /> 新增紀錄</button>
          </div>
        )}
      </div>
      {records.length ? <button className="growth-add-button" type="button" onClick={onCreate}><Plus size={16} /> 新增紀錄</button> : null}
    </article>
  );
}

function formatMetric(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(`${value}T00:00:00`));
}
