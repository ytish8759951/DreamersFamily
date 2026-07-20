import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, GripVertical } from 'lucide-react';
import { piggySceneV2Vars } from './blueprint/v2Layout';
import { piggyUiAssets, type CoinPileItem, type DepositRecordView, type PiggyCoinValue } from './PiggyUiAssets';

const dockCoins: PiggyCoinValue[] = [100, 50, 10, 5, 1];
export const PIGGY_DRAG_SCROLL_LOCK_CLASS = 'piggy-v2-scroll-locked';
const TAP_DEPOSIT_WINDOW_MS = 440;
const TAP_MOVE_TOLERANCE_PX = 10;

export type PiggySceneV2ShelfSlot = {
  id: string;
  name: string;
  price: string;
  imageSrc?: string;
  status: 'available' | 'pendingPurchase' | 'arrived';
  affordable: boolean;
  leaving: boolean;
};

type FallingCoinView = {
  id: number;
  value: number;
};

type CoinPointerDrag = {
  value: PiggyCoinValue;
  pointerId: number;
  sourceElement: HTMLButtonElement | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  originX: number;
  originY: number;
  size: number;
  moved: boolean;
  returning: boolean;
};

type PiggySceneV2Props = {
  depositRecords: DepositRecordView[];
  incomeCount: number;
  page: number;
  totalIncomePages: number;
  currentSavings: string;
  availableToday: string;
  availableToDeposit: number;
  coins: CoinPileItem[];
  fallingCoin: FallingCoinView | null;
  depositBurst: FallingCoinView | null;
  shake: boolean;
  draggedCoin: number | null;
  bounceCoin: number | null;
  shelfSlots: Array<PiggySceneV2ShelfSlot | null>;
  isArranging: boolean;
  hiddenProductCount: number;
  arrangeNotice: string;
  onArrangeProducts: () => void;
  onOpenProductPicker: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPiggyClick: () => void;
  onPiggyDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  onPiggyDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onCoinDragEnd: () => void;
  onCoinPointerDeposit: (value: PiggyCoinValue) => boolean;
  onProductDragStart: (productId: string, event: DragEvent<HTMLElement>) => void;
  onProductDragEnd: () => void;
  onProductDragOver: (event: DragEvent<HTMLElement>) => void;
  onProductDrop: (productId: string) => void;
  onProductBuy: (productId: string) => void;
  onProductCancel: (productId: string) => void;
  onProductRemove: (productId: string) => void;
};

