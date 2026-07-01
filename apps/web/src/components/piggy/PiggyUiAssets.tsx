import type { DragEvent, ReactNode } from 'react';

const assetRoot = '/design-assets/piggy-ui';

export const piggyUiAssets = {
  layers: {
    background: `${assetRoot}/layers/background-layer.png`,
    desk: `${assetRoot}/layers/desk-layer.png`,
    notebook: `${assetRoot}/layers/notebook-layer.png`,
    piggyBank: `${assetRoot}/layers/piggy-bank-layer.png`,
    stickyNote: `${assetRoot}/layers/sticky-note-layer.png`,
    shelf: `${assetRoot}/layers/shelf-layer.png`
  },
  background: {
    wall: `${assetRoot}/background/wall-background.png`
  },
  furniture: {
    piggyBank: `${assetRoot}/furniture/piggy-bank.png`,
    desk: `${assetRoot}/furniture/desk.png`,
    notebook: `${assetRoot}/furniture/notebook.png`,
    stickyNote: `${assetRoot}/furniture/sticky-note.png`,
    shelf: `${assetRoot}/furniture/shelf.png`
  },
  decorations: {
    teddy: `${assetRoot}/decorations/teddy.png`,
    plant: `${assetRoot}/decorations/plant.png`,
    dinosaur: `${assetRoot}/decorations/dinosaur.png`,
    crayons: `${assetRoot}/decorations/crayons.png`,
    paper: `${assetRoot}/decorations/paper.png`,
    stars: `${assetRoot}/decorations/stars.png`
  },
  coins: {
    100: `${assetRoot}/coins/coin-100.png`,
    50: `${assetRoot}/coins/coin-50.png`,
    10: `${assetRoot}/coins/coin-10.png`,
    5: `${assetRoot}/coins/coin-5.png`,
    1: `${assetRoot}/coins/coin-1.png`
  },
  products: {
    bear: `${assetRoot}/products/bear.png`,
    lego: `${assetRoot}/products/lego.png`,
    car: `${assetRoot}/products/car.png`,
    bag: `${assetRoot}/products/bag.png`,
    book: `${assetRoot}/products/book.png`,
    soccer: `${assetRoot}/products/soccer.png`
  },
  icons: {
    pigHead: `${assetRoot}/icons/pig-head.png`,
    star: `${assetRoot}/icons/star.png`,
    saving: `${assetRoot}/icons/saving.png`,
    purchase: `${assetRoot}/icons/purchase.png`,
    home: `${assetRoot}/icons/tab-home.png`,
    tasks: `${assetRoot}/icons/tab-tasks.png`,
    share: `${assetRoot}/icons/tab-share.png`,
    mail: `${assetRoot}/icons/tab-mail.png`
  }
} as const;

export type PiggyCoinValue = 100 | 50 | 10 | 5 | 1;

export type DepositRecordView = {
  id: string;
  label: string;
  amount: string;
  date?: string;
};

export type ProductCardView = {
  id: string;
  imageSrc?: string;
  name: string;
  price: string;
  affordable?: boolean;
  pending?: boolean;
};

export type CoinPileItem = {
  id: string;
  value: PiggyCoinValue;
  left: number;
  bottom: number;
  rotate: number;
  scale: number;
  zIndex: number;
};

type AssetShellProps = {
  className?: string;
  children?: ReactNode;
};

export function Background({ className = '', children }: AssetShellProps) {
  return (
    <section className={`piggy-ui-background ${className}`}>
      <img src={piggyUiAssets.background.wall} alt="" aria-hidden="true" />
      {children}
    </section>
  );
}

export function Desk({ className = '', children }: AssetShellProps) {
  return (
    <div className={`piggy-ui-desk ${className}`}>
      <img src={piggyUiAssets.furniture.desk} alt="" aria-hidden="true" />
      {children}
    </div>
  );
}

export function Notebook({ className = '', children }: AssetShellProps) {
  return (
    <section className={`piggy-ui-notebook ${className}`}>
      <img src={piggyUiAssets.furniture.notebook} alt="" aria-hidden="true" />
      <div>{children}</div>
    </section>
  );
}

export function DepositList({ records }: { records: DepositRecordView[] }) {
  return (
    <div className="piggy-ui-deposit-list">
      {records.map((record) => (
        <article key={record.id}>
          <span>{record.label}<small>{record.date}</small></span>
          <strong>{record.amount}</strong>
        </article>
      ))}
    </div>
  );
}

