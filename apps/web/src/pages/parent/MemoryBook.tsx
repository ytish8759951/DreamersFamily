import { useEffect, useMemo, useState } from 'react';
import { Archive, BookOpen, CalendarDays, Download, FileText, Mic, Save } from 'lucide-react';
import { memoryBookRepository } from '../../lib/memoryBookRepository';
import { memoryRepository } from '../../lib/memoryRepository';
import { growthRepository } from '../../lib/growthRepository';
import type { LocalChild, LocalDatabaseState, LocalShareMedia } from '../../lib/localTypes';
import { getBirthdaySpecialDays } from '../../lib/specialDays';
import { useLocalDataState } from '../../lib/useLocalData';

type MemoryCategory = 'all' | 'share' | 'task' | 'piggy' | 'wish' | 'growth';

type MemoryEntry = {
  id: string;
  childId: string;
  date: string;
  category: Exclude<MemoryCategory, 'all'>;
  type: string;
  icon: string;
  title: string;
  description: string;
  media?: LocalShareMedia[];
  coverMediaId?: string | null;
  exportData: unknown;
};

type AnnualBook = {
  child: LocalChild;
  year: number;
  entries: MemoryEntry[];
  coverPhotoIds: string[];
  parentNote: string;
  stats: {
    shareCount: number;
    completedTasks: number;
    piggySaved: number;
    completedWishes: number;
    heightRange: string;
    weightRange: string;
  };
};

const categoryLabels: Record<MemoryCategory, string> = {
  all: '全部',
  share: '分享',
  task: '任務',
  piggy: '撲滿',
  wish: '願望',
  growth: '成長'
};

const monthFormatter = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' });

