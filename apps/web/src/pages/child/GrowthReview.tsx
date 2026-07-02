import type { ReactNode } from 'react';
import { Activity, BookOpen, Ruler, Scale } from 'lucide-react';
import { resolveCurrentChildId } from '../../lib/childSession';
import { dataRepository } from '../../lib/dataRepository';
import { useLocalDataState } from '../../lib/useLocalData';

export function GrowthReview() {
  const state = useLocalDataState();
  const currentChildId = resolveCurrentChildId(state);
  const selectedChild = currentChildId
    ? state.children.find((child) => child.id === currentChildId && child.status === 'active')
    : null;
  const records = selectedChild
    ? dataRepository.getGrowthRecordsByChild(selectedChild.id)
    : [];

  return (
    <section className="ds-page">
      <header className="ds-page-header">
        <span className="ds-page-icon"><Activity size={30} /></span>
        <div>
          <h1>成長紀錄</h1>
          <p>{selectedChild ? `${selectedChild.display_name} 的身高、體重與閱讀歷史` : '請家長先選擇目前孩子'}</p>
        </div>
      </header>

      {records.length ? (
        <div className="ds-timeline">
          {records.map((record) => (
            <article className="ds-timeline-item" key={record.id}>
              <div className="ds-timeline-icon ds-tone-green"><Activity size={25} /></div>
              <div className="ds-timeline-copy">
                <small>{formatDate(record.date)}</small>
                <h2>成長紀錄</h2>
                <p>
                  <Metric icon={<Ruler size={16} />} label="身高" value={`${formatMetric(record.height_cm)} cm`} />
                  <Metric icon={<Scale size={16} />} label="體重" value={`${formatMetric(record.weight_kg)} kg`} />
                  <Metric icon={<BookOpen size={16} />} label="閱讀" value={`${record.reading_count} 本`} />
                </p>
                {record.note ? <time>{record.note}</time> : <time>尚未新增備註</time>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="child-task-empty">
          <span>🌱</span>
          <p>{selectedChild ? '尚未有成長紀錄' : '請家長先選擇目前孩子'}</p>
        </div>
      )}
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <span>{icon} {label}：{value}</span>;
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
