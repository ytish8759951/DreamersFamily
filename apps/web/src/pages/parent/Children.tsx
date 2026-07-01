import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Baby,
  Check,
  Edit3,
  Plus,
  Star,
  Tablet,
  Trash2,
  UserRoundCheck,
  Users
} from 'lucide-react';
import { childrenRepository } from '../../lib/childrenRepository';
import type { LocalChild } from '../../lib/localTypes';
import { useLocalDataState } from '../../lib/useLocalData';

type FormMode = 'create' | 'edit';

type ChildFormValues = {
  display_name: string;
  birth_date: string;
  theme_color: string;
  notes: string;
};

const emptyForm: ChildFormValues = {
  display_name: '',
  birth_date: '',
  theme_color: 'blue',
  notes: ''
};

const tones = ['blue', 'pink', 'yellow', 'green'];

export function Children() {
  const state = useLocalDataState();
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChildFormValues>(emptyForm);
  const [error, setError] = useState('');

  const activeChildren = useMemo(
    () => state.children.filter((child) => child.status === 'active'),
    [state.children]
  );
  const activeChild = activeChildren.find((child) => child.id === state.active_child_id) ?? null;

  const starBalance = (childId: string) =>
    state.stars
      .filter((transaction) => transaction.child_id === childId)
      .reduce((total, transaction) => total + transaction.amount, 0);

  const screenTimeBalance = (childId: string) =>
    state.screen_time_logs
      .filter((log) => log.child_id === childId)
      .reduce((total, log) => total + log.minutes_delta, 0);

  const openCreate = () => {
    setFormMode('create');
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  };

  const openEdit = (child: LocalChild) => {
    setFormMode('edit');
    setEditingId(child.id);
    setForm({
      display_name: child.display_name,
      birth_date: child.birth_date ?? '',
      theme_color: child.theme_color ?? 'blue',
      notes: child.notes ?? ''
    });
    setError('');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setError('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      if (formMode === 'create') {
        childrenRepository.createChild({
          display_name: form.display_name,
          birth_date: form.birth_date || null,
          theme_color: form.theme_color,
          notes: form.notes || null
        });
      } else if (editingId) {
        childrenRepository.updateChild(editingId, {
          display_name: form.display_name,
          birth_date: form.birth_date || null,
          theme_color: form.theme_color,
          notes: form.notes || null
        });
      }
      closeForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '儲存失敗');
    }
  };

  const archiveChild = (child: LocalChild) => {
    const confirmed = window.confirm(
      `確定要刪除「${child.display_name}」嗎？本機測試模式會將孩子封存，歷史資料仍會保留。`
    );
    if (confirmed) childrenRepository.deleteChild(child.id);
  };

  return (
    <div className="ds-parent-page child-manager-page">
      <header className="ds-parent-heading">
        <div className="ds-parent-title">
          <span><Baby size={28} /></span>
          <div>
            <h1>孩子管理</h1>
            <p>新增、編輯、封存孩子，並切換目前孩子。</p>
          </div>
        </div>
        <button className="ds-primary-button" onClick={openCreate}>
          <Plus size={20} /> 新增孩子
        </button>
      </header>

      <section className="ds-parent-stats">
        <SummaryCard icon={<Users />} label="孩子" value={`${activeChildren.length} 位`} tone="blue" />
        <SummaryCard
          icon={<UserRoundCheck />}
          label="目前孩子"
          value={activeChild?.display_name ?? '尚未選擇'}
          tone="pink"
        />
        <SummaryCard
          icon={<Star />}
          label="目前星星"
          value={activeChild ? `${starBalance(activeChild.id)} 顆` : '0 顆'}
          tone="yellow"
        />
        <SummaryCard
          icon={<Tablet />}
          label="平板時間"
          value={activeChild ? `${screenTimeBalance(activeChild.id)} 分` : '0 分'}
          tone="green"
        />
      </section>

      <section className="ds-parent-card child-manager-card">
        <header className="child-manager-section-title">
          <div>
            <h2>家庭孩子</h2>
            <p>「目前孩子」會套用到孩子端首頁與後續功能操作。</p>
          </div>
          <span>{activeChildren.length} 位</span>
        </header>

        {activeChildren.length ? (
          <div className="child-manager-grid">
            {activeChildren.map((child, index) => {
              const isActive = child.id === state.active_child_id;
              const tone = child.theme_color || tones[index % tones.length];
              return (
                <article className={`child-manager-item${isActive ? ' is-active' : ''}`} key={child.id}>
                  <div className="child-manager-main">
                    <span className={`ds-avatar ds-tone-${tone}`}>
                      {child.display_name.slice(0, 1)}
                    </span>
                    <div>
                      <strong>{child.display_name}</strong>
                      <small>{formatChildMeta(child)}</small>
                    </div>
                    {isActive ? <em><Check size={14} /> 目前孩子</em> : null}
                  </div>

                  <dl>
                    <div><dt>星星</dt><dd>{starBalance(child.id)} 顆</dd></div>
                    <div><dt>平板</dt><dd>{screenTimeBalance(child.id)} 分</dd></div>
                  </dl>

                  {child.notes ? <p>{child.notes}</p> : <p className="is-muted">尚未新增備註</p>}

                  <footer>
                    <button
                      className="child-switch-button"
                      disabled={isActive}
                      onClick={() => childrenRepository.switchChild(child.id)}
                    >
                      <UserRoundCheck size={16} />
                      {isActive ? '使用中' : '切換孩子'}
                    </button>
                    <button aria-label={`編輯 ${child.display_name}`} onClick={() => openEdit(child)}>
                      <Edit3 size={16} /> 編輯
                    </button>
                    <button
                      className="is-danger"
                      aria-label={`刪除 ${child.display_name}`}
                      onClick={() => archiveChild(child)}
                    >
                      <Trash2 size={16} /> 刪除
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="child-manager-empty">
            <span>🐰</span>
            <h2>先新增第一位孩子</h2>
            <p>新增後即可切換孩子，並開始測試任務、夢想、分享與信箱流程。</p>
            <button className="ds-primary-button" onClick={openCreate}>
              <Plus size={20} /> 新增孩子
            </button>
          </div>
        )}
      </section>

      {formMode ? (
        <div className="local-form-backdrop" role="presentation" onMouseDown={closeForm}>
          <section
            className="local-form-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="child-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>LOCAL TEST MODE</small>
                <h2 id="child-form-title">{formMode === 'create' ? '新增孩子' : '編輯孩子'}</h2>
              </div>
              <button type="button" aria-label="關閉" onClick={closeForm}>×</button>
            </header>

            <form onSubmit={submit}>
              <label>
                顯示名稱
                <input
                  autoFocus
                  required
                  maxLength={30}
                  value={form.display_name}
                  onChange={(event) => setForm({ ...form, display_name: event.target.value })}
                  placeholder="例如：樂樂"
                />
              </label>

              <label>
                生日
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={(event) => setForm({ ...form, birth_date: event.target.value })}
                />
              </label>

              <label>
                主題色
                <select
                  value={form.theme_color}
                  onChange={(event) => setForm({ ...form, theme_color: event.target.value })}
                >
                  <option value="blue">天空藍</option>
                  <option value="pink">珊瑚粉</option>
                  <option value="yellow">星星黃</option>
                  <option value="green">薄荷綠</option>
                </select>
              </label>

              <label className="is-full">
                備註
                <textarea
                  rows={3}
                  maxLength={200}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="選填，例如：喜歡恐龍和畫畫"
                />
              </label>

              {error ? <p className="local-form-error">{error}</p> : null}

              <footer>
                <button type="button" onClick={closeForm}>取消</button>
                <button className="ds-primary-button" type="submit">
                  <Check size={18} /> 儲存孩子
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <article className={`ds-parent-stat ds-tone-${tone} child-manager-stat`}>
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function formatChildMeta(child: LocalChild) {
  if (!child.birth_date) return '尚未設定生日';
  const birthDate = new Date(`${child.birth_date}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!birthdayPassed) age -= 1;
  return `${Math.max(0, age)} 歲 · ${child.birth_date}`;
}
