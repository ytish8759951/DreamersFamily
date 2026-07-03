import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, Clock3, Plus } from 'lucide-react';
import { LocalDreamCover } from '../../components/LocalDreamCover';
import { LocalTaskMedia } from '../../components/LocalTaskMedia';
import { LocalShareMedia as LocalShareMediaView } from '../../components/LocalShareMedia';
import { dataMode, dataModeBadgeLabel, dataModeLabel, dataRepository } from '../../lib/dataRepository';
import { useDreamCoverMigration } from '../../lib/dreamCoverMigration';
import { compressImageFile } from '../../lib/imageCompression';
import { mailboxRepository, type MailboxRecordingDraft } from '../../lib/mailboxRepository';
import { memoryRepository } from '../../lib/memoryRepository';
import { shareRepository } from '../../lib/shareRepository';
import { taskRepository } from '../../lib/taskRepository';
import { getParentHistoryTasks, getParentOpenTasks } from '../../lib/taskRules';
import type {
  DreamWithBalance,
  LocalMailboxMessage,
  LocalShare,
  LocalTask,
  ShareWithMedia
} from '../../lib/localTypes';
import { useLocalDataState } from '../../lib/useLocalData';

type Tone = 'blue' | 'green' | 'pink' | 'yellow';

type DreamFormState = {
  child_id: string;
  title: string;
  description: string;
  target_amount: string;
  target_date: string;
  cover_preview_url: string;
  cover_blob: Blob | null;
  cover_mime_type: string;
  cover_file_name: string;
};

type TaskFormState = {
  child_id: string;
  title: string;
  description: string;
  category: LocalTask['category'];
  task_date: string;
  reward_stars: string;
  task_image_file: File | null;
  task_image_preview_url: string;
  task_image_mime_type: string;
  task_image_file_name: string;
};

const kids = [
  { name: '樂樂', avatar: '👦', tone: 'blue' as Tone },
  { name: '安安', avatar: '👦', tone: 'green' as Tone },
  { name: '弟弟', avatar: '👦', tone: 'yellow' as Tone }
];

function Header({ icon, title, subtitle, action, count, onAction }: { icon?: string; title: string; subtitle: string; action?: string; count?: string; onAction?: () => void }) {
  return (
    <section className="pf-header">
      <div><h1>{icon ? <span>{icon}</span> : null}{title}<i>✦</i></h1><p>{subtitle}</p></div>
      {action ? <button onClick={onAction}>＋ <b className="pf-action-full">{action}</b><b className="pf-action-short">{count || '新增'}</b></button> : null}
    </section>
  );
}

function Stats({ items }: { items: { label: string; value: string; tone: Tone }[] }) {
  return <section className="pf-stats">{items.map((item) => <article className={`is-${item.tone}`} key={item.label}><small>{item.label}</small><strong>{item.value}</strong></article>)}</section>;
}

function Panel({ title, action, className = '', children }: { title: string; action?: string; className?: string; children: React.ReactNode }) {
  return <article className={`pf-panel ${className}`}><header><h2>{title}</h2>{action ? <button>{action}</button> : null}</header>{children}</article>;
}

const taskCategoryLabels: Record<LocalTask['category'], string> = {
  daily: '每日任務',
  habit: '習慣養成',
  household: '家事任務',
  challenge: '挑戰任務'
};
type TaskCategoryFilter = '全部' | (typeof taskCategoryLabels)[keyof typeof taskCategoryLabels];

const ALL_CHILDREN_TASK_VALUE = 'all';

