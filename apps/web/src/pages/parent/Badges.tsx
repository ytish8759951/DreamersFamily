import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Award, Medal, Plus, Trash2, Trophy } from 'lucide-react';
import { dataModeBadgeLabel, dataRepository } from '../../lib/dataRepository';
import { starRepository } from '../../lib/starRepository';
import type { LocalBadge, LocalChildBadge } from '../../lib/localTypes';
import { useLocalDataState } from '../../lib/useLocalData';

const tones = ['blue', 'green', 'pink', 'yellow'] as const;
const badgeIconOptions = ['🏅', '🌟', '🏆', '🎖', '💖', '📚', '🧹', '🎯', '🌈'];

export function Badges() {
  const state = useLocalDataState();
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const badges = state.badges.filter((badge) => !badge.deleted_at);
  const [childFilter, setChildFilter] = useState('all');
  const [showBadgeForm, setShowBadgeForm] = useState(false);
  const [showAwardForm, setShowAwardForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [badgeForm, setBadgeForm] = useState({
    name: '',
    icon: '🏅',
    description: '',
    reward_stars: '5'
  });
  const [awardForm, setAwardForm] = useState({
    child_id: '',
    badge_id: '',
    note: ''
  });
  const records = useMemo(
    () =>
      state.child_badges
        .filter((record) => childFilter === 'all' || record.child_id === childFilter)
        .sort((a, b) => b.awarded_at.localeCompare(a.awarded_at)),
    [childFilter, state.child_badges]
  );
  const filteredChildren = childFilter === 'all'
    ? activeChildren
    : activeChildren.filter((child) => child.id === childFilter);
  const childName = (childId: string) =>
    state.children.find((child) => child.id === childId)?.display_name ?? '已封存孩子';
  const badgeById = (badgeId: string) => state.badges.find((badge) => badge.id === badgeId);
  const starBalance = (childId: string) => starRepository.getStarBalance(childId);
  const badgeRewardStars = activeChildren
    .flatMap((child) => starRepository.listStarTransactions(child.id))
    .filter((star) => star.reason?.startsWith('獲得徽章'))
    .reduce((total, star) => total + star.amount, 0);

  const openBadgeForm = () => {
    setBadgeForm({ name: '', icon: '🏅', description: '', reward_stars: '5' });
    setFormError('');
    setShowBadgeForm(true);
  };
  const openAwardForm = (badge?: LocalBadge) => {
    setAwardForm({
      child_id: childFilter === 'all' ? activeChildren[0]?.id ?? '' : childFilter,
      badge_id: badge?.id ?? badges[0]?.id ?? '',
      note: ''
    });
    setFormError('');
    setShowAwardForm(true);
  };
  const createBadge = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    try {
      dataRepository.createBadge({
        name: badgeForm.name,
        icon: badgeForm.icon,
        description: badgeForm.description || null,
        reward_stars: Number(badgeForm.reward_stars)
      });
      setShowBadgeForm(false);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '新增徽章失敗');
    }
  };
  const awardBadge = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    try {
      dataRepository.awardBadge({
        child_id: awardForm.child_id,
        badge_id: awardForm.badge_id,
        note: awardForm.note || null
      });
      setShowAwardForm(false);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '頒發徽章失敗');
    }
  };
  const deleteBadge = (badge: LocalBadge) => {
    if (window.confirm(`刪除徽章「${badge.name}」？已頒發紀錄會保留。`)) {
      dataRepository.deleteBadge(badge.id);
    }
  };

  return (
    <div className="badge-admin-page">
      <header className="badge-admin-hero">
        <div>
          <span><Trophy size={30} /></span>
          <h1>徽章管理</h1>
          <p>建立徽章、頒發給孩子，管理孩子的成就紀錄。</p>
        </div>
        <div>
          <button onClick={openBadgeForm}><Plus size={18} /> 新增徽章</button>
          <button onClick={() => openAwardForm()}><Medal size={18} /> 頒發徽章</button>
        </div>
      </header>

      <section className="badge-admin-stats">
        <Stat icon={<Award />} label="徽章圖鑑" value={`${badges.length} 枚`} tone="blue" />
        <Stat icon={<Medal />} label="已頒發" value={`${state.child_badges.length} 次`} tone="green" />
        <Stat icon={<Trophy />} label="獎勵星星" value={`${badgeRewardStars} 顆`} tone="yellow" />
        <Stat icon={<Award />} label="孩子數" value={`${activeChildren.length} 位`} tone="pink" />
      </section>

      <div className="badge-filter-bar">
        <strong>孩子篩選</strong>
        <button className={childFilter === 'all' ? 'is-active' : ''} onClick={() => setChildFilter('all')}>全部孩子</button>
        {activeChildren.map((child) => (
          <button className={childFilter === child.id ? 'is-active' : ''} onClick={() => setChildFilter(child.id)} key={child.id}>{child.display_name}</button>
        ))}
      </div>

      <section className="badge-admin-grid">
        <article className="badge-panel badge-catalog">
          <header><h2>徽章圖鑑</h2><small>{badges.length} 枚</small></header>
          <div>
            {badges.length ? badges.map((badge) => (
              <div className="badge-list-card" key={badge.id}>
                <div className="badge-list-main">
                  <div className="badge-list-title-row">
                    <span className="badge-list-icon">{badge.icon}</span>
                    <strong className="badge-list-title">{badge.name}</strong>
                  </div>
                  <p className="badge-list-description">{badge.description || '尚無描述'}</p>
                  <div className="badge-list-reward">獎勵 {badge.reward_stars} 顆星星</div>
                </div>
                <div className="badge-list-actions">
                  <button onClick={() => openAwardForm(badge)}>頒發</button>
                  <button aria-label={`刪除 ${badge.name}`} onClick={() => deleteBadge(badge)}><Trash2 size={16} /></button>
                </div>
              </div>
            )) : <EmptyState text="尚未建立徽章" />}
          </div>
        </article>

        <article className="badge-panel badge-child-stats">
          <header><h2>孩子成就統計</h2><small>{filteredChildren.length} 位</small></header>
          <div>
            {filteredChildren.map((child, index) => {
              const awarded = state.child_badges.filter((record) => record.child_id === child.id);
              const doneTasks = state.tasks.filter((task) => task.child_id === child.id && task.status === 'approved').length;
              const doneDreams = state.dreams.filter((dream) => dream.child_id === child.id && dream.status === 'completed').length;
              return (
                <section key={child.id}>
                  <span className={`badge-avatar is-${tones[index % tones.length]}`}>{child.display_name.slice(0, 1)}</span>
                  <div><strong>{child.display_name}</strong><small>{awarded.length} 枚徽章 · {starBalance(child.id)} 顆星星</small></div>
                  <b>{doneTasks} 任務</b>
                  <b>{doneDreams} 夢想</b>
                </section>
              );
            })}
          </div>
        </article>
      </section>

      <article className="badge-panel badge-records">
        <header><h2>徽章紀錄</h2><small>{records.length} 筆</small></header>
        {records.length ? records.map((record) => (
          <BadgeRecord key={record.id} record={record} badge={badgeById(record.badge_id)} childName={childName(record.child_id)} />
        )) : <EmptyState text="尚未頒發徽章" />}
      </article>

      {showBadgeForm ? (
        <div className="local-form-backdrop" role="presentation" onMouseDown={() => setShowBadgeForm(false)}>
          <section className="local-form-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><small>{dataModeBadgeLabel}</small><h2>新增徽章</h2></div><button type="button" aria-label="關閉" onClick={() => setShowBadgeForm(false)}>×</button></header>
            <form onSubmit={createBadge}>
              <div className="badge-icon-field">
                <span>選擇徽章圖示</span>
                <div className="badge-icon-picker" role="radiogroup" aria-label="選擇徽章圖示">
                  {badgeIconOptions.map((icon, index) => (
                    <button
                      autoFocus={index === 0}
                      aria-checked={badgeForm.icon === icon}
                      className={badgeForm.icon === icon ? 'is-selected' : ''}
                      key={icon}
                      onClick={() => setBadgeForm({ ...badgeForm, icon })}
                      role="radio"
                      type="button"
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <label>獎勵星星<input type="number" min="0" step="1" required value={badgeForm.reward_stars} onChange={(event) => setBadgeForm({ ...badgeForm, reward_stars: event.target.value })} /></label>
              <label className="is-full">名稱<input required maxLength={40} value={badgeForm.name} onChange={(event) => setBadgeForm({ ...badgeForm, name: event.target.value })} placeholder="例如：閱讀小達人" /></label>
              <label className="is-full">描述<textarea rows={3} maxLength={180} value={badgeForm.description} onChange={(event) => setBadgeForm({ ...badgeForm, description: event.target.value })} placeholder="說明這枚徽章代表的成就" /></label>
              {formError ? <p className="local-form-error">{formError}</p> : null}
              <footer><button type="button" onClick={() => setShowBadgeForm(false)}>取消</button><button className="ds-primary-button" type="submit">建立徽章</button></footer>
            </form>
          </section>
        </div>
      ) : null}

      {showAwardForm ? (
        <div className="local-form-backdrop" role="presentation" onMouseDown={() => setShowAwardForm(false)}>
          <section className="local-form-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><small>{dataModeBadgeLabel}</small><h2>頒發徽章</h2></div><button type="button" aria-label="關閉" onClick={() => setShowAwardForm(false)}>×</button></header>
            <form onSubmit={awardBadge}>
              <label>孩子<select required value={awardForm.child_id} onChange={(event) => setAwardForm({ ...awardForm, child_id: event.target.value })}><option value="">請選擇孩子</option>{activeChildren.map((child) => <option value={child.id} key={child.id}>{child.display_name}</option>)}</select></label>
              <label>徽章<select required value={awardForm.badge_id} onChange={(event) => setAwardForm({ ...awardForm, badge_id: event.target.value })}><option value="">請選擇徽章</option>{badges.map((badge) => <option value={badge.id} key={badge.id}>{badge.icon} {badge.name}</option>)}</select></label>
              <label className="is-full">備註<textarea rows={3} maxLength={160} value={awardForm.note} onChange={(event) => setAwardForm({ ...awardForm, note: event.target.value })} placeholder="例如：連續完成閱讀任務 7 天" /></label>
              {formError ? <p className="local-form-error">{formError}</p> : null}
              <footer><button type="button" onClick={() => setShowAwardForm(false)}>取消</button><button className="ds-primary-button" type="submit">頒發徽章</button></footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return <article className={`is-${tone}`}><span>{icon}</span><small>{label}</small><strong>{value}</strong></article>;
}

function BadgeRecord({ record, badge, childName }: { record: LocalChildBadge; badge?: LocalBadge; childName: string }) {
  return (
    <section>
      <span>{badge?.icon ?? '🏅'}</span>
      <div><strong>{childName} 獲得 {badge?.name ?? '已刪除徽章'}</strong><small>{record.note || badge?.description || '手動頒發徽章'}</small></div>
      <time>{formatDate(record.awarded_at)}</time>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="badge-empty"><span>🏅</span><p>{text}</p></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
