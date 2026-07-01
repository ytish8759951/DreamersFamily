import { Clock3, History, ShieldCheck, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { dataRepository } from '../../lib/dataRepository';
import type { LocalScreenTimeLog } from '../../lib/localTypes';
import { useLocalDataState } from '../../lib/useLocalData';

const PAGE_SIZE = 8;

type LedgerRow = {
  log: LocalScreenTimeLog;
  content: string;
  add: number | null;
  deduct: number | null;
  balance: number;
};

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

export function ChildScreenTime() {
  const state = useLocalDataState();
  const [page, setPage] = useState(1);
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const activeChild = activeChildren.find((child) => child.id === state.active_child_id) ?? activeChildren[0] ?? null;
  const logs = activeChild ? dataRepository.getScreenTimeLogsByChild(activeChild.id) : [];
  const ledger = useMemo(() => buildLedger(logs), [logs]);
  const balance = activeChild ? dataRepository.getScreenTimeBalance(activeChild.id) : 0;
  const stars = activeChild ? dataRepository.getStarBalance(activeChild.id) : 0;
  const recentRows = ledger.slice(0, 3);
  const totalPages = Math.max(1, Math.ceil(ledger.length / PAGE_SIZE));
  const visibleRows = ledger.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="child-screen-time-page">
      <header className="child-screen-time-hero">
        <div>
          <span><Clock3 size={32} /></span>
          <small>平板時間</small>
          <h1>{activeChild ? `${activeChild.display_name} 的平板時間` : '尚未選擇孩子'}</h1>
          <p>這裡顯示你的平板時間存摺餘額，以及最近的帳本紀錄。</p>
        </div>
        <ShieldCheck size={56} />
      </header>

      <section className="child-screen-time-summary">
        <article>
          <small>目前可使用平板時間餘額</small>
          <strong>{balance}</strong>
          <span>分鐘</span>
        </article>
        <article>
          <small>星星數</small>
          <strong>{stars}</strong>
          <span>顆</span>
        </article>
        <article>
          <small>星星兌換比例</small>
          <strong>1:1</strong>
          <span>1 顆 = 1 分鐘</span>
        </article>
      </section>

      <section className="child-screen-time-grid">
        <article className="child-screen-time-panel">
          <header>
            <h2>最近帳本紀錄</h2>
            <small>{recentRows.length} 筆</small>
          </header>
          <div className="screen-time-log-list">
            {recentRows.length ? recentRows.map((row) => (
              <article key={row.log.id}>
                <span className={row.log.minutes_delta >= 0 ? 'is-plus' : 'is-minus'}>
                  {row.log.minutes_delta >= 0 ? '+' : '-'}
                  {Math.abs(row.log.minutes_delta)}
                </span>
                <div>
                  <strong>{row.content}</strong>
                  <p>餘額 {row.balance} 分鐘</p>
                  <time>{formatDateTime(row.log.created_at)}</time>
                </div>
                <History size={18} />
              </article>
            )) : <Empty text="目前沒有平板時間帳本紀錄。" />}
          </div>
        </article>

        <article className="child-screen-time-panel">
          <header>
            <h2>完整歷史</h2>
            <small>{ledger.length} 筆</small>
          </header>
          <div className="screen-time-ledger child-screen-time-ledger">
            <div className="screen-time-ledger-row screen-time-head">
              <span>日期</span>
              <span>內容</span>
              <span>增加</span>
              <span>扣除</span>
              <span>餘額</span>
            </div>
            {visibleRows.length ? visibleRows.map((row) => (
              <div className="screen-time-ledger-row" key={row.log.id}>
                <time>{formatDateTime(row.log.created_at)}</time>
                <strong>{row.content}</strong>
                <span className="is-plus">{row.add ? `+${row.add}` : ''}</span>
                <span className="is-minus">{row.deduct ? `-${row.deduct}` : ''}</span>
                <b>{row.balance}</b>
              </div>
            )) : <Empty text="目前沒有完整歷史紀錄。" />}
          </div>
          {ledger.length > PAGE_SIZE ? (
            <footer className="screen-time-pagination">
              <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一頁</button>
              <span>{page} / {totalPages}</span>
              <button type="button" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一頁</button>
            </footer>
          ) : null}
        </article>
      </section>

      <section className="child-screen-time-ratio">
        <Star size={18} />
        <strong>星星兌換比例：1 顆 = 1 分鐘</strong>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="child-screen-time-empty"><span>空</span><p>{text}</p></div>;
}