export function PiggySceneV2(props: PiggySceneV2Props) {
  const sceneScale = useSceneScale();
  const sceneStyle = { ...piggySceneV2Vars(), '--piggy-v2-scale': sceneScale } as CSSProperties;
  const depositSlotRef = useRef<HTMLSpanElement>(null);
  const unlockScrollRef = useRef<(() => void) | null>(null);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPointRef = useRef<{ x: number; y: number; moved: boolean; overDeposit: boolean } | null>(null);
  const pointerDragRef = useRef<CoinPointerDrag | null>(null);
  const ignoredLostPointerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ value: PiggyCoinValue; at: number } | null>(null);
  const [pointerDrag, setPointerDrag] = useState<CoinPointerDrag | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<PiggyCoinValue | null>(null);
  const [isOverDeposit, setIsOverDeposit] = useState(false);

  const setPointerDragState = (next: CoinPointerDrag | null | ((current: CoinPointerDrag | null) => CoinPointerDrag | null)) => {
    setPointerDrag((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      pointerDragRef.current = resolved;
      return resolved;
    });
  };

  const cleanupPointerDrag = (current: CoinPointerDrag) => {
    ignoredLostPointerRef.current = current.pointerId;
    cleanupActiveDrag(current);
    unlockScrollRef.current?.();
    unlockScrollRef.current = null;
    pendingPointRef.current = null;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  useEffect(() => {
    const cancelActiveDrag = () => {
      const current = pointerDragRef.current;
      if (!current) return;
      cleanupPointerDrag(current);
      setPointerDragState(null);
      setIsOverDeposit(false);
    };
    const cancelActiveDragWhenHidden = () => {
      if (document.visibilityState !== 'visible') cancelActiveDrag();
    };
    window.addEventListener('blur', cancelActiveDrag);
    window.addEventListener('pagehide', cancelActiveDrag);
    document.addEventListener('visibilitychange', cancelActiveDragWhenHidden);
    return () => {
      window.removeEventListener('blur', cancelActiveDrag);
      window.removeEventListener('pagehide', cancelActiveDrag);
      document.removeEventListener('visibilitychange', cancelActiveDragWhenHidden);
      cancelActiveDrag();
      if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const bounceCoinBack = (current: CoinPointerDrag) => {
    setIsOverDeposit(false);
    setPointerDragState({ ...current, x: current.originX, y: current.originY, returning: true });
    returnTimerRef.current = window.setTimeout(() => {
      cleanupActiveDrag(current);
      setPointerDragState(null);
    }, 220);
  };

  const beginCoinPointerDrag = (value: PiggyCoinValue, event: PointerEvent<HTMLButtonElement>) => {
    if (props.availableToDeposit <= 0 || event.button > 0) return;
    event.preventDefault();
    if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
    const previous = pointerDragRef.current;
    if (previous) cleanupPointerDrag(previous);
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    pendingPointRef.current = null;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    unlockScrollRef.current?.();
    unlockScrollRef.current = lockPiggyDragScroll();
    props.onCoinDragEnd();
    setSelectedCoin(value);
    setIsOverDeposit(false);
    setPointerDragState({
      value,
      pointerId: event.pointerId,
      sourceElement: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      originX: rect.left + rect.width / 2,
      originY: rect.top + rect.height / 2,
      size: Math.max(rect.width, rect.height),
      moved: false,
      returning: false
    });
  };

  const moveCoinPointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = pointerDragRef.current;
    if (!current || current.pointerId !== event.pointerId || current.returning) return;
    event.preventDefault();
    pendingPointRef.current = {
      x: event.clientX,
      y: event.clientY,
      moved:
        current.moved ||
        Math.abs(event.clientX - current.startX) > TAP_MOVE_TOLERANCE_PX ||
        Math.abs(event.clientY - current.startY) > TAP_MOVE_TOLERANCE_PX,
      overDeposit: isPointerDepositHit(depositSlotRef.current, event.clientX, event.clientY)
    };
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingPointRef.current;
      pendingPointRef.current = null;
      if (!pending) return;
      setIsOverDeposit(pending.overDeposit);
      setPointerDragState((active) => active && !active.returning ? { ...active, x: pending.x, y: pending.y, moved: pending.moved } : active);
    });
  };

  const finishCoinPointerDrag = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    if (cancelled && ignoredLostPointerRef.current === event.pointerId) {
      ignoredLostPointerRef.current = null;
      return;
    }
    const current = pointerDragRef.current;
    if (!current || current.pointerId !== event.pointerId || current.returning) return;
    event.preventDefault();
    cleanupPointerDrag(current);
    const overDeposit = !cancelled && isPointerDepositHit(depositSlotRef.current, event.clientX, event.clientY);
    const isTap = !current.moved && !cancelled;
    const now = Date.now();
    const isDoubleTap =
      isTap &&
      lastTapRef.current?.value === current.value &&
      now - lastTapRef.current.at <= TAP_DEPOSIT_WINDOW_MS;

    if (overDeposit || isDoubleTap) {
      const deposited = props.onCoinPointerDeposit(current.value);
      setSelectedCoin(null);
      setIsOverDeposit(false);
      setPointerDragState(null);
      lastTapRef.current = null;
      if (!deposited) bounceCoinBack(current);
      return;
    }

    if (isTap) {
      lastTapRef.current = { value: current.value, at: now };
      setSelectedCoin(current.value);
      setPointerDragState(null);
      setIsOverDeposit(false);
      return;
    }

    bounceCoinBack(current);
  };

  const depositSelectedCoin = () => {
    if (selectedCoin === null || props.availableToDeposit <= 0) {
      props.onPiggyClick();
      return;
    }
    if (props.onCoinPointerDeposit(selectedCoin)) {
      setSelectedCoin(null);
      lastTapRef.current = null;
    }
  };

  return (
    <section
      className={`piggy-v2-page ${pointerDrag ? 'is-coin-dragging' : ''} ${isOverDeposit ? 'is-coin-over-deposit' : ''} ${selectedCoin !== null ? 'has-selected-coin' : ''}`}
      aria-label="撲滿"
      style={sceneStyle}
    >
      <div className="piggy-v2-wrap">
        <main className="piggy-v2-scene">
          <Background />
          <SceneTitle />
          <Desk />
          <Notebook
            records={props.depositRecords}
            incomeCount={props.incomeCount}
            currentSavings={props.currentSavings}
            availableToday={props.availableToday}
            page={props.page}
            totalPages={props.totalIncomePages}
            onPrevPage={props.onPrevPage}
            onNextPage={props.onNextPage}
          />
          <PiggyBank
            coins={props.coins}
            fallingCoin={props.fallingCoin}
            depositBurst={props.depositBurst}
            shake={props.shake}
            isDropTarget={isOverDeposit || selectedCoin !== null}
            depositSlotRef={depositSlotRef}
            onClick={depositSelectedCoin}
            onDragOver={props.onPiggyDragOver}
            onDrop={props.onPiggyDrop}
          />
          <Shelf
            slots={props.shelfSlots}
            isArranging={props.isArranging}
            hiddenProductCount={props.hiddenProductCount}
            arrangeNotice={props.arrangeNotice}
            onArrangeProducts={props.onArrangeProducts}
            onOpenProductPicker={props.onOpenProductPicker}
            onProductDragStart={props.onProductDragStart}
            onProductDragEnd={props.onProductDragEnd}
            onProductDragOver={props.onProductDragOver}
            onProductDrop={props.onProductDrop}
            onProductBuy={props.onProductBuy}
            onProductCancel={props.onProductCancel}
            onProductRemove={props.onProductRemove}
          />
          <Decorations />
          <CoinDock
            disabled={props.availableToDeposit <= 0}
            activeValue={selectedCoin ?? props.draggedCoin}
            draggingValue={pointerDrag?.value ?? null}
            bounceValue={props.bounceCoin}
            onCoinDragEnd={props.onCoinDragEnd}
            onCoinPointerDown={beginCoinPointerDrag}
            onCoinPointerMove={moveCoinPointerDrag}
            onCoinPointerUp={(event) => finishCoinPointerDrag(event)}
            onCoinPointerCancel={(event) => finishCoinPointerDrag(event, true)}
            onCoinLostPointerCapture={(event) => finishCoinPointerDrag(event, true)}
          />
          <CoinDragOverlay drag={pointerDrag} />
        </main>
      </div>
    </section>
  );
}