export function PiggyBank({
  className = '',
  children,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop
}: AssetShellProps & {
  onClick?: () => void;
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`piggy-ui-bank ${className}`}
      aria-label="撲滿"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <img src={piggyUiAssets.furniture.piggyBank} alt="" aria-hidden="true" />
      {children}
    </button>
  );
}

export function CoinPile({ coins }: { coins: CoinPileItem[] }) {
  return (
    <div className="piggy-ui-coin-pile">
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

export function StickyNote({ className = '', children }: AssetShellProps) {
  return (
    <section className={`piggy-ui-sticky-note ${className}`}>
      <img src={piggyUiAssets.furniture.stickyNote} alt="" aria-hidden="true" />
      <div>{children}</div>
    </section>
  );
}

export function Shelf({ className = '', children }: AssetShellProps) {
  return (
    <section className={`piggy-ui-shelf ${className}`}>
      <img src={piggyUiAssets.furniture.shelf} alt="" aria-hidden="true" />
      <div>{children}</div>
    </section>
  );
}

export function ProductCard({
  product,
  className = '',
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onBuy,
  onCancel
}: {
  product?: ProductCardView;
  className?: string;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: () => void;
  onBuy?: () => void;
  onCancel?: () => void;
}) {
  if (!product) return <article className={`piggy-ui-product-card is-empty ${className}`}>等待上架</article>;
  return (
    <article
      className={`piggy-ui-product-card ${product.affordable ? 'is-affordable' : ''} ${className}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {product.imageSrc ? <img src={product.imageSrc} alt={product.name} /> : null}
      <strong>{product.name}</strong>
      <span>{product.price}</span>
      {product.pending ? <button onClick={onCancel}>取消</button> : <button disabled={!product.affordable} onClick={onBuy}>購買</button>}
    </article>
  );
}

export function Decorations({ className = '' }: { className?: string }) {
  return (
    <div className={`piggy-ui-decorations ${className}`} aria-hidden="true">
      <img className="piggy-ui-deco-teddy" src={piggyUiAssets.decorations.teddy} alt="" />
      <img className="piggy-ui-deco-plant" src={piggyUiAssets.decorations.plant} alt="" />
      <img className="piggy-ui-deco-paper" src={piggyUiAssets.decorations.paper} alt="" />
      <img className="piggy-ui-deco-crayons" src={piggyUiAssets.decorations.crayons} alt="" />
      <img className="piggy-ui-deco-dinosaur" src={piggyUiAssets.decorations.dinosaur} alt="" />
      <img className="piggy-ui-deco-stars" src={piggyUiAssets.decorations.stars} alt="" />
    </div>
  );
}

export function CoinDock({
  disabled,
  activeValue,
  bounceValue,
  onCoinDragStart,
  onCoinDragEnd,
  onCoinDoubleClick
}: {
  disabled?: boolean;
  activeValue?: number | null;
  bounceValue?: number | null;
  onCoinDragStart?: (value: PiggyCoinValue, event: DragEvent<HTMLButtonElement>) => void;
  onCoinDragEnd?: () => void;
  onCoinDoubleClick?: (value: PiggyCoinValue) => void;
}) {
  const values = [100, 50, 10, 5, 1] as const;
  return (
    <div className={`piggy-ui-coin-dock ${disabled ? 'is-empty' : ''}`}>
      {values.map((value) => (
        <button
          key={value}
          draggable={!disabled}
          className={`${activeValue === value ? 'is-dragging' : ''} ${bounceValue === value ? 'is-bouncing-back' : ''}`}
          onDragStart={(event) => onCoinDragStart?.(value, event)}
          onDragEnd={onCoinDragEnd}
          onDoubleClick={() => onCoinDoubleClick?.(value)}
        >
          <img src={piggyUiAssets.coins[value]} alt={`${value} 元`} />
        </button>
      ))}
    </div>
  );
}

export function BottomNavigation({ className = '' }: { className?: string }) {
  return (
    <nav className={`piggy-ui-bottom-navigation ${className}`} aria-label="孩子端導覽">
      <span><img src={piggyUiAssets.icons.home} alt="" />我的家</span>
      <span><img src={piggyUiAssets.icons.tasks} alt="" />任務</span>
      <span><img src={piggyUiAssets.icons.share} alt="" />分享</span>
      <span className="is-active"><img src={piggyUiAssets.icons.pigHead} alt="" />撲滿</span>
      <span><img src={piggyUiAssets.icons.mail} alt="" />信箱</span>
    </nav>
  );
}