export function ParentTasksPage() {
  const state = useLocalDataState();
  const [filter, setFilter] = useState<TaskCategoryFilter>('全部');
  const [childFilter, setChildFilter] = useState(ALL_CHILDREN_TASK_VALUE);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const [taskForm, setTaskForm] = useState<TaskFormState>({
    child_id: '',
    title: '',
    description: '',
    category: 'daily',
    task_date: new Date().toISOString().slice(0, 10),
    reward_stars: '1',
    task_image_file: null,
    task_image_preview_url: '',
    task_image_mime_type: '',
    task_image_file_name: ''
  });

  const childById = (childId: string) =>
    state.children.find((child) => child.id === childId);
  const scopedTasks = useMemo(
    () =>
      state.tasks.filter((task) =>
        childFilter === ALL_CHILDREN_TASK_VALUE ? true : task.child_id === childFilter
      ),
    [childFilter, state.tasks]
  );
  const filteredTasks = useMemo(
    () =>
      scopedTasks
        .filter((task) => {
          const categoryMatches = filter === '全部' || taskCategoryLabels[task.category] === filter;
          return categoryMatches;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [filter, scopedTasks]
  );
  const openTasks = getParentOpenTasks(filteredTasks);
  const historyTasks = getParentHistoryTasks(filteredTasks);
  const approvedTasks = scopedTasks.filter((task) => task.status === 'approved');
  const totalStars = approvedTasks.reduce((total, task) => total + task.reward_stars, 0);
  const approvedCount = approvedTasks.length;
  const submittedCount = scopedTasks.filter((task) => task.status === 'submitted').length;
  const showChildColumn = childFilter === ALL_CHILDREN_TASK_VALUE;

  useEffect(() => {
    if (childFilter !== ALL_CHILDREN_TASK_VALUE && !activeChildren.some((child) => child.id === childFilter)) {
      setChildFilter(ALL_CHILDREN_TASK_VALUE);
    }
  }, [activeChildren, childFilter]);

  useEffect(() => {
    return () => {
      taskRepository.releasePreviewUrl(taskForm.task_image_preview_url);
    };
  }, [taskForm.task_image_preview_url]);

  const openCreateTask = () => {
    taskRepository.releasePreviewUrl(taskForm.task_image_preview_url);
    setTaskForm({
      child_id: activeChildren.length > 0 ? ALL_CHILDREN_TASK_VALUE : '',
      title: '',
      description: '',
      category: 'daily',
      task_date: new Date().toISOString().slice(0, 10),
      reward_stars: '1',
      task_image_file: null,
      task_image_preview_url: '',
      task_image_mime_type: '',
      task_image_file_name: ''
    });
    setFormError('');
    setShowForm(true);
  };

  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const taskChildren =
      taskForm.child_id === ALL_CHILDREN_TASK_VALUE
        ? activeChildren
        : activeChildren.filter((child) => child.id === taskForm.child_id);
    if (!taskChildren.length) {
      setFormError('請先新增孩子');
      return;
    }

    const title = taskForm.title.trim();
    if (!title && !taskForm.task_image_file) {
      setFormError('請至少提供任務名稱或任務圖片');
      return;
    }

    let taskImageMediaId: string | null = null;
    let thumbnailMediaId: string | null = null;

    try {
      if (taskForm.task_image_file) {
        const [originalBlob, thumbnailBlob] = await Promise.all([
          compressImageFile(taskForm.task_image_file, { maxSide: 1200, quality: 0.82 }),
          compressImageFile(taskForm.task_image_file, { maxSide: 300, quality: 0.82 })
        ]);
        taskImageMediaId = createLocalMediaId();
        thumbnailMediaId = createLocalMediaId();
        await Promise.all([
          taskRepository.saveTaskImage({
            id: taskImageMediaId,
            ownerId: taskImageMediaId,
            blob: originalBlob,
            mimeType: originalBlob.type || taskForm.task_image_file.type || 'image/webp',
            fileName: taskForm.task_image_file_name || undefined
          }),
          taskRepository.saveTaskImage({
            id: thumbnailMediaId,
            ownerId: thumbnailMediaId,
            blob: thumbnailBlob,
            mimeType: thumbnailBlob.type || taskForm.task_image_file.type || 'image/webp',
            fileName: taskForm.task_image_file_name || undefined
          })
        ]);
      }

      taskChildren.forEach((child) => {
        taskRepository.createTask({
          child_id: child.id,
          title,
          description: taskForm.description || null,
          category: taskForm.category,
          task_date: taskForm.task_date,
          reward_stars: Number(taskForm.reward_stars),
          task_image_media_id: taskImageMediaId,
          thumbnail_media_id: thumbnailMediaId
        });
      });

      taskRepository.releasePreviewUrl(taskForm.task_image_preview_url);
      setTaskForm({
        child_id: activeChildren.length > 0 ? ALL_CHILDREN_TASK_VALUE : '',
        title: '',
        description: '',
        category: 'daily',
        task_date: new Date().toISOString().slice(0, 10),
        reward_stars: '1',
        task_image_file: null,
        task_image_preview_url: '',
        task_image_mime_type: '',
        task_image_file_name: ''
      });
      setShowForm(false);
    } catch (caught) {
      void taskRepository.deleteTaskMedia(taskImageMediaId);
      void taskRepository.deleteTaskMedia(thumbnailMediaId);
      setFormError(caught instanceof Error ? caught.message : '新增任務失敗');
    }
  };

  const updateTaskImage = async (file: File | null) => {
    setFormError('');
    if (!file) {
      setTaskForm((current) => {
        taskRepository.releasePreviewUrl(current.task_image_preview_url);
        return {
          ...current,
          task_image_file: null,
          task_image_preview_url: '',
          task_image_mime_type: '',
          task_image_file_name: ''
        };
      });
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('任務圖片只支援 jpg、png、webp');
      return;
    }

    try {
      const previewBlob = await compressImageFile(file, { maxSide: 300, quality: 0.82 });
      const previewUrl = taskRepository.createPreviewUrl(previewBlob);
      setTaskForm((current) => {
        taskRepository.releasePreviewUrl(current.task_image_preview_url);
        return {
          ...current,
          task_image_file: file,
          task_image_preview_url: previewUrl,
          task_image_mime_type: previewBlob.type || file.type || 'image/webp',
          task_image_file_name: replaceFileExtension(file.name || 'task-image', previewBlob.type.includes('jpeg') ? 'jpg' : 'webp')
        };
      });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '讀取任務圖片失敗');
    }
  };

  const approve = (task: LocalTask) => {
    try {
      taskRepository.approveTask(task.id);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : '審核失敗');
    }
  };

  return (
    <div className="pf-page pf-task">
      <Header title="任務管理" subtitle="管理孩子每天的任務與獎勵" action="新增任務" onAction={openCreateTask} />
      <Stats items={[
        { label: '📋 總任務', value: String(scopedTasks.length), tone: 'blue' },
        { label: '✓ 已完成', value: String(approvedCount), tone: 'green' },
        { label: '◷ 待審核', value: String(submittedCount), tone: 'pink' },
        { label: '⭐ 已發放星星', value: String(totalStars), tone: 'yellow' }
      ]} />
      <div className="pf-filters task-filter-bar">
        <strong>孩子分頁</strong>
        <div className="pf-task-tabs" role="tablist" aria-label="孩子任務分頁">
          <button
            type="button"
            className={childFilter === ALL_CHILDREN_TASK_VALUE ? 'is-active' : ''}
            onClick={() => setChildFilter(ALL_CHILDREN_TASK_VALUE)}
            role="tab"
            aria-selected={childFilter === ALL_CHILDREN_TASK_VALUE}
          >
            全部
          </button>
          {activeChildren.map((child) => (
            <button
              key={child.id}
              type="button"
              className={childFilter === child.id ? 'is-active' : ''}
              onClick={() => setChildFilter(child.id)}
              role="tab"
              aria-selected={childFilter === child.id}
            >
              {child.display_name}
            </button>
          ))}
        </div>
      </div>
      <div className="pf-filters task-filter-bar">
        <strong>任務分類</strong>
        {(['全部', '每日任務', '習慣養成', '家事任務', '挑戰任務'] as const).map((item) => (
          <button className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>
        ))}
      </div>
      <Panel title="任務列表" action={`共 ${openTasks.length} 個進行中任務`} className="pf-task-list">
        <div className={`pf-task-table pf-task-head ${showChildColumn ? 'is-all-scope' : 'is-child-scope'}`}>
          <span>任務</span>
          {showChildColumn ? <span>孩子</span> : null}
          <span>星星</span>
          <span>分類</span>
          <span>狀態</span>
          <span>操作</span>
        </div>
        {openTasks.length ? openTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            childName={childById(task.child_id)?.display_name ?? '已封存孩子'}
            showChildColumn={showChildColumn}
            onApprove={() => approve(task)}
          />
        )) : <TaskEmpty text="目前沒有符合條件的進行中任務" />}
      </Panel>
      <section className="pf-task-bottom">
        <Panel title="孩子任務進度">
          <div className="pf-kid-progress">
            {childFilter === ALL_CHILDREN_TASK_VALUE ? (
              activeChildren.length ? activeChildren.map((child, index) => {
                const childTasks = state.tasks.filter((task) => task.child_id === child.id);
                const done = childTasks.filter((task) => task.status === 'approved').length;
                const progress = childTasks.length ? Math.round((done / childTasks.length) * 100) : 0;
                return <article key={child.id}><div><span className={`pf-avatar is-${(['blue', 'green', 'yellow'] as Tone[])[index % 3]}`}>{child.display_name.slice(0, 1)}</span><p><strong>{child.display_name}</strong><small>完成率 {progress}%</small></p></div><label><span>全部任務</span><b>{done}/{childTasks.length}</b></label><div className="pf-progress"><i style={{ width: `${progress}%` }} /></div></article>;
              }) : <TaskEmpty text="請先到孩子管理新增孩子" />
            ) : (() => {
              const child = childById(childFilter);
              if (!child) return <TaskEmpty text="請先到孩子管理新增孩子" />;
              const childTasks = state.tasks.filter((task) => task.child_id === child.id);
              const done = childTasks.filter((task) => task.status === 'approved').length;
              const progress = childTasks.length ? Math.round((done / childTasks.length) * 100) : 0;
              return <article key={child.id}><div><span className="pf-avatar is-blue">{child.display_name.slice(0, 1)}</span><p><strong>{child.display_name}</strong><small>完成率 {progress}%</small></p></div><label><span>全部任務</span><b>{done}/{childTasks.length}</b></label><div className="pf-progress"><i style={{ width: `${progress}%` }} /></div></article>;
            })()}
          </div>
        </Panel>
        <Panel title="本週獎勵統計" className="pf-rewards">
          <div className="pf-reward is-green"><span>🏆</span><p><small>完成任務</small><strong>{approvedCount} 個</strong></p></div>
          <div className="pf-reward is-yellow"><span>⭐</span><p><small>發放星星</small><strong>{totalStars} 顆</strong></p></div>
          <div className="pf-reward is-pink"><span>◷</span><p><small>等待審核</small><strong>{submittedCount} 個</strong></p></div>
        </Panel>
      </section>

      <Panel title="🏆 挑戰完成紀錄" action={`${historyTasks.length} 筆`} className="task-history-panel">
        {historyTasks.length ? historyTasks.map((task) => (
          <article key={task.id}>
            <span className={`task-history-icon is-${task.status}`}>{task.status === 'approved' ? '✓' : '•'}</span>
            <div>
              <strong>{task.title}</strong>
              <small>{childById(task.child_id)?.display_name ?? '已封存孩子'}</small>
              {task.completion_note ? <small className="task-history-note">家長評語：{task.completion_note}</small> : null}
            </div>
            <b>⭐ {task.reward_stars}</b>
            <time>{formatTaskTime(task.reviewed_at ?? task.updated_at)}</time>
          </article>
        )) : <TaskEmpty text="尚無已完成任務紀錄" />}
      </Panel>

      {showForm ? (
        <div className="local-form-backdrop" role="presentation" onMouseDown={() => setShowForm(false)}>
          <section className="local-form-dialog task-form-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><small>{dataModeBadgeLabel}</small><h2>新增任務</h2></div>
              <button type="button" aria-label="關閉" onClick={() => setShowForm(false)}>×</button>
            </header>
            <form onSubmit={createTask}>
              <label>
                指派孩子
                <select required value={taskForm.child_id} onChange={(event) => setTaskForm({ ...taskForm, child_id: event.target.value })}>
                  <option value={ALL_CHILDREN_TASK_VALUE} disabled={!activeChildren.length}>全部小孩</option>
                  <option value="">請選擇孩子</option>
                  {activeChildren.map((child) => <option value={child.id} key={child.id}>{child.display_name}</option>)}
                </select>
              </label>
              <label>
                任務分類
                <select value={taskForm.category} onChange={(event) => setTaskForm({ ...taskForm, category: event.target.value as LocalTask['category'] })}>
                  {Object.entries(taskCategoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <label className="is-full">
                任務名稱（選填）
                <input autoFocus maxLength={60} value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="例如：整理玩具" />
              </label>
              <label className="is-full">
                任務圖片
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void updateTaskImage(event.target.files?.[0] ?? null)}
                />
                {taskForm.task_image_preview_url ? (
                  <div className="task-form-image-preview">
                    <img src={taskForm.task_image_preview_url} alt="任務圖片預覽" />
                    <button type="button" onClick={() => void updateTaskImage(null)}>清除圖片</button>
                  </div>
                ) : null}
              </label>
              <label>
                任務日期
                <input type="date" required value={taskForm.task_date} onChange={(event) => setTaskForm({ ...taskForm, task_date: event.target.value })} />
              </label>
              <label>
                星星獎勵
                <input type="number" min="0" max="999" step="1" required value={taskForm.reward_stars} onChange={(event) => setTaskForm({ ...taskForm, reward_stars: event.target.value })} />
              </label>
              <label className="is-full">
                任務說明
                <textarea rows={3} maxLength={200} value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} placeholder="選填，提供孩子簡單清楚的說明" />
              </label>
              {formError ? <p className="local-form-error">{formError}</p> : null}
              <footer>
                <button type="button" onClick={() => setShowForm(false)}>取消</button>
                <button className="ds-primary-button" type="submit"><Plus size={18} /> 建立任務</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({ task, childName, showChildColumn, onApprove }: { task: LocalTask; childName: string; showChildColumn: boolean; onApprove: () => void }) {
  const status = taskStatusLabel(task.status);
  return <article className={`pf-task-row ${showChildColumn ? 'is-all-scope' : 'is-child-scope'}`}>
    <div className="pf-task-name">
      <LocalTaskMedia
        mediaId={task.thumbnail_media_id ?? task.task_image_media_id ?? null}
        alt={task.title || '任務圖片'}
        fallback={taskIcon(task.category)}
        className={`pf-task-thumb is-${taskTone(task.category)}`}
      />
      <p><strong>{task.title || '任務'}</strong><small>{childName} · ⭐ {task.reward_stars}</small></p>
    </div>
    {showChildColumn ? <span className="pf-desktop-only">{childName}</span> : null}
    <span className="pf-star pf-desktop-only">⭐ {task.reward_stars}</span>
    <span className={`pf-tag is-${taskTone(task.category)}`}>{taskCategoryLabels[task.category]}</span>
    <span className={`pf-status ${task.status === 'submitted' ? 'is-review' : 'is-todo'}`}>{status}</span>
    <div className="pf-tools">
      {task.status === 'submitted' ? <button className="task-approve-button" onClick={onApprove}><Check size={13} /> 審核通過</button> : <button disabled><Clock3 size={13} /> 等待孩子</button>}
    </div>
  </article>;
}

function TaskEmpty({ text }: { text: string }) {
  return <div className="task-empty-state"><span>🐰</span><p>{text}</p></div>;
}

function taskTone(category: LocalTask['category']): Tone {
  return ({ daily: 'blue', habit: 'green', household: 'yellow', challenge: 'pink' } as const)[category];
}

function taskIcon(category: LocalTask['category']) {
  return ({ daily: '🧸', habit: '🪥', household: '🎒', challenge: '🏆' } as const)[category];
}

function taskStatusLabel(status: LocalTask['status']) {
  return ({
    pending: '待完成',
    submitted: '待審核',
    approved: '已完成',
    rejected: '需重做',
    cancelled: '已取消',
    expired: '已逾期'
  } as const)[status];
}

function formatTaskTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function ParentShareManagementPage() {
  const state = useLocalDataState();
  const [filter, setFilter] = useState<'全部' | '照片' | '語音' | '影片'>('全部');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [sharePage, setSharePage] = useState(1);
  const [notice, setNotice] = useState('');
  const shares = useMemo(() => buildSharesWithMedia(state), [state]);
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const typeFilteredShares = shares.filter((share) => {
    if (filter === '照片') return share.share_type === 'photo';
    if (filter === '語音') return share.share_type === 'audio';
    if (filter === '影片') return share.share_type === 'video';
    return true;
  });
  const filteredShares = typeFilteredShares.filter((share) => !selectedChildId || share.child_id === selectedChildId);
  const pageSize = 6;
  const totalSharePages = Math.max(1, Math.ceil(filteredShares.length / pageSize));
  const safeSharePage = Math.min(sharePage, totalSharePages);
  const pagedShares = filteredShares.slice((safeSharePage - 1) * pageSize, safeSharePage * pageSize);
  const counts = {
    photo: shares.filter((share) => share.share_type === 'photo').length,
    audio: shares.filter((share) => share.share_type === 'audio').length,
    video: shares.filter((share) => share.share_type === 'video').length,
    total: shares.length
  };
  const childName = (childId: string) =>
    state.children.find((child) => child.id === childId)?.display_name ?? '孩子';
  const selectedChild = selectedChildId ? activeChildren.find((child) => child.id === selectedChildId) ?? null : null;
  const selectedScopeLabel = selectedChild ? `${selectedChild.display_name}的分享` : '全部分享';

  useEffect(() => {
    if (selectedChildId && !activeChildren.some((child) => child.id === selectedChildId)) {
      setSelectedChildId('');
    }
  }, [activeChildren, selectedChildId]);

  useEffect(() => {
    setSharePage(1);
  }, [filter, selectedChildId]);

  useEffect(() => {
    if (sharePage > totalSharePages) setSharePage(totalSharePages);
  }, [sharePage, totalSharePages]);

  const deleteShare = (share: ShareWithMedia) => {
    if (!window.confirm('確定要刪除此分享嗎？')) return;
    try {
      shareRepository.deleteShare(share.id);
      setNotice('已刪除此分享');
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : '刪除分享失敗');
    }
  };

  const sendQuickEncouragement = (share: ShareWithMedia, message: string) => {
    const targetChildName = childName(share.child_id);
    try {
      mailboxRepository.createMailboxMessage({
        child_id: share.child_id,
        title: '快速鼓勵',
        message,
        card_type: 'text',
        template_key: 'share_quick_encouragement'
      });
      setNotice(`已送出鼓勵給 ${targetChildName}：${message}`);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : '送出鼓勵失敗');
    }
  };

  return <div className="pf-page pf-share">
    <Header icon="📷" title="分享管理" subtitle="查看孩子分享的照片、語音與影片" />
    <Stats items={[
      { label: '照片', value: String(counts.photo), tone: 'blue' },
      { label: '語音', value: String(counts.audio), tone: 'green' },
      { label: '影片', value: String(counts.video), tone: 'yellow' },
      { label: '全部分享', value: String(counts.total), tone: 'pink' }
    ]} />
    <div className="pf-filters"><strong>分享類型</strong>{(['全部', '照片', '語音', '影片'] as const).map((item) => <button className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
    <section className="pf-share-grid">
      <Panel title="孩子分享紀錄" action={`${filteredShares.length} 筆`} className="pf-share-list">
        <div className="pf-child-share-tabs" role="tablist" aria-label="選擇孩子分享">
          <button
            type="button"
            className={!selectedChildId ? 'is-active' : ''}
            onClick={() => {
              setSelectedChildId('');
              setNotice('');
            }}
          >
            全部
          </button>
          {activeChildren.map((child) => (
            <button
              type="button"
              className={selectedChildId === child.id ? 'is-active' : ''}
              key={child.id}
              onClick={() => {
                setSelectedChildId(child.id);
                setNotice('');
              }}
            >
              {child.display_name}
            </button>
          ))}
        </div>
        <div className="pf-current-child-share-count">
          <strong>{selectedScopeLabel}</strong>
          <span>{filteredShares.length} 筆</span>
        </div>
        {filteredShares.length ? (
          <div className="pf-current-share-list">
            {pagedShares.map((share) => (
              <ParentShareListRow
                key={share.id}
                share={share}
                childName={childName(share.child_id)}
                onEncourage={() => sendQuickEncouragement(share, '好棒喔')}
                onDelete={() => deleteShare(share)}
              />
            ))}
            <nav className="pf-share-pagination" aria-label="分享分頁">
              <button type="button" disabled={safeSharePage === 1} onClick={() => setSharePage((page) => Math.max(1, page - 1))}>上一頁</button>
              <span>第 {safeSharePage} / {totalSharePages} 頁</span>
              <button type="button" disabled={safeSharePage === totalSharePages} onClick={() => setSharePage((page) => Math.min(totalSharePages, page + 1))}>下一頁</button>
            </nav>
          </div>
        ) : (
          <TaskEmpty text={selectedChild ? `${selectedChild.display_name}目前沒有分享` : '目前沒有分享'} />
        )}
      </Panel>
    </section>
    {notice ? <p className="pf-inline-notice pf-share-page-notice">{notice}</p> : null}
  </div>;
}

function ParentShareListRow({ share, childName, onEncourage, onDelete }: { share: ShareWithMedia; childName: string; onEncourage: () => void; onDelete: () => void }) {
  const media = share.media[0];
  return <article className={`pf-share-row pf-share-large-card is-${share.share_type}`}>
    <header>
      <div>
        <strong>{childName}</strong>
        <time>{formatTaskTime(share.created_at)} · {shareStatusLabel(share.status)}</time>
      </div>
      <span>{shareTypeIcon(share.share_type)} {shareTypeLabel(share.share_type)}</span>
    </header>
    {(share.title || share.caption) ? (
      <section className="pf-share-large-copy">
        {share.title ? <h3>{share.title}</h3> : null}
        {share.caption ? <p>{share.caption}</p> : null}
      </section>
    ) : null}
    <ShareLargeMedia share={share} />
    <footer>
      <button type="button" onClick={onEncourage}>鼓勵</button>
      <button type="button" className="is-delete" onClick={onDelete}>刪除</button>
    </footer>
  </article>;
}

function ShareLargeMedia({ share }: { share: ShareWithMedia }) {
  const media = share.media[0];
  if (media?.media_type === 'photo') {
    return <LocalShareMediaView mediaId={media.id} mediaType="photo" alt={share.title ?? ''} className="pf-share-large-media" />;
  }
  if (media?.media_type === 'video') {
    return <LocalShareMediaView mediaId={media.id} mediaType="video" className="pf-share-large-media" />;
  }
  if (media?.media_type === 'audio') {
    return <LocalShareMediaView mediaId={media.id} mediaType="audio" className="pf-share-large-audio" />;
  }
  return <div className="pf-share-large-empty">{shareTypeIcon(share.share_type)}</div>;
}

export function ParentSharePage() {
  return <ParentShareManagementPage />;
}

function buildSharesWithMedia(state: ReturnType<typeof dataRepository.getState>): ShareWithMedia[] {
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

function shareTypeLabel(type: LocalShare['share_type']) {
  return ({ text: '文字', photo: '照片', audio: '語音', video: '影片', mixed: '混合' } as const)[type];
}

function shareTypeIcon(type: LocalShare['share_type']) {
  return ({ text: '✎', photo: '📷', audio: '🎤', video: '▶', mixed: '▣' } as const)[type];
}

function shareStatusLabel(status: LocalShare['status']) {
  return ({ draft: '草稿', pending_review: '待審核', approved: '已審核', rejected: '已退回', archived: '已封存' } as const)[status];
}

export function ParentDreamsPage() {
  useDreamCoverMigration();
  const state = useLocalDataState();
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const dreams = useMemo(() => buildDreamBalances(state), [state]);
  const activeDreams = dreams.filter((dream) => dream.status !== 'completed');
  const completedDreams = dreams.filter((dream) => dream.status === 'completed');
  const [selectedDreamId, setSelectedDreamId] = useState('');
  const [showDreamForm, setShowDreamForm] = useState(false);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [dreamForm, setDreamForm] = useState<DreamFormState>({
    child_id: '',
    title: '',
    description: '',
    target_amount: '1000',
    target_date: '',
    cover_preview_url: '',
    cover_blob: null,
    cover_mime_type: '',
    cover_file_name: ''
  });
  const [depositForm, setDepositForm] = useState({
    dream_id: '',
    amount: '100',
    note: ''
  });
  const selectedDream =
    dreams.find((dream) => dream.id === selectedDreamId) ??
    activeDreams[0] ??
    completedDreams[0] ??
    null;
  const totalDeposits = state.dream_funds
    .filter((fund) => fund.transaction_type === 'deposit')
    .reduce((total, fund) => total + fund.amount, 0);

  useEffect(() => {
    return () => {
      memoryRepository.releasePreviewUrl(dreamForm.cover_preview_url);
    };
  }, [dreamForm.cover_preview_url]);

  const childName = (childId: string) =>
    state.children.find((child) => child.id === childId)?.display_name ?? '已封存孩子';

  const openDreamForm = () => {
    memoryRepository.releasePreviewUrl(dreamForm.cover_preview_url);
    setDreamForm({
      child_id: state.active_child_id ?? activeChildren[0]?.id ?? '',
      title: '',
      description: '',
      target_amount: '1000',
      target_date: '',
      cover_preview_url: '',
      cover_blob: null,
      cover_mime_type: '',
      cover_file_name: ''
    });
    setFormError('');
    setShowDreamForm(true);
  };

  const openDepositForm = (dream?: DreamWithBalance) => {
    const targetDream = dream ?? selectedDream ?? activeDreams[0];
    setDepositForm({
      dream_id: targetDream?.id ?? '',
      amount: '100',
      note: ''
    });
    setFormError('');
    setShowDepositForm(true);
  };

  const createDream = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    let coverMediaId: string | null = null;
    try {
      if (dreamForm.cover_blob) {
        coverMediaId = createLocalMediaId();
        coverMediaId = await memoryRepository.saveDreamCover({
          id: coverMediaId,
          ownerId: coverMediaId,
          mimeType: dreamForm.cover_mime_type || dreamForm.cover_blob.type || 'image/webp',
          fileName: dreamForm.cover_file_name || undefined,
          blob: dreamForm.cover_blob
        });
      }
      const dream = dataRepository.createDream({
        child_id: dreamForm.child_id,
        title: dreamForm.title,
        description: dreamForm.description || null,
        cover_media_id: coverMediaId,
        cover_mime_type: dreamForm.cover_mime_type || dreamForm.cover_blob?.type || null,
        cover_file_name: dreamForm.cover_file_name || null,
        target_amount: Number(dreamForm.target_amount),
        target_date: dreamForm.target_date || null
      });
      if (coverMediaId) {
        await memoryRepository.updateDreamCoverOwner(coverMediaId, dream.id);
      }
      memoryRepository.releasePreviewUrl(dreamForm.cover_preview_url);
      setSelectedDreamId(dream.id);
      setShowDreamForm(false);
    } catch (caught) {
      void memoryRepository.deleteMedia(coverMediaId);
      setFormError(caught instanceof Error ? caught.message : '新增夢想失敗');
    }
  };

  const addDeposit = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    try {
      dataRepository.addDreamDeposit(depositForm.dream_id, Number(depositForm.amount), depositForm.note || null);
      setSelectedDreamId(depositForm.dream_id);
      setShowDepositForm(false);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '新增存款失敗');
    }
  };

  const completeDream = (dream: DreamWithBalance) => {
    try {
      dataRepository.completeDream(dream.id);
      setSelectedDreamId(dream.id);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : '完成夢想失敗');
    }
  };

  const deleteDream = async (dream: DreamWithBalance) => {
    if (!window.confirm(`確定要刪除「${dream.title}」嗎？`)) return;
    const mediaId = dreamCoverMediaId(dream);
    try {
      await memoryRepository.deleteMedia(mediaId);
      dataRepository.deleteDream(dream.id);
      setSelectedDreamId('');
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : '刪除夢想失敗');
    }
  };

  const updateDreamCover = async (file: File | null) => {
    setFormError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('夢想示意圖只支援 jpg、png、webp');
      return;
    }
    try {
      const blob = await compressImageFile(file);
      const previewUrl = memoryRepository.createPreviewUrl(blob);
      setDreamForm((current) => {
        memoryRepository.releasePreviewUrl(current.cover_preview_url);
        return {
          ...current,
          cover_preview_url: previewUrl,
          cover_blob: blob,
          cover_mime_type: blob.type || 'image/webp',
          cover_file_name: replaceFileExtension(file.name || 'dream-cover', blob.type.includes('jpeg') ? 'jpg' : 'webp')
        };
      });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '讀取夢想示意圖失敗');
    }
  };

  const clearDreamCover = () => {
    setDreamForm((current) => {
      memoryRepository.releasePreviewUrl(current.cover_preview_url);
      return {
        ...current,
        cover_preview_url: '',
        cover_blob: null,
        cover_mime_type: '',
        cover_file_name: ''
      };
    });
  };

  return <div className="pf-page pf-dream">
    <Header icon="🌈" title="夢想管理" subtitle="管理孩子的夢想與存錢進度" action="新增夢想" onAction={openDreamForm} />
    <Stats items={[
      { label: '進行中夢想', value: String(activeDreams.length), tone: 'green' },
      { label: '已完成夢想', value: String(completedDreams.length), tone: 'yellow' },
      { label: '總存款', value: formatMoney(totalDeposits), tone: 'blue' },
      { label: '可完成夢想', value: String(activeDreams.filter((dream) => dream.status === 'funded').length), tone: 'pink' }
    ]} />
    {selectedDream ? (
      <section className="pf-dream-hero">
        <div className="pf-dream-image">
          <span>{dreamStatusLabel(selectedDream.status)}</span>
          <LocalDreamCover mediaId={dreamCoverMediaId(selectedDream)} fallbackSrc={dreamCover(selectedDream)} alt={selectedDream.title} />
        </div>
        <div className="pf-dream-copy">
          <h2>🌈 {selectedDream.title}</h2>
          <div><span>目標金額<strong>{formatMoney(selectedDream.target_amount)}</strong></span><span>已存金額<strong>{formatMoney(selectedDream.current_amount)}</strong></span></div>
          <label><span>完成度</span><b>{selectedDream.progress_percent}%</b></label>
          <div className="pf-progress"><i style={{ width: `${selectedDream.progress_percent}%` }} /></div>
          <em>{selectedDream.status === 'completed' ? '夢想已完成，孩子端也會同步顯示。' : selectedDream.status === 'funded' ? '已達標，可以標記完成夢想。' : `還差 ${formatMoney(Math.max(0, selectedDream.target_amount - selectedDream.current_amount))} 就能完成夢想`}</em>
          <div className="dream-actions">
            <button onClick={() => openDepositForm(selectedDream)} disabled={selectedDream.status === 'completed'}>💰 新增存款</button>
            <button onClick={() => completeDream(selectedDream)} disabled={selectedDream.status !== 'funded'}>🏆 完成夢想</button>
            <button onClick={() => void deleteDream(selectedDream)}>刪除夢想</button>
          </div>
        </div>
      </section>
    ) : (
      <section className="pf-panel dream-empty-state">
        <span>🌈</span>
        <h2>還沒有夢想基金</h2>
        <p>先新增孩子，再建立第一個夢想。資料會同步到 {dataModeLabel}。</p>
        <button className="ds-primary-button" onClick={openDreamForm}>＋ 新增夢想</button>
      </section>
    )}
    <section className="pf-dream-main">
      <div>
        <Panel title="孩子夢想清單" action={`共 ${dreams.length} 個夢想`} className="pf-dream-list">
          {dreams.length ? dreams.map((item) => <article key={item.id} className={selectedDream?.id === item.id ? 'is-selected' : ''} onClick={() => setSelectedDreamId(item.id)}>
            <LocalDreamCover mediaId={dreamCoverMediaId(item)} fallbackSrc={dreamCover(item)} alt="" />
            <div><span>👦 {childName(item.child_id)} · {dreamStatusLabel(item.status)}</span><strong>{item.title}</strong><div className="pf-progress"><i style={{ width: `${item.progress_percent}%` }} /></div></div>
            <b>{item.progress_percent}%</b>
          </article>) : <TaskEmpty text="尚未建立夢想，請點新增夢想開始測試" />}
        </Panel>
        <Panel title="🏆 已完成夢想" action={`${completedDreams.length} 個`} className="pf-finished">
          {completedDreams.length ? completedDreams.map((item) => <article key={item.id}><span>🏆</span><strong>{item.title}</strong><small>{formatDate(item.completed_at ?? item.updated_at)}</small></article>) : <TaskEmpty text="完成夢想後會出現在這裡" />}
        </Panel>
      </div>
      <div>
        <Panel title="最新存款" action={`${state.dream_funds.length} 筆`} className="pf-deposits">{state.dream_funds.length ? state.dream_funds.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6).map((fund) => <article key={fund.id}><span className="pf-avatar is-green">💰</span><p><strong>{childName(fund.child_id)}</strong><small>{dreams.find((dream) => dream.id === fund.dream_id)?.title ?? '夢想基金'} · {formatDate(fund.created_at)}</small></p><b>＋ {formatMoney(fund.amount)}</b></article>) : <TaskEmpty text="新增存款後會顯示紀錄" />}</Panel>
        <Panel title="快速管理" className="pf-manage">
          <button onClick={openDreamForm}>🌈 新增夢想</button>
          <button onClick={() => openDepositForm()}>💰 新增存款</button>
          <button onClick={() => selectedDream ? setSelectedDreamId(selectedDream.id) : undefined}>📊 查看進度</button>
          <button onClick={() => selectedDream && completeDream(selectedDream)} disabled={!selectedDream || selectedDream.status !== 'funded'}>🏆 標記完成</button>
          <button onClick={() => selectedDream ? void deleteDream(selectedDream) : undefined} disabled={!selectedDream}>刪除夢想</button>
        </Panel>
      </div>
    </section>

    {showDreamForm ? (
      <div className="local-form-backdrop" role="presentation" onMouseDown={() => setShowDreamForm(false)}>
        <section className="local-form-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><small>{dataModeBadgeLabel}</small><h2>新增夢想</h2></div><button type="button" aria-label="關閉" onClick={() => setShowDreamForm(false)}>×</button></header>
          <form onSubmit={createDream}>
            <label>孩子<select required value={dreamForm.child_id} onChange={(event) => setDreamForm({ ...dreamForm, child_id: event.target.value })}><option value="">請選擇孩子</option>{activeChildren.map((child) => <option value={child.id} key={child.id}>{child.display_name}</option>)}</select></label>
            <label>目標金額<input type="number" min="0" step="1" required value={dreamForm.target_amount} onChange={(event) => setDreamForm({ ...dreamForm, target_amount: event.target.value })} /></label>
            <label className="is-full">夢想名稱<input autoFocus required maxLength={60} value={dreamForm.title} onChange={(event) => setDreamForm({ ...dreamForm, title: event.target.value })} placeholder="例如：彩虹腳踏車" /></label>
            <label>目標日期<input type="date" value={dreamForm.target_date} onChange={(event) => setDreamForm({ ...dreamForm, target_date: event.target.value })} /></label>
            <label className="is-full">夢想說明<textarea rows={3} maxLength={200} value={dreamForm.description} onChange={(event) => setDreamForm({ ...dreamForm, description: event.target.value })} placeholder="選填，寫下孩子想完成這個夢想的原因" /></label>
            <label className="is-full">
              夢想示意圖
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void updateDreamCover(event.currentTarget.files?.[0] ?? null)} />
            </label>
            {dreamForm.cover_preview_url ? (
              <div className="dream-cover-preview">
                <img src={dreamForm.cover_preview_url} alt="夢想示意圖預覽" />
                <button type="button" onClick={clearDreamCover}>移除圖片</button>
              </div>
            ) : null}
            {formError ? <p className="local-form-error">{formError}</p> : null}
            <footer><button type="button" onClick={() => setShowDreamForm(false)}>取消</button><button className="ds-primary-button" type="submit"><Plus size={18} /> 建立夢想</button></footer>
          </form>
        </section>
      </div>
    ) : null}

    {showDepositForm ? (
      <div className="local-form-backdrop" role="presentation" onMouseDown={() => setShowDepositForm(false)}>
        <section className="local-form-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><small>{dataModeBadgeLabel}</small><h2>新增存款</h2></div><button type="button" aria-label="關閉" onClick={() => setShowDepositForm(false)}>×</button></header>
          <form onSubmit={addDeposit}>
            <label className="is-full">選擇夢想<select required value={depositForm.dream_id} onChange={(event) => setDepositForm({ ...depositForm, dream_id: event.target.value })}><option value="">請選擇夢想</option>{activeDreams.map((dream) => <option value={dream.id} key={dream.id}>{childName(dream.child_id)} · {dream.title} · {dream.progress_percent}%</option>)}</select></label>
            <label>存款金額<input autoFocus type="number" min="1" step="1" required value={depositForm.amount} onChange={(event) => setDepositForm({ ...depositForm, amount: event.target.value })} /></label>
            <label className="is-full">備註<textarea rows={3} maxLength={160} value={depositForm.note} onChange={(event) => setDepositForm({ ...depositForm, note: event.target.value })} placeholder="例如：完成家事、生日紅包、主動存下零用錢" /></label>
            {formError ? <p className="local-form-error">{formError}</p> : null}
            <footer><button type="button" onClick={() => setShowDepositForm(false)}>取消</button><button className="ds-primary-button" type="submit"><Plus size={18} /> 加入存款</button></footer>
          </form>
        </section>
      </div>
    ) : null}
  </div>;
}

