import { useEffect, useState, type CSSProperties, type DragEvent } from 'react';
import { ArrowLeft, ArrowRight, GripVertical } from 'lucide-react';
import { piggySceneV2Vars } from './blueprint/v2Layout';
import { piggyUiAssets, type CoinPileItem, type DepositRecordView, type PiggyCoinValue } from './PiggyUiAssets';

const dockCoins: PiggyCoinValue[] = [100, 50, 10, 5, 1];

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
  onCoinDragStart: (value: PiggyCoinValue, event: DragEvent<HTMLButtonElement>) => void;
  onCoinDragEnd: () => void;
  onCoinDoubleClick: (value: PiggyCoinValue) => void;
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

  return (
    <section className="piggy-v2-page" aria-label="我的撲滿" style={sceneStyle}>
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
            onClick={props.onPiggyClick}
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
            activeValue={props.draggedCoin}
            bounceValue={props.bounceCoin}
            onCoinDragStart={props.onCoinDragStart}
            onCoinDragEnd={props.onCoinDragEnd}
            onCoinDoubleClick={props.onCoinDoubleClick}
          />
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
    return () => window.removeEventListener('resize', update);
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
        <h1>我的撲滿</h1>
        <p>拖動硬幣到撲滿存錢吧！</p>
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
    <section className="piggy-v2-notebook" aria-label="存錢紀錄">
      <div className="piggy-v2-notebook-content">
        <section className="piggy-v2-summary" aria-label="存錢摘要">
          <div className="piggy-v2-summary-card is-current">
            <span>目前存款</span>
            <strong>{currentSavings}</strong>
          </div>
          <div className="piggy-v2-summary-card is-available">
            <span>今天可存</span>
            <strong>{availableToday}</strong>
          </div>
        </section>
        <header>
          <strong>存錢紀錄</strong>
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
              <span>尚無存錢紀錄</span>
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
  onClick,
  onDragOver,
  onDrop
}: {
  coins: CoinPileItem[];
  fallingCoin: FallingCoinView | null;
  depositBurst: FallingCoinView | null;
  shake: boolean;
  onClick: () => void;
  onDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`piggy-v2-bank ${shake ? 'is-shaking' : ''}`}
      aria-label="撲滿"
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <img className="piggy-v2-bank-glass" src={piggyUiAssets.furniture.piggyBank} alt="" aria-hidden="true" />
      <CoinCanvas coins={coins} />
      {fallingCoin ? <span key={fallingCoin.id} className="piggy-v2-falling-coin">{fallingCoin.value}</span> : null}
      {depositBurst ? <span key={depositBurst.id} className="piggy-v2-deposit-burst">+{depositBurst.value}</span> : null}
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
      <div className="piggy-v2-shelf-grid" aria-label="商品列表">
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
                <button type="button" className="piggy-v2-product-empty is-add" onClick={onOpenProductPicker}>新增商品</button>
              ) : (
                <div className="piggy-v2-product-empty">空位</div>
              )
            )}
          </div>
        ))}
      </div>
      {isArranging && hiddenProductCount > 0 ? (
        <button type="button" className="piggy-v2-hidden-products" onClick={onOpenProductPicker}>
          還有 {hiddenProductCount} 個商品可顯示
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
        <button disabled className="piggy-v2-product-waiting">等待購買</button>
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

function CoinDock({
  disabled,
  activeValue,
  bounceValue,
  onCoinDragStart,
  onCoinDragEnd,
  onCoinDoubleClick
}: {
  disabled: boolean;
  activeValue: number | null;
  bounceValue: number | null;
  onCoinDragStart: (value: PiggyCoinValue, event: DragEvent<HTMLButtonElement>) => void;
  onCoinDragEnd: () => void;
  onCoinDoubleClick: (value: PiggyCoinValue) => void;
}) {
  return (
    <div className={`piggy-v2-coin-dock ${disabled ? 'is-empty' : ''}`} aria-label="硬幣列">
      {dockCoins.map((value) => (
        <button
          key={value}
          draggable={!disabled}
          className={`${activeValue === value ? 'is-dragging' : ''} ${bounceValue === value ? 'is-bouncing-back' : ''}`}
          onDragStart={(event) => onCoinDragStart(value, event)}
          onDragEnd={onCoinDragEnd}
          onDoubleClick={() => onCoinDoubleClick(value)}
        >
          <img src={piggyUiAssets.coins[value]} alt={`${value} 元硬幣`} />
        </button>
      ))}
    </div>
  );
}