export function MemoryBook() {
  const state = useLocalDataState();
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const availableYears = useMemo(() => buildAvailableYears(state), [state]);
  const [childId, setChildId] = useState<string>('all');
  const [year, setYear] = useState(() => availableYears[0] ?? new Date().getFullYear());
  const [category, setCategory] = useState<MemoryCategory>('all');
  const [downloadMessage, setDownloadMessage] = useState('');
  const [noteRevision, setNoteRevision] = useState(0);

  useEffect(() => {
    if (!availableYears.includes(year)) setYear(availableYears[0] ?? new Date().getFullYear());
  }, [availableYears, year]);

  const books = useMemo(() => buildAnnualBooks(state, activeChildren, year, childId), [state, activeChildren, year, childId, noteRevision]);
  const visibleEntries = books
    .flatMap((book) => book.entries)
    .filter((entry) => category === 'all' || entry.category === category)
    .sort((a, b) => b.date.localeCompare(a.date));
  const grouped = groupEntriesByMonth(visibleEntries);
  const selectedChildName = childId === 'all'
    ? '全部孩子'
    : activeChildren.find((child) => child.id === childId)?.display_name ?? '孩子';

  const runDownload = async (label: string, task: () => Promise<void>) => {
    setDownloadMessage(`正在準備 ${label}...`);
    try {
      await task();
      setDownloadMessage(`已下載 ${label}`);
    } catch (caught) {
      setDownloadMessage(caught instanceof Error ? caught.message : '下載失敗');
    }
  };

  return (
    <div className="ds-parent-page memory-book-page">
      <header className="ds-parent-heading memory-book-hero">
        <div className="ds-parent-title">
          <span><BookOpen size={28} /></span>
          <div>
            <h1>年度回憶冊</h1>
            <p>每位孩子每年一本，引用既有 mediaId，不複製媒體。</p>
          </div>
        </div>
        <button
          className="ds-primary-button"
          type="button"
          onClick={() => runDownload(`${selectedChildName}-${year}-年度回憶冊`, () => downloadYearBooks(books))}
          disabled={!books.length}
        >
          <Archive size={18} /> 下載年度 ZIP
        </button>
      </header>

      <section className="memory-book-filters ds-parent-card">
        <label>孩子
          <select value={childId} onChange={(event) => setChildId(event.target.value)}>
            <option value="all">全部</option>
            {activeChildren.map((child) => <option value={child.id} key={child.id}>{child.display_name}</option>)}
          </select>
        </label>
        <label>年度
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {availableYears.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>分類
          <select value={category} onChange={(event) => setCategory(event.target.value as MemoryCategory)}>
            {(Object.keys(categoryLabels) as MemoryCategory[]).map((item) => (
              <option value={item} key={item}>{categoryLabels[item]}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="memory-book-cover-grid">
        {books.map((book) => (
          <BookCover
            book={book}
            key={`${book.child.id}-${book.year}`}
            onSaveNote={(note) => {
              memoryBookRepository.saveAnnualParentNote(book.child.id, book.year, note);
              setNoteRevision((value) => value + 1);
              setDownloadMessage(`已儲存 ${book.child.display_name} ${book.year} 年度家長備註`);
            }}
            onDownloadPdf={() => runDownload(`${book.child.display_name}-${book.year}-summary.pdf`, () => downloadBookPdf(book))}
            onDownload={() => runDownload(`${book.child.display_name}-${book.year}-年度回憶冊`, () => downloadYearBooks([book]))}
          />
        ))}
      </section>

      <section className="ds-parent-card memory-book-content">
        <header className="child-manager-section-title">
          <div>
            <h2>年度內容</h2>
            <p>分享、任務、撲滿、商品購買、願望、成長與特殊日。</p>
          </div>
          <span>{visibleEntries.length} 筆</span>
        </header>

        {grouped.length ? grouped.map((group) => (
          <MonthSection
            key={group.month}
            month={group.month}
            entries={group.entries}
            onDownload={() => runDownload(group.label, () => downloadMonthZip(group.label, group.entries))}
          />
        )) : (
          <div className="memory-book-empty">
            <BookOpen size={42} />
            <h2>尚無年度內容</h2>
            <p>完成任務、分享、存款或新增成長紀錄後會出現在這裡。</p>
          </div>
        )}
      </section>

      {downloadMessage ? <p className="memory-book-download-message">{downloadMessage}</p> : null}
    </div>
  );
}

function BookCover({
  book,
  onSaveNote,
  onDownloadPdf,
  onDownload
}: {
  book: AnnualBook;
  onSaveNote: (note: string) => void;
  onDownloadPdf: () => void;
  onDownload: () => void;
}) {
  const title = `${book.child.display_name}-${book.year}-年度回憶冊`;
  const [note, setNote] = useState(book.parentNote);

  useEffect(() => {
    setNote(book.parentNote);
  }, [book.parentNote, book.child.id, book.year]);

  return (
    <article className="memory-book-cover ds-parent-card">
      <CoverCollage mediaIds={book.coverPhotoIds} />
      <div className="memory-book-cover-copy">
        <span>YEAR</span>
        <h2>{book.child.display_name}</h2>
        <p>{book.year} 年度回憶冊</p>
      </div>
      <dl>
        <div><dt>分享</dt><dd>{book.stats.shareCount} 筆</dd></div>
        <div><dt>任務</dt><dd>{book.stats.completedTasks} 筆</dd></div>
        <div><dt>撲滿</dt><dd>{formatMoney(book.stats.piggySaved)}</dd></div>
        <div><dt>願望</dt><dd>{book.stats.completedWishes} 個</dd></div>
        <div><dt>身高</dt><dd>{book.stats.heightRange}</dd></div>
        <div><dt>體重</dt><dd>{book.stats.weightRange}</dd></div>
      </dl>
      <label className="memory-book-parent-note">
        <span>年度家長備註</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={`${book.child.display_name} 今年最想留下的一段話...`}
          rows={4}
        />
      </label>
      <div className="memory-book-cover-actions">
        <button type="button" onClick={() => onSaveNote(note)}><Save size={16} /> 儲存備註</button>
        <button type="button" onClick={onDownloadPdf}><FileText size={16} /> 下載 PDF</button>
        <button type="button" onClick={onDownload}><Download size={16} /> 下載 ZIP</button>
      </div>
    </article>
  );
}

function CoverCollage({ mediaIds }: { mediaIds: string[] }) {
  return (
    <div className="memory-book-collage" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <MediaThumb mediaId={mediaIds[index] ?? null} key={`${mediaIds[index] ?? 'empty'}-${index}`} />
      ))}
    </div>
  );
}

function MonthSection({ month, entries, onDownload }: { month: string; entries: MemoryEntry[]; onDownload: () => void }) {
  const label = monthFormatter.format(new Date(`${month}-01T00:00:00`));
  return (
    <section className="memory-book-month">
      <header>
        <div>
          <CalendarDays size={20} />
          <h3>{label}</h3>
        </div>
        <button type="button" onClick={onDownload}><Download size={15} /> 下載本月 ZIP</button>
      </header>
      <div className="memory-book-entry-list">
        {entries.map((entry) => <MemoryEntryCard entry={entry} key={entry.id} />)}
      </div>
    </section>
  );
}

function MemoryEntryCard({ entry }: { entry: MemoryEntry }) {
  const firstMedia = entry.media?.[0] ?? null;
  return (
    <article className={`memory-book-entry is-${entry.category}`}>
      <div className="memory-book-entry-media">
        {firstMedia ? <MediaThumb mediaId={firstMedia.id} mediaType={firstMedia.media_type} /> : <span>{entry.icon}</span>}
      </div>
      <div>
        <small>{categoryLabels[entry.category]} · {formatDate(entry.date)}</small>
        <strong>{entry.title}</strong>
        <p>{entry.description}</p>
        {entry.media?.length ? (
          <div className="memory-book-media-actions">
            {entry.media.map((media) => (
              <button type="button" key={media.id} onClick={() => void downloadSingleMedia(media)}>
                {mediaIcon(media.media_type)} 下載{mediaTypeLabel(media.media_type)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MediaThumb({ mediaId, mediaType = 'photo' }: { mediaId: string | null; mediaType?: LocalShareMedia['media_type'] }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    if (!mediaId) return () => {
      active = false;
    };
    void memoryRepository.getMemoryMediaUrl(mediaId).then((value) => {
      if (active) setUrl(value);
      else memoryRepository.releaseMemoryMediaUrl(mediaId);
    });
    return () => {
      active = false;
      memoryRepository.releaseMemoryMediaUrl(mediaId);
    };
  }, [mediaId]);

  if (!url) return <span>{mediaIcon(mediaType)}</span>;
  if (mediaType === 'video') return <video src={url} muted playsInline />;
  if (mediaType === 'audio') return <span><Mic size={28} /></span>;
  return <img src={url} alt="" />;
}

function buildAnnualBooks(state: LocalDatabaseState, children: LocalChild[], year: number, childId: string): AnnualBook[] {
  const selectedChildren = childId === 'all' ? children : children.filter((child) => child.id === childId);
  return selectedChildren.map((child) => {
    const entries = buildEntriesForChild(state, child, year).sort((a, b) => b.date.localeCompare(a.date));
    const growth = growthRepository.getGrowthRecords()
      .filter((record) => record.child_id === child.id && yearOf(record.date) === year)
      .sort((a, b) => a.date.localeCompare(b.date));
    const coverPhotoIds = entries
      .flatMap((entry) => entry.media ?? [])
      .filter((media) => media.media_type === 'photo')
      .slice(0, 4)
      .map((media) => media.id);
    return {
      child,
      year,
      entries,
      coverPhotoIds,
      parentNote: memoryBookRepository.getAnnualParentNote(child.id, year)?.note ?? '',
      stats: {
        shareCount: state.shares.filter((share) => share.child_id === child.id && !share.deleted_at && yearOf(share.created_at) === year).length,
        completedTasks: state.tasks.filter((task) => task.child_id === child.id && ['submitted', 'approved'].includes(task.status) && yearOf(task.completed_at ?? task.reviewed_at ?? task.updated_at) === year).length,
        piggySaved: sum(state.piggy_bank_logs.filter((log) => log.child_id === child.id && log.type === 'coin_deposit' && yearOf(log.created_at) === year).map((log) => log.amount)),
        completedWishes: state.dreams.filter((dream) => dream.child_id === child.id && dream.status === 'completed' && dream.completed_at && yearOf(dream.completed_at) === year).length,
        heightRange: rangeLabel(growth.map((record) => record.height_cm), 'cm'),
        weightRange: rangeLabel(growth.map((record) => record.weight_kg), 'kg')
      }
    };
  });
}

function buildEntriesForChild(state: LocalDatabaseState, child: LocalChild, year: number): MemoryEntry[] {
  const shareEntries = state.shares
    .filter((share) => share.child_id === child.id && !share.deleted_at && yearOf(share.created_at) === year)
    .map((share): MemoryEntry => {
      const media = state.share_media.filter((item) => item.share_id === share.id).sort((a, b) => a.sort_order - b.sort_order);
      return {
        id: `share:${share.id}`,
        childId: child.id,
        date: share.created_at,
        category: 'share',
        type: share.share_type,
        icon: mediaIcon(share.share_type === 'mixed' || share.share_type === 'text' ? 'photo' : share.share_type),
        title: share.title || share.caption || `${shareTypeLabel(share.share_type)}分享`,
        description: share.caption || shareTypeLabel(share.share_type),
        media,
        exportData: { ...share, mediaIds: media.map((item) => item.id) }
      };
    });

  const taskEntries = state.tasks
    .filter((task) => task.child_id === child.id && ['submitted', 'approved'].includes(task.status))
    .filter((task) => yearOf(task.completed_at ?? task.reviewed_at ?? task.updated_at) === year)
    .map((task): MemoryEntry => ({
      id: `task:${task.id}`,
      childId: child.id,
      date: task.completed_at ?? task.reviewed_at ?? task.updated_at,
      category: 'task',
      type: task.category,
      icon: '✅',
      title: task.title || taskCategoryLabel(task.category),
      description: `${taskCategoryLabel(task.category)}完成，+${task.reward_stars} 星星`,
      coverMediaId: task.thumbnail_media_id ?? task.task_image_media_id,
      exportData: task
    }));

  const piggyLogs = state.piggy_bank_logs
    .filter((log) => log.child_id === child.id && yearOf(log.created_at) === year)
    .map((log): MemoryEntry => ({
      id: `piggy-log:${log.id}`,
      childId: child.id,
      date: log.created_at,
      category: 'piggy',
      type: log.type,
      icon: log.type === 'coin_deposit' ? '🪙' : '🛍',
      title: log.type === 'coin_deposit' ? '撲滿存款' : log.type === 'purchase_debit' ? '商品購買' : '退款',
      description: `${formatMoney(log.amount)}${log.note ? ` · ${log.note}` : ''}`,
      exportData: log
    }));

  const purchaseEntries = state.piggy_purchases
    .filter((purchase) => purchase.child_id === child.id && purchase.purchased_at && yearOf(purchase.purchased_at) === year)
    .map((purchase): MemoryEntry => ({
      id: `piggy-purchase:${purchase.id}`,
      childId: child.id,
      date: purchase.purchased_at ?? purchase.requested_at,
      category: 'piggy',
      type: 'purchase',
      icon: '🎁',
      title: `商品購買：${purchase.product_snapshot.name}`,
      description: formatMoney(purchase.amount || purchase.product_snapshot.price),
      coverMediaId: purchase.product_snapshot.main_media_id,
      exportData: purchase
    }));

  const wishEntries = state.dreams
    .filter((dream) => dream.child_id === child.id && dream.status === 'completed' && dream.completed_at && yearOf(dream.completed_at) === year)
    .map((dream): MemoryEntry => ({
      id: `wish:${dream.id}`,
      childId: child.id,
      date: dream.completed_at ?? dream.updated_at,
      category: 'wish',
      type: 'completed',
      icon: '🌟',
      title: `願望完成：${dream.title}`,
      description: `${formatMoney(dream.target_amount)} 已完成`,
      coverMediaId: dream.cover_media_id ?? dream.coverMediaId ?? null,
      exportData: dream
    }));

  const growthEntries = growthRepository.getGrowthRecords()
    .filter((record) => record.child_id === child.id && yearOf(record.date) === year)
    .map((record): MemoryEntry => ({
      id: `growth:${record.id}`,
      childId: child.id,
      date: record.date,
      category: 'growth',
      type: 'growth',
      icon: '📏',
      title: '成長紀錄',
      description: `身高 ${record.height_cm} cm · 體重 ${record.weight_kg} kg${record.note ? ` · ${record.note}` : ''}`,
      exportData: { ...record, age: ageAt(child.birth_date ?? child.birthday, record.date), birthday: child.birth_date ?? child.birthday }
    }));

  const specialDayEntries = [
    ...state.special_days.filter((day) => !day.deleted_at && (day.child_id === null || day.child_id === child.id)),
    ...getBirthdaySpecialDays([child])
  ]
    .filter((day) => yearOf(day.date) === year)
    .map((day): MemoryEntry => ({
      id: `special-day:${'id' in day ? day.id : `${day.childId}-${day.date}`}`,
      childId: child.id,
      date: day.date,
      category: 'growth',
      type: 'special-day',
      icon: day.type === 'birthday' ? '🎂' : '📅',
      title: day.title,
      description: ('description' in day ? day.description : null) || specialDayTypeLabel(day.type),
      coverMediaId: 'image_media_id' in day ? day.image_media_id : null,
      exportData: day
    }));

  return [...shareEntries, ...taskEntries, ...piggyLogs, ...purchaseEntries, ...wishEntries, ...growthEntries, ...specialDayEntries];
}

function buildAvailableYears(state: LocalDatabaseState) {
  const years = new Set<number>([new Date().getFullYear()]);
  [
    ...state.shares.map((item) => item.created_at),
    ...state.tasks.map((item) => item.completed_at ?? item.reviewed_at ?? item.updated_at),
    ...state.piggy_bank_logs.map((item) => item.created_at),
    ...state.piggy_purchases.map((item) => item.purchased_at ?? item.requested_at),
    ...state.dreams.map((item) => item.completed_at ?? item.updated_at),
    ...growthRepository.getGrowthRecords().map((item) => item.date),
    ...state.special_days.map((item) => item.date)
  ].forEach((value) => {
    const itemYear = yearOf(value);
    if (itemYear) years.add(itemYear);
  });
  return Array.from(years).sort((a, b) => b - a);
}

function groupEntriesByMonth(entries: MemoryEntry[]) {
  const groups = new Map<string, MemoryEntry[]>();
  entries.forEach((entry) => {
    const month = entry.date.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), entry]);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, groupEntries]) => ({
      month,
      label: monthFormatter.format(new Date(`${month}-01T00:00:00`)),
      entries: groupEntries.sort((a, b) => b.date.localeCompare(a.date))
    }));
}

async function downloadSingleMedia(media: LocalShareMedia) {
  const download = await memoryRepository.getMediaForDownload(media);
  memoryRepository.downloadBlob(download.blob, safeFileName(download.fileName));
}

async function downloadMonthZip(label: string, entries: MemoryEntry[]) {
  await downloadEntriesZip(`${safeFileName(label)}-年度回憶冊`, entries);
}

async function downloadBookPdf(book: AnnualBook) {
  memoryRepository.downloadBlob(
    createBytesBlob(buildSummaryPdf(book), 'application/pdf'),
    `${safeFileName(book.child.display_name)}-${book.year}-summary.pdf`
  );
}

async function downloadYearBooks(books: AnnualBook[]) {
  const year = books[0]?.year ?? new Date().getFullYear();
  const files: ZipInput[] = [];

  for (const book of books) {
    files.push(...await buildAnnualBookZipFiles(book));
  }

  const zip = createZip(files);
  memoryRepository.downloadBlob(memoryRepository.createZipBlob(zip), `DreamersFamily-${year}.zip`);
}

async function downloadEntriesZip(folder: string, entries: MemoryEntry[], books?: AnnualBook[]) {
  const files: ZipInput[] = [];
  const summary = {
    exportedAt: new Date().toISOString(),
    source: 'Dreamers Family Memory Book',
    note: 'Media files are exported from MediaRepository by mediaId. No second Blob copy is stored.',
    pdfExportStatus: 'reserved_interface_only',
    books: books?.map((book) => ({
      childId: book.child.id,
      childName: book.child.display_name,
      year: book.year,
      stats: book.stats
    })),
    entries: entries.map((entry) => entry.exportData)
  };

  files.push(textFile(`${folder}/年度摘要.json`, JSON.stringify(summary, null, 2)));
  files.push(textFile(`${folder}/任務完成紀錄/tasks.json`, JSON.stringify(entries.filter((entry) => entry.category === 'task').map((entry) => entry.exportData), null, 2)));
  files.push(textFile(`${folder}/撲滿紀錄/piggy.json`, JSON.stringify(entries.filter((entry) => entry.category === 'piggy').map((entry) => entry.exportData), null, 2)));
  files.push(textFile(`${folder}/商品購買紀錄/purchases.json`, JSON.stringify(entries.filter((entry) => entry.type === 'purchase').map((entry) => entry.exportData), null, 2)));
  files.push(textFile(`${folder}/願望完成/wishes.json`, JSON.stringify(entries.filter((entry) => entry.category === 'wish').map((entry) => entry.exportData), null, 2)));
  files.push(textFile(`${folder}/成長紀錄/growth.json`, JSON.stringify(entries.filter((entry) => entry.category === 'growth').map((entry) => entry.exportData), null, 2)));

  for (const media of entryMediaReferences(entries)) {
    const record = await memoryRepository.getMediaBytes(media.mediaId, `${media.mediaType}-${media.mediaId}`);
    if (!record) continue;
    files.push({ path: `${folder}/${media.folder}/${safeFileName(record.fileName)}`, data: record.data });
  }

  const zip = createZip(files);
  memoryRepository.downloadBlob(memoryRepository.createZipBlob(zip), `${folder}.zip`);
}

async function buildAnnualBookZipFiles(book: AnnualBook) {
  const root = `DreamersFamily/${book.year}/${safeFileName(book.child.display_name)}`;
  const files: ZipInput[] = [];
  const byFolder = buildAnnualEntryGroups(book.entries);
  const summary = {
    exportedAt: new Date().toISOString(),
    source: 'Dreamers Family Memory Book',
    childId: book.child.id,
    childName: book.child.display_name,
    year: book.year,
    parentNote: book.parentNote,
    stats: book.stats
  };
  [
    '分享照片',
    '分享影片',
    '分享語音',
    '任務完成',
    '撲滿紀錄',
    '商品購買',
    '願望完成',
    '成長紀錄',
    '特殊日'
  ].forEach((folder) => {
    files.push({ path: `${root}/${folder}/`, data: new Uint8Array() });
  });

  files.push({ path: `${root}/summary.pdf`, data: buildSummaryPdf(book) });
  files.push(textFile(`${root}/年度摘要.json`, JSON.stringify(summary, null, 2)));
  files.push(textFile(`${root}/任務完成/tasks.json`, JSON.stringify(byFolder.tasks.map((entry) => entry.exportData), null, 2)));
  files.push(textFile(`${root}/撲滿紀錄/piggy.json`, JSON.stringify(byFolder.piggy.map((entry) => entry.exportData), null, 2)));
  files.push(textFile(`${root}/商品購買/purchases.json`, JSON.stringify(byFolder.purchases.map((entry) => entry.exportData), null, 2)));
  files.push(textFile(`${root}/願望完成/wishes.json`, JSON.stringify(byFolder.wishes.map((entry) => entry.exportData), null, 2)));
  files.push(textFile(`${root}/成長紀錄/growth.json`, JSON.stringify(byFolder.growth.map((entry) => entry.exportData), null, 2)));
  files.push(textFile(`${root}/特殊日/special-days.json`, JSON.stringify(byFolder.specialDays.map((entry) => entry.exportData), null, 2)));

  for (const media of annualMediaReferences(book.entries)) {
    const record = await memoryRepository.getMediaBytes(media.mediaId, `${media.mediaType}-${media.mediaId}`);
    if (!record) continue;
    files.push({ path: `${root}/${media.folder}/${safeFileName(record.fileName)}`, data: record.data });
  }

  return files;
}

function buildAnnualEntryGroups(entries: MemoryEntry[]) {
  return {
    tasks: entries.filter((entry) => entry.category === 'task'),
    piggy: entries.filter((entry) => entry.category === 'piggy' && entry.type !== 'purchase'),
    purchases: entries.filter((entry) => entry.type === 'purchase'),
    wishes: entries.filter((entry) => entry.category === 'wish'),
    growth: entries.filter((entry) => entry.category === 'growth' && entry.type !== 'special-day'),
    specialDays: entries.filter((entry) => entry.type === 'special-day')
  };
}

function annualMediaReferences(entries: MemoryEntry[]) {
  const seen = new Set<string>();
  const refs: { mediaId: string; mediaType: string; folder: string }[] = [];
  const add = (mediaId: string | null | undefined, mediaType: string, folder: string) => {
    if (!mediaId || seen.has(mediaId)) return;
    seen.add(mediaId);
    refs.push({ mediaId, mediaType, folder });
  };

  entries.forEach((entry) => {
    entry.media?.forEach((media) => {
      const folder = media.media_type === 'photo' ? '分享照片' : media.media_type === 'video' ? '分享影片' : '分享語音';
      add(media.id, media.media_type, folder);
    });
    const folder = entry.category === 'task'
      ? '任務完成'
      : entry.type === 'purchase'
        ? '商品購買'
        : entry.category === 'piggy'
          ? '撲滿紀錄'
          : entry.category === 'wish'
            ? '願望完成'
            : entry.type === 'special-day'
              ? '特殊日'
              : '成長紀錄';
    add(entry.coverMediaId, 'image', folder);
  });

  return refs;
}

function entryMediaReferences(entries: MemoryEntry[]) {
  const seen = new Set<string>();
  const refs: { mediaId: string; mediaType: string; folder: string }[] = [];
  const add = (mediaId: string | null | undefined, mediaType: string, folder: string) => {
    if (!mediaId || seen.has(mediaId)) return;
    seen.add(mediaId);
    refs.push({ mediaId, mediaType, folder });
  };

  entries.forEach((entry) => {
    entry.media?.forEach((media) => {
      const folder = media.media_type === 'photo' ? '分享/照片' : media.media_type === 'video' ? '分享/影片' : '分享/語音';
      add(media.id, media.media_type, folder);
    });
    add(entry.coverMediaId, 'image', entry.category === 'task' ? '任務完成紀錄' : entry.category === 'piggy' ? '商品購買紀錄' : '願望完成');
  });

  return refs;
}

type ZipInput = {
  path: string;
  data: Uint8Array;
};

function buildSummaryPdf(book: AnnualBook) {
  const lines = [
    'DreamersFamily',
    `${book.year} 年度回憶冊`,
    `孩子：${book.child.display_name}`,
    '',
    '年度摘要',
    `分享：${book.stats.shareCount} 筆`,
    `任務完成：${book.stats.completedTasks} 筆`,
    `撲滿存款：${formatMoney(book.stats.piggySaved)}`,
    `願望完成：${book.stats.completedWishes} 個`,
    `身高：${book.stats.heightRange}`,
    `體重：${book.stats.weightRange}`,
    '',
    '年度家長備註',
    ...(book.parentNote ? wrapPdfText(book.parentNote, 24) : ['尚未填寫'])
  ];
  const content = [
    'BT',
    '/F1 13 Tf',
    '50 790 Td',
    ...lines.flatMap((line, index) => [
      index === 0 ? '' : '0 -22 Td',
      `${pdfText(line)} Tj`
    ]).filter(Boolean),
    'ET'
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${asciiBytes(content).length} >>\nstream\n${content}\nendstream`
  ];
  return buildPdfBytes(objects);
}

function buildPdfBytes(objects: string[]) {
  const parts = ['%PDF-1.4\n'];
  const offsets: number[] = [];
  let length = asciiBytes(parts[0]).length;

  objects.forEach((object, index) => {
    offsets.push(length);
    const part = `${index + 1} 0 obj\n${object}\nendobj\n`;
    parts.push(part);
    length += asciiBytes(part).length;
  });

  const xrefOffset = length;
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF'
  ].join('\n');

  return asciiBytes(`${parts.join('')}${xref}`);
}

function pdfText(value: string) {
  return `<${utf16Hex(value)}>`;
}

function utf16Hex(value: string) {
  const bytes = [0xfe, 0xff];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function wrapPdfText(value: string, maxLength: number) {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];
  return normalized.split('\n').flatMap((line) => {
    if (!line) return [''];
    const wrapped: string[] = [];
    for (let index = 0; index < line.length; index += maxLength) {
      wrapped.push(line.slice(index, index + maxLength));
    }
    return wrapped;
  });
}

function asciiBytes(value: string) {
  return new TextEncoder().encode(value);
}

function createBytesBlob(data: Uint8Array, type: string) {
  const bytes = new ArrayBuffer(data.byteLength);
  new Uint8Array(bytes).set(data);
  return new Blob([bytes], { type });
}

function textFile(path: string, text: string): ZipInput {
  return { path, data: new TextEncoder().encode(text) };
}

function createZip(files: ZipInput[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const name = new TextEncoder().encode(file.path.replace(/\\/g, '/'));
    const crc = crc32(file.data);
    const local = concatBytes(
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc),
      u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), name, file.data
    );
    const central = concatBytes(
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc),
      u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name
    );
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  });

  const central = concatBytes(...centralParts);
  const end = concatBytes(
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(0)
  );
  return concatBytes(...localParts, central, end);
}

function crc32(data: Uint8Array) {
  let crc = -1;
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function concatBytes(...chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function u16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function yearOf(value?: string | null) {
  if (!value) return 0;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : 0;
}

function rangeLabel(values: number[], unit: string) {
  if (!values.length) return '尚無紀錄';
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `${min} ${unit}` : `${min} - ${max} ${unit}`;
}

function ageAt(birthday: string | null | undefined, date: string) {
  if (!birthday) return null;
  const birth = new Date(`${birthday.slice(0, 10)}T00:00:00`);
  const target = new Date(`${date.slice(0, 10)}T00:00:00`);
  let age = target.getFullYear() - birth.getFullYear();
  const monthDiff = target.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && target.getDate() < birth.getDate())) age -= 1;
  return age;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('zh-TW').format(Math.abs(value))} 元`;
}

function formatDate(value: string) {
  return value.slice(0, 10).replace(/-/g, '/');
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'memory-book';
}

function shareTypeLabel(type: string) {
  return ({ text: '文字', photo: '照片', audio: '語音', video: '影片', mixed: '混合' } as Record<string, string>)[type] ?? type;
}

function taskCategoryLabel(type: string) {
  return ({ daily: '每日任務', habit: '習慣任務', household: '家事任務', challenge: '挑戰任務' } as Record<string, string>)[type] ?? type;
}

function specialDayTypeLabel(type: string) {
  return ({ birthday: '生日', anniversary: '紀念日', holiday: '節日', family_event: '家庭活動', other: '其他' } as Record<string, string>)[type] ?? type;
}

function mediaTypeLabel(type: LocalShareMedia['media_type']) {
  return ({ photo: '照片', audio: '語音', video: '影片' } as const)[type];
}

function mediaIcon(type: string) {
  if (type === 'video') return '▶';
  if (type === 'audio') return '🎤';
  if (type === 'photo') return '🖼';
  return '•';
}