function buildDreamBalances(state: ReturnType<typeof dataRepository.getState>): DreamWithBalance[] {
  return state.dreams
    .map((dream) => {
      const currentAmount = state.dream_funds
        .filter((fund) => fund.dream_id === dream.id)
        .reduce((total, fund) => total + fund.amount, 0);
      return {
        ...dream,
        current_amount: currentAmount,
        progress_percent:
          dream.target_amount === 0
            ? 100
            : Math.min(100, Math.round((currentAmount / dream.target_amount) * 100))
      };
    })
    .sort((a, b) => b.priority - a.priority || b.created_at.localeCompare(a.created_at));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function dreamStatusLabel(status: DreamWithBalance['status']) {
  return ({
    pending_approval: '待核准',
    active: '進行中',
    funded: '已達標',
    completed: '已完成',
    cancelled: '已取消',
    archived: '已封存'
  } as const)[status];
}

function dreamCover(dream: Pick<DreamWithBalance, 'cover_path' | 'coverUrl' | 'imageUrl' | 'title'>) {
  return safeAssetCover(dream.cover_path) || safeAssetCover(dream.coverUrl) || safeAssetCover(dream.imageUrl) || defaultDreamCover(dream.title);
}

function dreamCoverMediaId(dream: Pick<DreamWithBalance, 'cover_media_id' | 'coverMediaId'>) {
  return dream.cover_media_id ?? dream.coverMediaId ?? null;
}

function safeAssetCover(value?: string | null) {
  if (!value || value.startsWith('data:image')) return null;
  return value;
}

function defaultDreamCover(title: string) {
  if (title.includes('熊')) return '/design-assets/teddy-bear.jpg';
  if (title.includes('火車')) return '/design-assets/wooden-train.jpg';
  if (title.includes('車') || title.toLowerCase().includes('bike')) return '/design-assets/sage-scooter.png';
  return '/design-assets/wooden-train.jpg';
}

function replaceFileExtension(fileName: string, extension: string) {
  return `${fileName.replace(/\.[^.]+$/, '') || 'dream-cover'}.${extension}`;
}

function createLocalMediaId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function legacyDreamCover(title: string) {
  if (title.includes('腳踏車') || title.toLowerCase().includes('bike')) return '/design-assets/sage-scooter.png';
  if (title.includes('熊')) return '/design-assets/teddy-bear.jpg';
  if (title.includes('火車')) return '/design-assets/wooden-train.jpg';
  if (title.includes('滑板') || title.includes('車')) return '/design-assets/sage-scooter.png';
  return '/design-assets/wooden-train.jpg';
}

type MailboxRecordedAudio = {
} & MailboxRecordingDraft;

export function ParentMailboxPage() {
  const state = useLocalDataState();
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const messages = state.encouragement_cards
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordingTokenRef = useRef(0);
  const [form, setForm] = useState({
    child_id: 'all',
    type: 'text' as LocalMailboxMessage['card_type'],
    title: '',
    message: '',
    file: null as File | null,
    recording: null as MailboxRecordedAudio | null,
    recording_accepted: false,
    is_recording: false,
    recording_seconds: 0
  });
  const childName = (childId: string) =>
    state.children.find((child) => child.id === childId)?.display_name ?? '已封存孩子';
  const openForm = (type: LocalMailboxMessage['card_type']) => {
    stopActiveRecording(false);
    setForm({
      child_id: state.active_child_id ?? activeChildren[0]?.id ?? 'all',
      type,
      title: '',
      message: '',
      file: null,
      recording: null,
      recording_accepted: false,
      is_recording: false,
      recording_seconds: 0
    });
    setFormError('');
    setShowForm(true);
  };

  const closeMailboxForm = () => {
    stopActiveRecording(false);
    mailboxRepository.releaseRecordingDraft(form.recording);
    setShowForm(false);
  };

  const clearRecordingTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopRecordingStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  function stopActiveRecording(saveRecording = true) {
    clearRecordingTimer();
    recordingTokenRef.current += saveRecording ? 0 : 1;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      stopRecordingStream();
      recorderRef.current = null;
      chunksRef.current = [];
      if (!saveRecording) {
        setForm((current) => ({ ...current, is_recording: false, recording_seconds: 0 }));
      }
    }
  }

  const resetRecording = () => {
    stopActiveRecording(false);
    mailboxRepository.releaseRecordingDraft(form.recording);
    setForm((current) => ({
      ...current,
      recording: null,
      recording_accepted: false,
      is_recording: false,
      recording_seconds: 0
    }));
    setFormError('');
  };

  const startRecording = async () => {
    setFormError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setFormError('此瀏覽器不支援直接錄音，請改用支援 MediaRecorder 的瀏覽器。');
      return;
    }
    try {
      stopActiveRecording(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getMailboxRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const token = recordingTokenRef.current + 1;
      recordingTokenRef.current = token;
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearRecordingTimer();
        stopRecordingStream();
        recorderRef.current = null;
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (recordingTokenRef.current !== token || chunks.length === 0) return;
        if (recordingTokenRef.current !== token) return;
        const recording = mailboxRepository.createRecordingDraft({
          chunks,
          mimeType: recorder.mimeType || mimeType || 'audio/webm',
          fileName: `mailbox-recording-${Date.now()}.webm`,
          durationSeconds: form.recording_seconds
        });
        setForm((current) => {
          mailboxRepository.releaseRecordingDraft(current.recording);
          return {
            ...current,
            recording,
            recording_accepted: false,
            is_recording: false
          };
        });
      };
      recorder.start();
      setForm((current) => ({
        ...current,
        recording: current.recording?.preview_url ? (mailboxRepository.releaseRecordingDraft(current.recording), null) : null,
        recording_accepted: false,
        is_recording: true,
        recording_seconds: 0
      }));
      timerRef.current = window.setInterval(() => {
        setForm((current) => ({
          ...current,
          recording_seconds: current.is_recording ? current.recording_seconds + 1 : current.recording_seconds
        }));
      }, 1000);
    } catch (caught) {
      stopActiveRecording(false);
      setFormError(caught instanceof DOMException && caught.name === 'NotAllowedError'
        ? '需要允許麥克風權限才能錄音。'
        : '無法啟動麥克風，請確認瀏覽器權限與裝置狀態。');
    }
  };

  useEffect(() => () => stopActiveRecording(false), []);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const recipients =
      form.child_id === 'all'
        ? activeChildren
        : activeChildren.filter((child) => child.id === form.child_id);
    if (!recipients.length) {
      setFormError('請先建立或選擇孩子');
      return;
    }
    try {
      let media: { media_id: string; mime_type: string; file_name?: string } | null = null;
      if (form.type === 'audio') {
        if (!form.recording || !form.recording_accepted) {
          setFormError('請先錄音，再使用這段錄音送出。');
          return;
        }
        const mediaId = await mailboxRepository.saveMailboxRecording({ ownerId: 'mailbox-audio', recording: form.recording });
        media = {
          media_id: mediaId,
          mime_type: form.recording.mime_type,
          file_name: form.recording.file_name
        };
      } else if (form.type === 'image') {
        if (!form.file) {
          setFormError('請選擇本機檔案');
          return;
        }
        const mediaId = await mailboxRepository.saveMailboxMediaFile({
          ownerId: 'mailbox-image',
          cardType: form.type,
          file: form.file
        });
        media = { media_id: mediaId, mime_type: form.file.type || mailboxDefaultMimeType(form.type), file_name: form.file.name };
      }
      recipients.forEach((child) => {
        mailboxRepository.createMailboxMessage({
          child_id: child.id,
          title: form.title || mailboxDefaultTitle(form.type),
          message: form.message || (form.type === 'card' ? '你今天很棒，繼續加油！' : null),
          card_type: form.type,
          template_key: form.type === 'card' ? 'local-encouragement-card' : null,
          media
        });
      });
      closeMailboxForm();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '發送訊息失敗');
    }
  };

  return <div className="pf-page pf-mailbox">
    <Header icon="💌" title="信箱管理" subtitle="管理給孩子的鼓勵與訊息" action="新增訊息" onAction={() => openForm('text')} />
    <Stats items={[
      { label: '💌 已寄出信件', value: String(messages.length), tone: 'green' },
      { label: '💗 鼓勵卡', value: String(messages.filter((message) => message.card_type === 'card').length), tone: 'pink' },
      { label: '🎤 語音訊息', value: String(messages.filter((message) => message.card_type === 'audio').length), tone: 'yellow' },
      { label: '🖼 圖片訊息', value: String(messages.filter((message) => message.card_type === 'image').length), tone: 'blue' }
    ]} />
    <Panel title="快速發送" action="選一張愛的小卡" className="pf-send">
      {[
        ['💬', '文字訊息', '送上一句溫暖的話', 'green', 'text'],
        ['💗', '鼓勵卡', '用小卡鼓勵孩子', 'pink', 'card'],
        ['🎤', '語音訊息', '選擇本機音檔', 'yellow', 'audio'],
        ['🖼', '圖片訊息', '選擇本機圖片', 'blue', 'image']
      ].map((item) => <button className={`is-${item[3]}`} key={item[1]} onClick={() => openForm(item[4] as LocalMailboxMessage['card_type'])}><span>{item[0]}</span><p><strong>{item[1]}</strong><small>{item[2]}</small></p></button>)}
    </Panel>
    <section className="pf-mail-middle">
      <Panel title="最近寄出訊息" action={`查看全部 ${messages.length} 則`} className="pf-messages">
        {messages.length ? messages.map((message, i) => <article key={message.id}><span className={`pf-avatar is-${kids[i % kids.length].tone}`}>👦</span><div><p><strong>{childName(message.child_id)}</strong><i>{mailboxTypeIcon(message.card_type)} {mailboxTypeLabel(message.card_type)}</i></p><b>{message.title || message.message || mailboxTypeLabel(message.card_type)}</b><small>{message.status === 'opened' ? '已讀' : '未讀'}</small></div><time>{formatDate(message.sent_at ?? message.created_at)}</time></article>) : <TaskEmpty text="尚未寄出訊息" />}
      </Panel>
      <Panel title="訊息範本" action="常用快速訊息" className="pf-templates">{['💗 好棒喔！', '🌟 繼續加油！', '🎉 我為你感到驕傲！', '🌈 今天也很努力呢！'].map((item, i) => <button className={`is-${(['pink', 'yellow', 'blue', 'green'] as Tone[])[i]}`} key={item} onClick={() => setForm((current) => ({ ...current, message: item.replace(/^[^ ]+ /, '') }))}>{item}</button>)}</Panel>
    </section>
    <section className="pf-mail-bottom">
      <Panel title="已讀狀態" action="孩子端點開後同步" className="pf-events">{activeChildren.map((child, index) => {
        const childMessages = messages.filter((message) => message.child_id === child.id);
        const readCount = childMessages.filter((message) => message.status === 'opened').length;
        return <article key={child.id}><span>👦</span><p><strong>{child.display_name}</strong><small>{readCount}/{childMessages.length} 則已讀</small></p><b>{childMessages.length - readCount} 未讀</b></article>;
      })}</Panel>
      <Panel title="寄件摘要" action={dataModeLabel} className="pf-replies">{messages.slice(0, 4).map((message, i) => <article key={message.id}><span className={`pf-avatar is-${kids[i % kids.length].tone}`}>{mailboxTypeIcon(message.card_type)}</span><p><strong>{childName(message.child_id)}</strong><small>{message.status === 'opened' ? '孩子已讀' : '等待孩子查看'}</small></p></article>)}</Panel>
    </section>
    {showForm ? (
      <div className="local-form-backdrop" role="presentation" onMouseDown={closeMailboxForm}>
        <section className="local-form-dialog mailbox-form-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><small>{dataModeBadgeLabel}</small><h2>發送{mailboxTypeLabel(form.type)}</h2></div><button type="button" aria-label="關閉" onClick={closeMailboxForm}>×</button></header>
          <form onSubmit={sendMessage}>
            <label>
              收件孩子
              <select value={form.child_id} onChange={(event) => setForm({ ...form, child_id: event.target.value })}>
                <option value="all">全部孩子</option>
                {activeChildren.map((child) => <option value={child.id} key={child.id}>{child.display_name}</option>)}
              </select>
            </label>
            <label>
              訊息類型
              <select value={form.type} onChange={(event) => {
                stopActiveRecording(false);
                setForm({
                  ...form,
                  type: event.target.value as LocalMailboxMessage['card_type'],
                  file: null,
                  recording: null,
                  recording_accepted: false,
                  is_recording: false,
                  recording_seconds: 0
                });
              }}>
                <option value="text">文字訊息</option>
                <option value="card">鼓勵卡</option>
                <option value="audio">語音訊息</option>
                <option value="image">圖片訊息</option>
              </select>
            </label>
            <label className="is-full">標題<input autoFocus maxLength={60} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={mailboxDefaultTitle(form.type)} /></label>
            <label className="is-full">內容<textarea rows={3} maxLength={240} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="寫下想對孩子說的話" /></label>
            {form.type === 'audio' ? (
              <MailboxAudioRecorder
                recording={form.recording}
                accepted={form.recording_accepted}
                isRecording={form.is_recording}
                seconds={form.recording_seconds}
                onStart={startRecording}
                onStop={() => stopActiveRecording(true)}
                onReset={resetRecording}
                onUse={() => setForm((current) => ({ ...current, recording_accepted: true }))}
              />
            ) : null}
            {form.type === 'image' ? (
              <label className="is-full">本機檔案<input required type="file" accept={mailboxAccept(form.type)} onChange={(event) => setForm({ ...form, file: event.currentTarget.files?.[0] ?? null })} /></label>
            ) : null}
            {formError ? <p className="local-form-error">{formError}</p> : null}
            <footer><button type="button" onClick={closeMailboxForm}>取消</button><button className="ds-primary-button" type="submit">發送訊息</button></footer>
          </form>
        </section>
      </div>
    ) : null}
  </div>;
}

