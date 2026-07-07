import { Clock3, Minus, Plus, Star } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { dataRepository } from '../../lib/dataRepository';
import { starRepository } from '../../lib/starRepository';
import { tabletRepository } from '../../lib/tabletRepository';
import type { LocalChild, LocalScreenTimeLog } from '../../lib/localTypes';
import { useLocalDataState } from '../../lib/useLocalData';

type DialogKind = 'manual_add' | 'penalty';
type ActionDialog = { kind: DialogKind; childId: string } | null;

type LedgerRow = {
  log: LocalScreenTimeLog;
  content: string;
  add: number | null;
  deduct: number | null;
  balance: number;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function logContent(log: LocalScreenTimeLog) {
  if (log.type === 'redeem') return `${log.starsUsed ?? Math.abs(log.minutes_delta)}顆星星兌換`;
  if (log.type === 'manual_add') return log.note || log.reason || '家長增加時間';
  if (log.type === 'penalty') return log.note || log.reason || '家長扣除時間';
  if (log.type === 'used') return log.note || log.reason || '使用平板時間';
  return log.note || log.reason || '平板時間異動';
}

function buildLedger(logs: LocalScreenTimeLog[]): LedgerRow[] {
  let balance = 0;
  return [...logs]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((log) => {
      balance = Math.max(0, balance + log.minutes_delta);
      return {
        log,
        content: logContent(log),
        add: log.minutes_delta > 0 ? log.minutes_delta : null,
        deduct: log.minutes_delta < 0 ? Math.abs(log.minutes_delta) : null,
        balance
      };
    })
    .reverse();
}

function getMonthTotals(logs: LocalScreenTimeLog[]) {
  const currentMonth = monthKey();
  return logs
    .filter((log) => log.created_at.startsWith(currentMonth))
    .reduce(
      (totals, log) => ({
        added: totals.added + Math.max(0, log.minutes_delta),
        deducted: totals.deducted + Math.max(0, -log.minutes_delta)
      }),
      { added: 0, deducted: 0 }
    );
}

export function ParentScreenTime() {
  const state = useLocalDataState();
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const [activeChildId, setActiveChildId] = useState(() => activeChildren[0]?.id ?? '');
  const [dialog, setDialog] = useState<ActionDialog>(null);
  const [error, setError] = useState('');

  const selectedChild = activeChildren.find((child) => child.id === activeChildId) ?? activeChildren[0] ?? null;
  const selectedChildId = selectedChild?.id ?? '';
  const logs = selectedChild ? tabletRepository.getScreenTimeLogsByChild(selectedChild.id) : [];
  const ledger = useMemo(() => buildLedger(logs), [logs]);
  const monthTotals = getMonthTotals(logs);
  const stars = selectedChild ? starRepository.getStarBalance(selectedChild.id) : 0;
  const balance = selectedChild ? tabletRepository.getScreenTimeBalance(selectedChild.id) : 0;

  const redeemAllStars = (child: LocalChild) => {
    setError('');
    const currentStars = starRepository.getStarBalance(child.id);
    if (currentStars <= 0) {
      setError(`${child.display_name} 目前沒有可兌換的星星。`);
      return;
    }
    try {
      tabletRepository.redeemStarsForScreenTime(child.id, today(), currentStars, `${currentStars}顆星星兌換`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '星星兌換失敗');
    }
  };

  return (
    <div className="screen-time-admin">
      <header className="screen-time-admin-hero">
        <div>
          <small>LOCAL DATA MODE</small>
          <h1>平板時間帳本</h1>
          <p>平板時間只由星星兌換、家長增加與家長扣除產生，餘額依帳本累計。</p>
        </div>
        <Clock3 size={44} />
      </header>

      {activeChildren.length ? (
        <div className="screen-time-tabs" role="tablist" aria-label="選擇孩子">
          {activeChildren.map((child) => (
            <button
              key={child.id}
              type="button"
              className={child.id === selectedChildId ? 'is-active' : ''}
              onClick={() => {
                setActiveChildId(child.id);
                setError('');
              }}
            >
              {child.display_name}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="settings-message">{error}</p> : null}

      {selectedChild ? (
        <article className="screen-time-panel">
          <header>
            <div>
              <h2>{selectedChild.display_name}</h2>
              <small>1 顆星星 = 1 分鐘</small>
            </div>
          </header>

          <div className="screen-time-stats">
            <article><small>星星</small><strong>{stars}</strong><span>顆</span></article>
            <article><small>存摺平板時間餘額</small><strong>{balance}</strong><span>分鐘</span></article>
            <article><small>本月增加</small><strong>{monthTotals.added}</strong><span>分鐘</span></article>
            <article><small>本月扣除</small><strong>{monthTotals.deducted}</strong><span>分鐘</span></article>
          </div>

          <div className="screen-time-actions">
            <button type="button" onClick={() => redeemAllStars(selectedChild)}>
              <Star size={16} /> 全部星星兌換
            </button>
            <button type="button" onClick={() => setDialog({ kind: 'manual_add', childId: selectedChild.id })}>
              <Plus size={16} /> 增加時間
            </button>
            <button type="button" onClick={() => setDialog({ kind: 'penalty', childId: selectedChild.id })}>
              <Minus size={16} /> 扣除時間
            </button>
          </div>

          <section className="screen-time-ledger-section">
            <header>
              <h3>帳本紀錄</h3>
              <small>{ledger.length} 筆</small>
            </header>
            <div className="screen-time-ledger">
              <div className="screen-time-ledger-row screen-time-head">
                <span>日期</span>
                <span>內容</span>
                <span>增加</span>
                <span>扣除</span>
                <span>餘額</span>
              </div>
              {ledger.length ? ledger.map((row) => (
                <div className="screen-time-ledger-row" key={row.log.id}>
                  <time>{formatDateTime(row.log.created_at)}</time>
                  <strong>{row.content}</strong>
                  <span className="is-plus">{row.add ? `+${row.add}` : ''}</span>
                  <span className="is-minus">{row.deduct ? `-${row.deduct}` : ''}</span>
                  <b>{row.balance}</b>
                </div>
              )) : <p className="screen-time-empty">目前沒有平板時間帳本紀錄。</p>}
            </div>
          </section>
        </article>
      ) : <p>目前沒有可管理的孩子。</p>}

      {dialog ? (
        <ScreenTimeDialog
          dialog={dialog}
          child={activeChildren.find((child) => child.id === dialog.childId) ?? null}
          onClose={() => setDialog(null)}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function ScreenTimeDialog({
  dialog,
  child,
  onClose,
  onError
}: {
  dialog: Exclude<ActionDialog, null>;
  child: LocalChild | null;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({ minutes: '', reason: '' });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!child) return;
    onError('');
    const minutes = Number(form.minutes);
    try {
      if (dialog.kind === 'manual_add') {
        tabletRepository.addScreenTime(child.id, today(), minutes, form.reason);
      } else {
        tabletRepository.deductScreenTimePenalty(child.id, today(), minutes, form.reason);
      }
      onClose();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : '平板時間更新失敗');
    }
  };

  return (
    <div className="local-form-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="local-form-dialog screen-time-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <small>{child?.display_name ?? '孩子'}</small>
            <h2>{dialog.kind === 'manual_add' ? '增加時間' : '扣除時間'}</h2>
          </div>
          <button type="button" aria-label="關閉" onClick={onClose}>×</button>
        </header>
        <form onSubmit={submit}>
          <label>
            分鐘
            <input
              type="number"
              min="1"
              step="1"
              required
              value={form.minutes}
              onChange={(event) => setForm({ ...form, minutes: event.target.value })}
            />
          </label>
          <label className="is-full">
            原因
            <textarea
              rows={3}
              required
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
            />
          </label>
          <footer>
            <button type="button" onClick={onClose}>取消</button>
            <button className="ds-primary-button" type="submit">儲存</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
