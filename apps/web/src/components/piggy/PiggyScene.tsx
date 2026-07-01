import type { DragEvent } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { sceneBlueprintVars } from './blueprint/layout';
import { piggyUiAssets, type CoinPileItem, type DepositRecordView, type PiggyCoinValue } from './PiggyUiAssets';

const dockCoins: PiggyCoinValue[] = [100, 50, 10, 5, 1];

export type PiggySceneShelfSlot = {
  id: string;
  name: string;
  price: string;
  imageSrc?: string;
  affordable: boolean;
  pending: boolean;
  leaving: boolean;
};

type FallingCoinView = {
  id: number;
  value: number;
};

type PiggySceneProps = {
  depositRecords: DepositRecordView[];
  incomeCount: number;
  page: number;
  totalIncomePages: number;
  currentSavings: string;
  availableToday: string;
  depositedToday: string;
  availableToDeposit: number;
  coins: CoinPileItem[];
  fallingCoin: FallingCoinView | null;
  depositBurst: FallingCoinView | null;
  shake: boolean;
  draggedCoin: number | null;
  bounceCoin: number | null;
  shelfSlots: Array<PiggySceneShelfSlot | null>;
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
};

export function PiggyScene(props: PiggySceneProps) {
  return (
    <section className="piggy-scene-page piggy-child-page" aria-label="我的撲滿" style={sceneBlueprintVars()}>
      <div className="piggy-scene-wrap">
        <main className="piggy-scene">
          <Background />
          <Desk />
          <Notebook
            records={props.depositRecords}
            incomeCount={props.incomeCount}
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
          <StickyNote
            currentSavings={props.currentSavings}
            availableToday={props.availableToday}
            depositedToday={props.depositedToday}
          />
          <Shelf
            slots={props.shelfSlots}
            onProductDragStart={props.onProductDragStart}
            onProductDragEnd={props.onProductDragEnd}
            onProductDragOver={props.onProductDragOver}
            onProductDrop={props.onProductDrop}
            onProductBuy={props.onProductBuy}
            onProductCancel={props.onProductCancel}
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
          <BottomNavigation />
        </main>
      </div>
    </section>
  );
}

function Background() {
  return <img className="piggy-scene-background-layer" src={piggyUiAssets.background.wall} alt="" aria-hidden="true" />;
}

function Desk() {
  return <img className="piggy-scene-desk-layer" src={piggyUiAssets.furniture.desk} alt="" aria-hidden="true" />;
}

function Notebook({
  records,
  incomeCount,
  page,
  totalPages,
  onPrevPage,
  onNextPage
}: {
  records: DepositRecordView[];
  incomeCount: number;
  page: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}) {
  return (
    <section className="piggy-scene-notebook-frame">
      <img className="piggy-scene-frame-image" src={piggyUiAssets.furniture.notebook} alt="" aria-hidden="true" />
      <div className="piggy-scene-notebook-content">
        <NotebookHeader incomeCount={incomeCount} />
        <DepositList records={records} />
        <Pagination page={page} totalPages={totalPages} onPrevPage={onPrevPage} onNextPage={onNextPage} />
      </div>
    </section>
  );
}

function NotebookHeader({ incomeCount }: { incomeCount: number }) {
  return (
    <header className="piggy-scene-notebook-header">
      <strong>存款紀錄</strong>
      <span>{incomeCount} 筆</span>
    </header>
  );
}

function DepositList({ records }: { records: DepositRecordView[] }) {
  if (!records.length) return <div className="piggy-scene-empty">今天還沒有收入</div>;
  return (
    <div className="piggy-scene-deposit-list">
      {records.map((record) => (
        <article key={record.id}>
          <span>
            {record.label}
            <small>{record.date}</small>
          </span>
          <strong>{record.amount}</strong>
        </article>
      ))}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPrevPage,
  onNextPage
}: {
  page: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}) {
  return (
    <footer className="piggy-scene-pagination">
      <button disabled={page === 0} onClick={onPrevPage}>
        <ArrowLeft size={14} /> 上一頁
      </button>
      <span>{page + 1}/{totalPages}</span>
      <button disabled={page >= totalPages - 1} onClick={onNextPage}>
        下一頁 <ArrowRight size={14} />
      </button>
    </footer>
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
      className={`piggy-scene-piggy-frame ${shake ? 'is-shaking' : ''}`}
      aria-label="撲滿"
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <Glass />
      <CoinCanvas coins={coins} />
      {fallingCoin ? <span key={fallingCoin.id} className="piggy-scene-falling-coin">{fallingCoin.value}</span> : null}
      {depositBurst ? <span key={depositBurst.id} className="piggy-scene-deposit-burst">+{depositBurst.value}</span> : null}
      <GlassHighlight />
    </button>
  );
}

function Glass() {
  return <img className="piggy-scene-glass" src={piggyUiAssets.furniture.piggyBank} alt="" aria-hidden="true" />;
}