function MailboxAudioRecorder({
  recording,
  accepted,
  isRecording,
  seconds,
  onStart,
  onStop,
  onReset,
  onUse
}: {
  recording: MailboxRecordedAudio | null;
  accepted: boolean;
  isRecording: boolean;
  seconds: number;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onUse: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  return (
    <section className="mailbox-recorder is-full" aria-label="語音錄音">
      {!recording && !isRecording ? (
        <button type="button" className="mailbox-recorder-primary" onClick={onStart}>
          <span>🎤</span>
          開始錄音
        </button>
      ) : null}
      {isRecording ? (
        <div className="mailbox-recorder-live">
          <div><strong>🔴 錄音中</strong><time>{formatMailboxRecordingTime(seconds)}</time></div>
          <button type="button" onClick={onStop}>停止</button>
        </div>
      ) : null}
      {recording && !isRecording ? (
        <div className="mailbox-recorder-ready">
          <audio ref={audioRef} src={recording.preview_url} controls />
          <div>
            <button type="button" onClick={() => void audioRef.current?.play()}>播放</button>
            <button type="button" onClick={onReset}>🗑 重錄</button>
            <button type="button" className={accepted ? 'is-selected' : ''} disabled={accepted} onClick={onUse}>
              {accepted ? '已使用錄音' : '使用錄音'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getMailboxRecordingMimeType() {
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

function formatMailboxRecordingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function mailboxTypeLabel(type: LocalMailboxMessage['card_type']) {
  return ({ text: '文字訊息', card: '鼓勵卡', audio: '語音訊息', image: '圖片訊息', video: '影片訊息', mixed: '混合訊息' } as const)[type];
}

function mailboxTypeIcon(type: LocalMailboxMessage['card_type']) {
  return ({ text: '💬', card: '💗', audio: '🎤', image: '🖼', video: '▶', mixed: '▣' } as const)[type];
}

function mailboxDefaultTitle(type: LocalMailboxMessage['card_type']) {
  return ({ text: '給你的話', card: '你今天很棒', audio: '語音留言', image: '圖片留言', video: '影片留言', mixed: '給你的訊息' } as const)[type];
}

function mailboxAccept(type: LocalMailboxMessage['card_type']) {
  if (type === 'audio') return 'audio/*';
  if (type === 'image') return 'image/*';
  return undefined;
}

function mailboxDefaultMimeType(type: LocalMailboxMessage['card_type']) {
  if (type === 'audio') return 'audio/mpeg';
  if (type === 'image') return 'image/jpeg';
  return 'text/plain';
}