function useSceneScale() {
  const calculateScale = () => {
    if (typeof window === 'undefined') return 0.92;
    return Math.min((window.innerWidth - 88) / 1440, (window.innerHeight - 18) / 1024, 0.92);
  };
  const [scale, setScale] = useState(calculateScale);

  useEffect(() => {
    const update = () => setScale(calculateScale());
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  return Number(Math.max(0.42, scale).toFixed(4));
}

function Background() {
  return <img className="piggy-v2-bg" src={piggyUiAssets.background.wall} alt="" aria-hidden="true" />;
}

function SceneTitle() {
  return (
    <header className="piggy-v2-title">
      <img src={piggyUiAssets.icons.pigHead} alt="" aria-hidden="true" />
      <div>
        <h1>撲滿</h1>
        <p>拖曳硬幣到撲滿，或點兩下硬幣投入。</p>
      </div>
    </header>
  );
}

function Desk() {
  return <img className="piggy-v2-desk" src={piggyUiAssets.furniture.desk} alt="" aria-hidden="true" />;
}

function Notebook({
  records,
  incomeCount,
  currentSavings,
  availableToday,
  page,
  totalPages,
  onPrevPage,
  onNextPage
}: {
  records: DepositRecordView[];
  incomeCount: number;
  currentSavings: string;
  availableToday: string;
  page: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}) {
  const rows = records.slice(0, 5);

  return (
    <section className="piggy-v2-notebook" aria-label="撲滿紀錄">
      <div className="piggy-v2-notebook-content">
        <section className="piggy-v2-summary" aria-label="撲滿摘要">
          <div className="piggy-v2-summary-card is-current">
            <span>目前存款</span>
            <strong>{currentSavings}</strong>
          </div>
          <div className="piggy-v2-summary-card is-available">
            <span>今天可投入</span>
            <strong>{availableToday}</strong>
          </div>
        </section>
        <header>
          <strong>收入紀錄</strong>
          <span>{incomeCount} 筆</span>
        </header>
        <div className="piggy-v2-deposit-list">
          {rows.length ? (
            rows.map((record) => (
              <article key={record.id}>
                <time>{record.date?.slice(0, 5) ?? '--/--'}</time>
                <span>{record.label}</span>
                <b className={record.amount.trim().startsWith('-') ? 'is-negative' : ''}>{record.amount}</b>
              </article>
            ))
          ) : (
            <article className="is-empty">
              <span>還沒有收入紀錄</span>
            </article>
          )}
        </div>
        <footer>
          <button disabled={page === 0} onClick={onPrevPage} aria-label="上一頁">
            <ArrowLeft size={14} />
            <span>上一頁</span>
          </button>
          <em>{page + 1}/{totalPages}</em>
          <button disabled={page >= totalPages - 1} onClick={onNextPage} aria-label="下一頁">
            <span>下一頁</span>
            <ArrowRight size={14} />
          </button>
        </footer>
      </div>
    </section>
  );
}

function PiggyBank({
  coins,
  fallingCoin,
  depositBurst,
  shake,
  isDropTarget,
  depositSlotRef,
  onClick,
  onDragOver,
  onDrop
}: {
  coins: CoinPileItem[];
  fallingCoin: FallingCoinView | null;
  depositBurst: FallingCoinView | null;
  shake: boolean;
  isDropTarget: boolean;
  depositSlotRef: RefObject<HTMLSpanElement | null>;
  onClick: () => void;
  onDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`piggy-v2-bank ${shake ? 'is-shaking' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
      aria-label="撲滿投入口"
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <img className="piggy-v2-bank-glass" src={piggyUiAssets.furniture.piggyBank} alt="" aria-hidden="true" />
      <CoinCanvas coins={coins} />
      {fallingCoin ? <span key={fallingCoin.id} className="piggy-v2-falling-coin">{fallingCoin.value}</span> : null}
      {depositBurst ? <span key={depositBurst.id} className="piggy-v2-deposit-burst">+{depositBurst.value}</span> : null}
      <span ref={depositSlotRef} className="piggy-v2-deposit-slot" aria-hidden="true" />
      <i aria-hidden="true" />
    </button>
  );
}

function CoinCanvas({ coins }: { coins: CoinPileItem[] }) {
  return (
    <div className="piggy-v2-coin-canvas" aria-hidden="true">
      {coins.map((coin) => (
        <img
          key={coin.id}
          src={piggyUiAssets.coins[coin.value]}
          alt=""
          style={{
            left: `${coin.left}%`,
            bottom: `${coin.bottom}%`,
            transform: `rotate(${coin.rotate}deg) scale(${coin.scale})`,
            zIndex: coin.zIndex
          }}
        />
      ))}
    </div>
  );
}

function Shelf({
  slots,
  isArranging,
  hiddenProductCount,
  arrangeNotice,
  onArrangeProducts,
  onOpenProductPicker,
  onProductDragStart,
  onProductDragEnd,
  onProductDragOver,
  onProductDrop,
  onProductBuy,
  onProductCancel,
  onProductRemove
}: {
  slots: Array<PiggySceneV2ShelfSlot | null>;
  isArranging: boolean;
  hiddenProductCount: number;
  arrangeNotice: string;
  onArrangeProducts: () => void;
  onOpenProductPicker: () => void;
  onProductDragStart: (productId: string, event: DragEvent<HTMLElement>) => void;
  onProductDragEnd: () => void;
  onProductDragOver: (event: DragEvent<HTMLElement>) => void;
  onProductDrop: (productId: string) => void;
  onProductBuy: (productId: string) => void;
  onProductCancel: (productId: string) => void;
  onProductRemove: (productId: string) => void;
}) {
  return (
    <section className={`piggy-v2-shelf ${isArranging ? 'is-arranging' : ''}`} aria-label="商品架">
      <header className="piggy-v2-shelf-header">
        <h2>商品架</h2>
        <button type="button" onClick={onArrangeProducts}>{isArranging ? '完成' : '整理'}</button>
      </header>
      <div className="piggy-v2-shelf-grid" aria-label="展示商品">
        {slots.map((product, index) => (
          <div className="piggy-v2-shelf-slot" key={product?.id ?? `empty-${index}`}>
            {product ? (
              <ProductCard
                product={product}
                onDragStart={(event) => onProductDragStart(product.id, event)}
                onDragEnd={onProductDragEnd}
                onDragOver={onProductDragOver}
                onDrop={() => onProductDrop(product.id)}
                onBuy={() => onProductBuy(product.id)}
                onCancel={() => onProductCancel(product.id)}
                onRemove={() => onProductRemove(product.id)}
                isArranging={isArranging}
              />
            ) : (
              isArranging ? (
                <button type="button" className="piggy-v2-product-empty is-add" onClick={onOpenProductPicker}>加入商品</button>
              ) : (
                <div className="piggy-v2-product-empty">空位</div>
              )
            )}
          </div>
        ))}
      </div>
      {isArranging && hiddenProductCount > 0 ? (
        <button type="button" className="piggy-v2-hidden-products" onClick={onOpenProductPicker}>
          還有 {hiddenProductCount} 個商品可展示
        </button>
      ) : null}
      {arrangeNotice ? <p className="piggy-v2-arrange-notice">{arrangeNotice}</p> : null}
    </section>
  );
}

function ProductCard({
  product,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onBuy,
  onCancel,
  onRemove,
  isArranging
}: {
  product: PiggySceneV2ShelfSlot;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: () => void;
  onBuy: () => void;
  onCancel: () => void;
  onRemove: () => void;
  isArranging: boolean;
}) {
  if (product.status === 'pendingPurchase') {
    return (
      <article className={`piggy-v2-product-card is-purchased ${isArranging ? 'is-arranging' : ''} ${product.leaving ? 'is-leaving' : ''}`} draggable={false}>
        {isArranging ? <button type="button" className="piggy-v2-product-remove" onClick={onRemove}>移除</button> : null}
        {isArranging ? <span className="piggy-v2-product-handle" aria-hidden="true"><GripVertical size={16} /></span> : null}
        {product.imageSrc ? <img src={product.imageSrc} alt={product.name} /> : <div className="piggy-v2-product-image-empty">尚未上傳圖片</div>}
        <strong className={!product.name.trim() ? 'is-empty-name' : ''}>{product.name}</strong>
        <span>{product.price}</span>
        <button disabled className="piggy-v2-product-waiting">等待到貨</button>
      </article>
    );
  }

  return (
    <article
      className={`piggy-v2-product-card ${product.affordable ? 'is-affordable' : ''} ${isArranging ? 'is-arranging' : ''} ${product.leaving ? 'is-leaving' : ''}`}
      draggable={isArranging}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isArranging ? <button type="button" className="piggy-v2-product-remove" onClick={onRemove}>移除</button> : null}
      {isArranging ? <span className="piggy-v2-product-handle" aria-hidden="true"><GripVertical size={16} /></span> : null}
      {product.status === 'arrived' && !isArranging ? (
        <button type="button" className="piggy-v2-arrived-badge" onClick={onBuy} aria-label={`${product.name || '商品'} 已到貨`}>
          <span aria-hidden="true">✓</span>
          已到貨
        </button>
      ) : null}
      {product.imageSrc ? <img src={product.imageSrc} alt={product.name} /> : <div className="piggy-v2-product-image-empty">尚未上傳圖片</div>}
      <strong className={!product.name.trim() ? 'is-empty-name' : ''}>{product.name}</strong>
      <span>{product.price}</span>
      <button disabled={isArranging || (product.status === 'available' && !product.affordable)} onClick={onBuy}>
        {product.status === 'arrived' ? '已到貨' : product.affordable ? '購買' : '存款不足'}
      </button>
    </article>
  );
}

function Decorations() {
  return (
    <div className="piggy-v2-decorations" aria-hidden="true">
      <img className="piggy-v2-deco-teddy" src={piggyUiAssets.decorations.teddy} alt="" />
      <img className="piggy-v2-deco-plant" src={piggyUiAssets.decorations.plant} alt="" />
      <img className="piggy-v2-deco-paper" src={piggyUiAssets.decorations.paper} alt="" />
      <img className="piggy-v2-deco-crayons" src={piggyUiAssets.decorations.crayons} alt="" />
      <img className="piggy-v2-deco-dinosaur" src={piggyUiAssets.decorations.dinosaur} alt="" />
      <img className="piggy-v2-deco-stars" src={piggyUiAssets.decorations.stars} alt="" />
    </div>
  );
}

function CoinDragOverlay({ drag }: { drag: CoinPointerDrag | null }) {
  if (!drag || typeof document === 'undefined') return null;
  return createPortal(
    <img
      className={`piggy-v2-floating-coin ${drag.returning ? 'is-returning' : ''}`}
      src={piggyUiAssets.coins[drag.value]}
      alt=""
      aria-hidden="true"
      style={{
        width: drag.size,
        height: drag.size,
        transform: `translate3d(${drag.x}px, ${drag.y}px, 0) translate(-50%, -50%) scale(${drag.returning ? 0.98 : 1.08})`
      }}
    />,
    document.body
  );
}

function cleanupActiveDrag(current: CoinPointerDrag) {
  try {
    current.sourceElement?.releasePointerCapture?.(current.pointerId);
  } catch {
    // Pointer capture may already be released after cancel/lostpointercapture.
  }
}

function CoinDock({
  disabled,
  activeValue,
  draggingValue,
  bounceValue,
  onCoinDragEnd,
  onCoinPointerDown,
  onCoinPointerMove,
  onCoinPointerUp,
  onCoinPointerCancel,
  onCoinLostPointerCapture
}: {
  disabled: boolean;
  activeValue: number | null;
  draggingValue: number | null;
  bounceValue: number | null;
  onCoinDragEnd: () => void;
  onCoinPointerDown: (value: PiggyCoinValue, event: PointerEvent<HTMLButtonElement>) => void;
  onCoinPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onCoinPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onCoinPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  onCoinLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className={`piggy-v2-coin-dock ${disabled ? 'is-empty' : ''}`} aria-label="硬幣列">
      {dockCoins.map((value) => (
        <button
          key={value}
          type="button"
          draggable={false}
          aria-label={`${value} 元硬幣，拖到撲滿或點兩下投入`}
          className={`${activeValue === value ? 'is-dragging' : ''} ${draggingValue === value ? 'is-source-hidden' : ''} ${bounceValue === value ? 'is-bouncing-back' : ''}`}
          onPointerDown={(event) => onCoinPointerDown(value, event)}
          onPointerMove={onCoinPointerMove}
          onPointerUp={onCoinPointerUp}
          onPointerCancel={onCoinPointerCancel}
          onLostPointerCapture={onCoinLostPointerCapture}
          onDragStart={(event) => {
            event.preventDefault();
            onCoinDragEnd();
          }}
          onDragEnd={onCoinDragEnd}
        >
          <img src={piggyUiAssets.coins[value]} alt={`${value} 元硬幣`} />
        </button>
      ))}
      <p className="piggy-v2-coin-hint">拖動硬幣到撲滿裡存錢吧！</p>
    </div>
  );
}

export function isPointInsideRect(rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>, x: number, y: number) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function isPointerDepositHit(element: HTMLElement | null, x: number, y: number) {
  if (!element) return false;
  return isPointInsideRect(element.getBoundingClientRect(), x, y);
}

function lockPiggyDragScroll() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const { documentElement, body } = document;
  const previousBodyStyle = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    touchAction: body.style.touchAction,
    overscrollBehavior: body.style.overscrollBehavior
  };
  const previousHtmlStyle = {
    overscrollBehavior: documentElement.style.overscrollBehavior,
    touchAction: documentElement.style.touchAction
  };

  documentElement.classList.add(PIGGY_DRAG_SCROLL_LOCK_CLASS);
  body.classList.add(PIGGY_DRAG_SCROLL_LOCK_CLASS);
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = `-${scrollX}px`;
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  body.style.touchAction = 'none';
  body.style.overscrollBehavior = 'none';
  documentElement.style.touchAction = 'none';
  documentElement.style.overscrollBehavior = 'none';

  return () => {
    body.classList.remove(PIGGY_DRAG_SCROLL_LOCK_CLASS);
    documentElement.classList.remove(PIGGY_DRAG_SCROLL_LOCK_CLASS);
    Object.assign(body.style, previousBodyStyle);
    Object.assign(documentElement.style, previousHtmlStyle);
    window.scrollTo(scrollX, scrollY);
  };
}