function CoinCanvas({ coins }: { coins: CoinPileItem[] }) {
  return (
    <div className="piggy-scene-coin-canvas" aria-hidden="true">
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

function GlassHighlight() {
  return <span className="piggy-scene-glass-highlight" aria-hidden="true" />;
}

function StickyNote({
  currentSavings,
  availableToday,
  depositedToday
}: {
  currentSavings: string;
  availableToday: string;
  depositedToday: string;
}) {
  return (
    <section className="piggy-scene-sticky-frame">
      <img className="piggy-scene-frame-image" src={piggyUiAssets.furniture.stickyNote} alt="" aria-hidden="true" />
      <div className="piggy-scene-sticky-content">
        <CurrentBalance value={currentSavings} />
        <CanDeposit value={availableToday} />
        <TodayDeposit value={depositedToday} />
      </div>
    </section>
  );
}

function CurrentBalance({ value }: { value: string }) {
  return (
    <div className="piggy-scene-money-main">
      <small>目前存款</small>
      <strong>{value}</strong>
    </div>
  );
}

function CanDeposit({ value }: { value: string }) {
  return (
    <div className="piggy-scene-money-row">
      <span>目前可以投入</span>
      <b>{value}</b>
    </div>
  );
}

function TodayDeposit({ value }: { value: string }) {
  return (
    <div className="piggy-scene-money-row">
      <span>今天已投入</span>
      <b>{value}</b>
    </div>
  );
}

function Shelf({
  slots,
  onProductDragStart,
  onProductDragEnd,
  onProductDragOver,
  onProductDrop,
  onProductBuy,
  onProductCancel
}: {
  slots: Array<PiggySceneShelfSlot | null>;
  onProductDragStart: (productId: string, event: DragEvent<HTMLElement>) => void;
  onProductDragEnd: () => void;
  onProductDragOver: (event: DragEvent<HTMLElement>) => void;
  onProductDrop: (productId: string) => void;
  onProductBuy: (productId: string) => void;
  onProductCancel: (productId: string) => void;
}) {
  return (
    <section className="piggy-scene-shelf-frame">
      <img className="piggy-scene-frame-image" src={piggyUiAssets.furniture.shelf} alt="" aria-hidden="true" />
      <div className="piggy-scene-shelf-grid" aria-label="商品架">
        {slots.map((product, index) => (
          <div className="piggy-scene-shelf-slot" key={product?.id ?? `empty-${index}`}>
            {product ? (
              <ProductCard
                product={product}
                onDragStart={(event) => onProductDragStart(product.id, event)}
                onDragEnd={onProductDragEnd}
                onDragOver={onProductDragOver}
                onDrop={() => onProductDrop(product.id)}
                onBuy={() => onProductBuy(product.id)}
                onCancel={() => onProductCancel(product.id)}
              />
            ) : (
              <div className="piggy-scene-product-empty">等待上架</div>
            )}
          </div>
        ))}
      </div>
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
  onCancel
}: {
  product: PiggySceneShelfSlot;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: () => void;
  onBuy: () => void;
  onCancel: () => void;
}) {
  return (
    <article
      className={`piggy-scene-product-card ${product.affordable ? 'is-affordable' : ''} ${product.leaving ? 'is-leaving' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {product.imageSrc ? <img src={product.imageSrc} alt={product.name} /> : null}
      <strong>{product.name}</strong>
      <span>{product.price}</span>
      {product.pending ? (
        <button onClick={onCancel}>取消</button>
      ) : (
        <button disabled={!product.affordable} onClick={onBuy}>購買</button>
      )}
    </article>
  );
}

function Decorations() {
  return (
    <div className="piggy-scene-decorations-layer" aria-hidden="true">
      <img className="piggy-scene-deco-teddy" src={piggyUiAssets.decorations.teddy} alt="" />
      <img className="piggy-scene-deco-plant" src={piggyUiAssets.decorations.plant} alt="" />
      <img className="piggy-scene-deco-paper" src={piggyUiAssets.decorations.paper} alt="" />
      <img className="piggy-scene-deco-crayons" src={piggyUiAssets.decorations.crayons} alt="" />
      <img className="piggy-scene-deco-dinosaur" src={piggyUiAssets.decorations.dinosaur} alt="" />
      <img className="piggy-scene-deco-stars" src={piggyUiAssets.decorations.stars} alt="" />
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
    <div className={`piggy-scene-coin-dock ${disabled ? 'is-empty' : ''}`} aria-label="硬幣">
      {dockCoins.map((value) => (
        <button
          key={value}
          draggable={!disabled}
          className={`${activeValue === value ? 'is-dragging' : ''} ${bounceValue === value ? 'is-bouncing-back' : ''}`}
          onDragStart={(event) => onCoinDragStart(value, event)}
          onDragEnd={onCoinDragEnd}
          onDoubleClick={() => onCoinDoubleClick(value)}
        >
          <img src={piggyUiAssets.coins[value]} alt={`${value} 元`} />
        </button>
      ))}
    </div>
  );
}

function BottomNavigation() {
  return (
    <nav className="piggy-scene-bottom-navigation" aria-label="底部導覽">
      <span><img src={piggyUiAssets.icons.home} alt="" />首頁</span>
      <span><img src={piggyUiAssets.icons.tasks} alt="" />任務</span>
      <span><img src={piggyUiAssets.icons.share} alt="" />分享</span>
      <span className="is-active"><img src={piggyUiAssets.icons.pigHead} alt="" />撲滿</span>
      <span><img src={piggyUiAssets.icons.mail} alt="" />信箱</span>
    </nav>
  );
}
