import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Upload } from 'lucide-react';
import { PiggySceneV2, type PiggySceneV2ShelfSlot } from '../components/piggy/PiggySceneV2';
import type { PiggyCoinValue } from '../components/piggy/PiggyUiAssets';
import { dataModeBadgeLabel } from '../lib/dataRepository';
import { resolveCurrentChildId } from '../lib/childSession';
import { captureSelectedFiles } from '../lib/fileInput';
import {
  ImageUploadPipelineError,
  getImageFileValidationError,
  logImageUploadDiagnostics,
  prepareImageFileForUpload
} from '../lib/imageUploadPipeline';
import { piggyRepository } from '../lib/piggyRepository';
import { purchaseRepository } from '../lib/purchaseRepository';
import type { LocalDatabaseState, LocalPiggyBankLog, LocalPiggyProduct, LocalPiggyPurchase } from '../lib/localTypes';
import { useSubmitLock } from '../lib/useSubmitLock';
import { useLocalDataState } from '../lib/useLocalData';

const coinValues: PiggyCoinValue[] = [100, 50, 10, 5, 1];
const shelfSlots = [0, 1, 2, 3, 4, 5];

type FallingCoin = {
  id: number;
  value: number;
};

type SelectedProductImage = {
  id: string;
  file: File;
  previewUrl: string;
};

export function ChildPiggyBankPage() {
  const state = useLocalDataState();
  const currentChildId = resolveCurrentChildId(state);
  const selectedChild = currentChildId
    ? state.children.find((child) => child.id === currentChildId && child.status === 'active')
    : null;
  const summary = selectedChild ? piggyRepository.getPiggyBankSummary(selectedChild.id) : null;
  const incomes = selectedChild ? piggyRepository.getPiggyIncomeRecords(selectedChild.id) : [];
  const bankLogs = selectedChild ? piggyRepository.getPiggyBankLogs(selectedChild.id) : [];
  const products = selectedChild ? piggyRepository.listPiggyProducts(selectedChild.id) : [];
  const displaySettings = selectedChild ? piggyRepository.getPiggyProductDisplaySettings(selectedChild.id) : null;
  const purchases = selectedChild ? purchaseRepository.listPiggyPurchases(selectedChild.id) : [];
  const activePurchases = purchases.filter((purchase) => isActivePiggyPurchaseStatus(purchase.status));
  const completedPurchases = purchases.filter((purchase) => isCompletedPiggyPurchaseStatus(purchase.status));
  const [page, setPage] = useState(0);
  const [draggedCoin, setDraggedCoin] = useState<number | null>(null);
  const [bounceCoin, setBounceCoin] = useState<number | null>(null);
  const [fallingCoin, setFallingCoin] = useState<FallingCoin | null>(null);
  const [depositBurst, setDepositBurst] = useState<FallingCoin | null>(null);
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const [exitingProductId, setExitingProductId] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [detailProduct, setDetailProduct] = useState<LocalPiggyProduct | null>(null);
  const [isArranging, setIsArranging] = useState(false);
  const [draftDisplayIds, setDraftDisplayIds] = useState<string[]>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [arrangeNotice, setArrangeNotice] = useState('');
  const submitLock = useSubmitLock();
  const currentSavings = summary?.currentSavings ?? 0;
  const availableToday = summary?.availableToDepositToday ?? 0;
  const filledCoins = useMemo(() => buildPiggyCoinsFromLogs(bankLogs), [bankLogs]);
  const externalRecords = useMemo(
    () => [
      ...incomes.map((income) => ({
        id: `income-${income.id}`,
        kind: 'income' as const,
        date: income.created_at,
        label: `${income.source}${income.source.endsWith('給') ? '' : '給'}`,
        amount: `+${formatMoney(income.amount)}`
      })),
      ...bankLogs
        .filter((log) => log.type === 'purchase_debit')
        .map((log) => ({
          id: `purchase-${log.id}`,
          kind: 'purchase' as const,
          date: log.created_at,
          label: log.note ? `購買${log.note}` : '購買商品',
          amount: `-${formatMoney(log.amount)}`
        }))
    ].sort((a, b) => b.date.localeCompare(a.date)),
    [bankLogs, incomes]
  );
  const recentExternalRecords = externalRecords.slice(page * 5, page * 5 + 5);
  const totalIncomePages = Math.max(1, Math.ceil(externalRecords.length / 5));
  const depositRecords = recentExternalRecords.map((record) => ({
    id: record.id,
    label: record.label,
    amount: record.amount,
    date: formatDate(record.date)
  }));
  const unavailableProductIds = new Set(completedPurchases.map((purchase) => purchase.product_id));
  const displayCandidateProducts = products.filter((product) => !unavailableProductIds.has(product.id));
  const displayCandidateProductKey = displayCandidateProducts.map((product) => product.id).join('|');
  const displayCandidateById = new Map(displayCandidateProducts.map((product) => [product.id, product]));
  const selectedDisplayIds = displaySettings
    ? [
        ...displaySettings.selectedProductIds.filter((productId) => displayCandidateById.has(productId)),
        ...displayCandidateProducts.map((product) => product.id).filter((productId) => !displaySettings.selectedProductIds.includes(productId))
      ].slice(0, 6)
    : displayCandidateProducts.slice(0, 6).map((product) => product.id);
  const orderedSelectedDisplayIds = displaySettings
    ? [
        ...displaySettings.productDisplayOrder.filter((productId) => selectedDisplayIds.includes(productId)),
        ...selectedDisplayIds.filter((productId) => !displaySettings.productDisplayOrder.includes(productId))
      ].slice(0, 6)
    : selectedDisplayIds;
  const activeDisplayIds = isArranging ? draftDisplayIds : orderedSelectedDisplayIds;
  const displayedProducts = activeDisplayIds
    .map((productId) => displayCandidateById.get(productId))
    .filter((product): product is LocalPiggyProduct => Boolean(product));
  const unshownProducts = displayCandidateProducts.filter((product) => !activeDisplayIds.includes(product.id));
  const productImageUrls = usePiggyProductImageUrls(displayCandidateProducts);

  useEffect(() => {
    if (!isArranging) return;
    setDraftDisplayIds((current) => current.filter((productId) => displayCandidateById.has(productId)).slice(0, 6));
  }, [displayCandidateProductKey, isArranging]);

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 430);
  };

  const depositCoin = (value: number) => {
    if (!selectedChild) return false;
    const lockKey = `piggy-deposit:${selectedChild.id}:${value}`;
    if (!submitLock.acquire(lockKey)) return false;
    try {
      piggyRepository.depositPiggyCoin(selectedChild.id, value);
      const animation = { id: Date.now(), value };
      setFallingCoin(animation);
      setDepositBurst(animation);
      playCoinSound('drop');
      triggerShake();
      window.setTimeout(() => setFallingCoin(null), 520);
      window.setTimeout(() => setDepositBurst(null), 720);
      window.setTimeout(() => submitLock.release(lockKey), 900);
      return true;
    } catch {
      submitLock.release(lockKey);
      setBounceCoin(value);
      window.setTimeout(() => setBounceCoin(null), 420);
      return false;
    }
  };

  const buyProduct = (product: LocalPiggyProduct) => {
    if (!selectedChild) return;
    const lockKey = `piggy-buy:${selectedChild.id}:${product.id}`;
    if (!submitLock.acquire(lockKey)) return;
    try {
      purchaseRepository.requestPiggyPurchase(selectedChild.id, product.id);
      playCoinSound('buy');
    } catch {
      // Disabled buttons should prevent this; keep child UI silent.
      submitLock.release(lockKey);
    }
  };

  const confirmProductArrived = (productId: string) => {
    if (exitingProductId) return;
    const purchase = activePurchases.find((item) => item.product_id === productId && isArrivedPiggyPurchaseStatus(item.status));
    if (!purchase) return;
    setExitingProductId(productId);
    window.setTimeout(() => {
      try {
        purchaseRepository.confirmPiggyPurchaseArrived(purchase.id);
      } catch {
        // Keep child UI silent.
      } finally {
        setExitingProductId(null);
      }
    }, 260);
  };

  const cancelPurchase = (purchase: LocalPiggyPurchase) => {
    try {
      purchaseRepository.cancelPiggyPurchase(purchase.id);
    } catch {
      // Keep child UI silent.
    }
  };

  const startArranging = () => {
    setDraftDisplayIds(orderedSelectedDisplayIds);
    setArrangeNotice('');
    setIsArranging(true);
  };

  const finishArranging = () => {
    if (!selectedChild) return;
    const ids = draftDisplayIds.filter((productId) => displayCandidateById.has(productId)).slice(0, 6);
    piggyRepository.savePiggyProductDisplaySettings(selectedChild.id, {
      selectedProductIds: ids,
      productDisplayOrder: ids
    });
    setProductPickerOpen(false);
    setArrangeNotice('');
    setIsArranging(false);
  };

  const swapShelfProduct = (targetProductId: string) => {
    if (!isArranging || !draggedProductId || draggedProductId === targetProductId) return;
    const ids = draftDisplayIds.slice();
    const from = ids.indexOf(draggedProductId);
    const to = ids.indexOf(targetProductId);
    if (from < 0 || to < 0) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setDraftDisplayIds(ids);
    setDraggedProductId(null);
  };

  const removeShelfProduct = (productId: string) => {
    if (!isArranging) return;
    setDraftDisplayIds((current) => current.filter((idValue) => idValue !== productId));
    setArrangeNotice('');
  };

  const addShelfProduct = (productId: string) => {
    if (!isArranging) return;
    setDraftDisplayIds((current) => {
      if (current.includes(productId)) return current;
      if (current.length >= 6) {
        setArrangeNotice('請先移除一項商品。');
        return current;
      }
      setArrangeNotice('');
      return [...current, productId];
    });
  };

  const sceneShelfSlots = shelfSlots.map((slot): PiggySceneV2ShelfSlot | null => {
    const product = displayedProducts[slot] ?? null;
    if (!product) return null;
    const activePurchase = activePurchases.find((purchase) => purchase.product_id === product.id);
    const productStatus = activePurchase
      ? isArrivedPiggyPurchaseStatus(activePurchase.status)
        ? 'arrived'
        : 'pendingPurchase'
      : 'available';
    return {
      id: product.id,
      imageSrc: productImageUrls[product.id] ?? undefined,
      name: product.name,
      price: formatMoney(product.price),
      status: productStatus,
      affordable: currentSavings >= product.price && productStatus === 'available',
      leaving: product.id === exitingProductId
    };
  });
  const productStatusLabels = Object.fromEntries(
    displayCandidateProducts.map((product) => {
      const purchase = activePurchases.find((item) => item.product_id === product.id);
      const label = purchase ? (isArrivedPiggyPurchaseStatus(purchase.status) ? '到貨' : '等待到貨') : '可購買';
      return [product.id, label];
    })
  );

  return (
    <div className="piggy-page piggy-child-page">
      <PiggySceneV2
        depositRecords={depositRecords}
        incomeCount={externalRecords.length}
        page={page}
        totalIncomePages={totalIncomePages}
        currentSavings={formatMoney(currentSavings)}
        availableToday={formatMoney(availableToday)}
        availableToDeposit={availableToday}
        coins={filledCoins}
        fallingCoin={fallingCoin}
        depositBurst={depositBurst}
        shake={shake}
        draggedCoin={draggedCoin}
        bounceCoin={bounceCoin}
        shelfSlots={sceneShelfSlots}
        isArranging={isArranging}
        hiddenProductCount={unshownProducts.length}
        arrangeNotice={arrangeNotice}
        onArrangeProducts={isArranging ? finishArranging : startArranging}
        onOpenProductPicker={() => setProductPickerOpen(true)}
        onPrevPage={() => setPage((value) => Math.max(0, value - 1))}
        onNextPage={() => setPage((value) => Math.min(totalIncomePages - 1, value + 1))}
        onPiggyClick={() => {
          playCoinSound('shake');
          triggerShake();
        }}
        onPiggyDragOver={(event) => event.preventDefault()}
        onPiggyDrop={(event) => {
          event.preventDefault();
          const value = Number(event.dataTransfer.getData('text/piggy-coin') || draggedCoin || 0);
          if (value > 0) depositCoin(value);
          setDraggedCoin(null);
        }}
        onCoinDragEnd={() => setDraggedCoin(null)}
        onCoinPointerDeposit={(value) => depositCoin(value)}
        onProductDragStart={(productId, event) => {
          if (!isArranging) return;
          setDraggedProductId(productId);
          event.dataTransfer.setData('text/piggy-product', productId);
        }}
        onProductDragEnd={() => setDraggedProductId(null)}
        onProductDragOver={(event) => event.preventDefault()}
        onProductDrop={(productId) => swapShelfProduct(productId)}
        onProductBuy={(productId) => {
          const product = displayedProducts.find((item) => item.id === productId);
          const purchase = activePurchases.find((item) => item.product_id === productId);
          if (purchase && isArrivedPiggyPurchaseStatus(purchase.status)) {
            confirmProductArrived(productId);
            return;
          }
          if (product) buyProduct(product);
        }}
        onProductCancel={(productId) => {
          const pending = activePurchases.find((purchase) => purchase.product_id === productId);
          if (pending) cancelPurchase(pending);
        }}
        onProductRemove={removeShelfProduct}
      />
      {detailProduct ? <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} /> : null}
      {productPickerOpen ? (
        <PiggyProductPickerSheet
          products={unshownProducts}
          selectedIds={activeDisplayIds}
          imageUrls={productImageUrls}
          productStatuses={productStatusLabels}
          onClose={() => setProductPickerOpen(false)}
          onDone={() => setProductPickerOpen(false)}
          onPick={addShelfProduct}
        />
      ) : null}
    </div>
  );
}

function PiggyProductPickerSheet({
  products,
  selectedIds,
  imageUrls,
  productStatuses,
  onClose,
  onDone,
  onPick
}: {
  products: LocalPiggyProduct[];
  selectedIds: string[];
  imageUrls: Record<string, string | null>;
  productStatuses: Record<string, string>;
  onClose: () => void;
  onDone: () => void;
  onPick: (productId: string) => void;
}) {
  const selectedSet = new Set(selectedIds);
  const [notice, setNotice] = useState('');
  const isFull = selectedIds.length >= 6;

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const pickProduct = (productId: string) => {
    if (isFull) {
      setNotice('請先移除一項商品');
      return;
    }
    setNotice('');
    onPick(productId);
  };

  return createPortal(
    <div className="piggy-product-sheet-backdrop modalOverlay" role="presentation" onMouseDown={onClose}>
      <section className="piggy-product-sheet modalPanel" role="dialog" aria-modal="true" aria-labelledby="piggy-product-sheet-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2 id="piggy-product-sheet-title">選擇要展示的商品</h2>
            <p>點一下商品，就能放進展示櫃。</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        {notice ? <p className="piggy-product-sheet-notice">{notice}</p> : null}
        <div className="piggy-product-sheet-list">
          {products.map((product) => {
            const selected = selectedSet.has(product.id);
            return (
              <button type="button" key={product.id} className={selected ? 'is-selected' : ''} onClick={() => pickProduct(product.id)}>
                {imageUrls[product.id] ? <img src={imageUrls[product.id] ?? ''} alt={product.name} /> : <div className="piggy-image-placeholder" aria-label={product.name}>尚未上傳圖片</div>}
                <div>
                  <strong className={!product.name.trim() ? 'is-empty-name' : ''}>{product.name}</strong>
                  <span>{formatMoney(product.price)}</span>
                </div>
                <em>{productStatuses[product.id] ?? '可購買'}</em>
              </button>
            );
          })}
          {!products.length ? <EmptyPiggy text="目前沒有待展示商品" /> : null}
        </div>
        <footer>
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" onClick={onDone}>完成</button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

function usePiggyProductImageUrls(products: LocalPiggyProduct[]) {
  const mediaKey = products.map((product) => `${product.id}:${product.main_media_id ?? ''}`).join('|');
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      const entries = await Promise.all(
        products.map(async (product) => {
          if (!product.main_media_id) return [product.id, null] as const;
          const url = await piggyRepository.getProductMediaUrl(product.main_media_id);
          return [product.id, url] as const;
        })
      );
      if (active) setUrls(Object.fromEntries(entries));
    };
    void load();
    return () => {
      active = false;
      products.forEach((product) => {
        if (product.main_media_id) piggyRepository.releaseProductMediaUrl(product.main_media_id);
      });
    };
  }, [mediaKey]);

  return urls;
}

export function ParentPiggyBankPage() {
  const state = useLocalDataState();
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const [childId, setChildId] = useState(state.active_child_id ?? activeChildren[0]?.id ?? '');
  const [incomeForm, setIncomeForm] = useState({ source: '', amount: '100' });
  const [incomeStatus, setIncomeStatus] = useState<'idle' | 'done' | 'error'>('idle');
  const [incomeError, setIncomeError] = useState('');
  const submitLock = useSubmitLock();
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<LocalPiggyProduct | null>(null);
  const selectedChild = activeChildren.find((child) => child.id === childId) ?? null;
  const products = childId ? piggyRepository.listPiggyProducts(childId) : [];
  const purchases = childId ? purchaseRepository.listPiggyPurchases(childId) : [];
  const pending = purchases.filter((purchase) => isPendingPiggyPurchaseStatus(purchase.status));
  const arrived = purchases.filter((purchase) => isArrivedPiggyPurchaseStatus(purchase.status));
  const completed = purchases.filter((purchase) => isCompletedPiggyPurchaseStatus(purchase.status));

  useEffect(() => {
    if (!childId || !activeChildren.some((child) => child.id === childId)) setChildId(activeChildren[0]?.id ?? '');
  }, [activeChildren, childId]);

  const addIncome = (event: FormEvent) => {
    event.preventDefault();
    if (!childId) return;
    const lockKey = `piggy-income:${childId}`;
    if (!submitLock.acquire(lockKey)) return;
    setIncomeStatus('idle');
    setIncomeError('');
    try {
      piggyRepository.addPiggyIncome({ child_id: childId, source: incomeForm.source, amount: Number(incomeForm.amount) });
      setIncomeForm({ source: '', amount: '100' });
      setIncomeStatus('done');
      window.setTimeout(() => {
        submitLock.release(lockKey);
        setIncomeStatus('idle');
      }, 1200);
    } catch (caught) {
      setIncomeError(caught instanceof Error ? caught.message : '新增收入失敗，請再試一次。');
      setIncomeStatus('error');
      submitLock.release(lockKey);
    }
  };

  const runParentPiggyWrite = (key: string, action: () => void) => {
    if (!submitLock.acquire(key)) return;
    try {
      action();
      window.setTimeout(() => submitLock.release(key), 900);
    } catch {
      submitLock.release(key);
    }
  };

  return (
    <div className="piggy-page piggy-parent-page">
      <header className="piggy-page-header">
        <div><span>🐷</span><h1>撲滿管理</h1><p>新增收入、管理商品架，並處理孩子的待購買清單。</p></div>
        <button className="piggy-primary-button" onClick={() => { setEditingProduct(null); setProductFormOpen(true); }}><Plus size={18} /> 新增商品</button>
      </header>
      <nav className="piggy-child-tabs" aria-label="撲滿孩子分頁">
        {activeChildren.map((child) => (
          <button key={child.id} type="button" className={child.id === childId ? 'is-active' : ''} onClick={() => { setChildId(child.id); setEditingProduct(null); setProductFormOpen(false); }}>
            {child.display_name}
          </button>
        ))}
      </nav>
      <section className="piggy-parent-grid">
        <article className="piggy-admin-panel">
          <PanelTitle title="新增收入" meta={selectedChild ? `加入 ${selectedChild.display_name} 的可投入金額` : '收入會成為孩子今天可投入的金額'} />
          <form className="piggy-income-form" onSubmit={addIncome}>
            <label>孩子<select value={childId} onChange={(event) => setChildId(event.target.value)}>{activeChildren.map((child) => <option key={child.id} value={child.id}>{child.display_name}</option>)}</select></label>
            <label>來源<input required value={incomeForm.source} onChange={(event) => setIncomeForm({ ...incomeForm, source: event.target.value })} placeholder="媽媽給的" /></label>
            <label>金額<input required type="number" min="1" step="1" value={incomeForm.amount} onChange={(event) => setIncomeForm({ ...incomeForm, amount: event.target.value })} /></label>
            {incomeError ? <p className="local-form-error">{incomeError}</p> : null}
            <button className="piggy-primary-button" type="submit" disabled={submitLock.isLocked(`piggy-income:${childId}`)}>
              <Plus size={16} /> {submitLock.isLocked(`piggy-income:${childId}`) ? (incomeStatus === 'done' ? '已完成' : '處理中') : '新增收入'}
            </button>
          </form>
        </article>
        <article className="piggy-admin-panel">
          <PanelTitle title="待購買" meta={`${pending.length + arrived.length} 筆`} />
          <div className="piggy-pending-list">
            {pending.map((purchase) => (
              <article key={purchase.id}>
                <PiggyMediaImage mediaId={purchase.product_snapshot.main_media_id} alt={purchase.product_snapshot.name} />
                <div><strong>{childName(state, purchase.child_id)}</strong><span>{purchase.product_snapshot.name}</span><small>{formatMoney(purchase.amount)} · {formatDate(purchase.requested_at)}</small></div>
                <button disabled={submitLock.isLocked(`piggy-purchase-complete:${purchase.id}`)} onClick={() => runParentPiggyWrite(`piggy-purchase-complete:${purchase.id}`, () => purchaseRepository.completePiggyPurchase(purchase.id))}>
                  <Check size={16} /> {submitLock.isLocked(`piggy-purchase-complete:${purchase.id}`) ? '處理中' : '已購買 / 已到貨'}
                </button>
                <button disabled={submitLock.isLocked(`piggy-purchase-cancel:${purchase.id}`)} onClick={() => runParentPiggyWrite(`piggy-purchase-cancel:${purchase.id}`, () => purchaseRepository.cancelPiggyPurchase(purchase.id))}>
                  {submitLock.isLocked(`piggy-purchase-cancel:${purchase.id}`) ? '處理中' : '取消退款'}
                </button>
              </article>
            ))}
            {arrived.map((purchase) => (
              <article key={purchase.id}>
                <PiggyMediaImage mediaId={purchase.product_snapshot.main_media_id} alt={purchase.product_snapshot.name} />
                <div><strong>{childName(state, purchase.child_id)}</strong><span>{purchase.product_snapshot.name}</span><small>已到貨，等待孩子確認</small></div>
                <button disabled={submitLock.isLocked(`piggy-purchase-cancel:${purchase.id}`)} onClick={() => runParentPiggyWrite(`piggy-purchase-cancel:${purchase.id}`, () => purchaseRepository.cancelPiggyPurchase(purchase.id))}>
                  {submitLock.isLocked(`piggy-purchase-cancel:${purchase.id}`) ? '處理中' : '取消退款'}
                </button>
              </article>
            ))}
            {!pending.length && !arrived.length ? <EmptyPiggy text="目前沒有待購買商品" /> : null}
          </div>
        </article>
      </section>
      <section className="piggy-admin-panel">
        <PanelTitle title={selectedChild ? `${selectedChild.display_name}商品管理` : '商品管理'} meta={`上架 ${products.filter((item) => item.shelf_status === 'shelf').length}/6`} />
        <div className="piggy-admin-products">
          {products.map((product) => (
            <article key={product.id} className={product.shelf_status === 'shelf' ? 'is-on-shelf' : ''}>
              <PiggyMediaImage mediaId={product.main_media_id} alt={product.name} />
              <div><strong>{product.name}</strong><span>{formatMoney(product.price)}</span><small>{product.shelf_status === 'shelf' ? '商品架' : '待購買'}</small></div>
              <button onClick={() => { setEditingProduct(product); setProductFormOpen(true); }}>修改</button>
              <button disabled={submitLock.isLocked(`piggy-product-shelf:${product.id}`)} onClick={() => runParentPiggyWrite(`piggy-product-shelf:${product.id}`, () => piggyRepository.setPiggyProductShelfStatus(product.id, product.shelf_status === 'shelf' ? 'backlog' : 'shelf'))}>
                {submitLock.isLocked(`piggy-product-shelf:${product.id}`) ? '處理中' : product.shelf_status === 'shelf' ? '放回待購買' : '放上商品架'}
              </button>
              <button disabled={submitLock.isLocked(`piggy-product-delete:${product.id}`)} aria-label={`刪除 ${product.name}`} onClick={() => runParentPiggyWrite(`piggy-product-delete:${product.id}`, () => piggyRepository.deletePiggyProduct(product.id))}>
                <Trash2 size={16} />
              </button>
            </article>
          ))}
          {!products.length ? <EmptyPiggy text="尚未新增商品，請先建立第一個商品。" /> : null}
        </div>
      </section>
      <section className="piggy-admin-panel">
        <PanelTitle title="已購買歷史" meta={`${completed.length} 筆`} />
        <div className="piggy-history-grid">{completed.length ? completed.map((purchase) => <PurchaseHistoryCard purchase={purchase} key={purchase.id} />) : <EmptyPiggy text="還沒有已購買商品。" />}</div>
      </section>
      {productFormOpen && childId ? <PiggyProductForm childId={childId} product={editingProduct} onClose={() => { setProductFormOpen(false); setEditingProduct(null); }} /> : null}
    </div>
  );
}

function PiggyProductForm({ childId, product, onClose }: { childId: string; product: LocalPiggyProduct | null; onClose: () => void }) {
  const [productId] = useState(product?.id ?? createLocalId());
  const [form, setForm] = useState({
    name: product?.name ?? '',
    price: String(product?.price ?? 100),
    mainMediaId: product?.main_media_id ?? null as string | null,
    galleryMediaIds: product?.gallery_media_ids ?? [] as string[],
    shelfStatus: product?.shelf_status ?? 'backlog' as LocalPiggyProduct['shelf_status'],
    error: '',
    status: ''
  });
  const [mainImage, setMainImage] = useState<SelectedProductImage | null>(null);
  const [galleryImages, setGalleryImages] = useState<SelectedProductImage[]>([]);
  const submitLock = useSubmitLock();
  const saveLockKey = product ? `piggy-product:update:${product.id}` : `piggy-product:create:${childId}`;

  const selectProductImages = (files: File[], main: boolean) => {
    const selected = files.slice(0, main ? 1 : 5).map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name || 'camera-photo'}`,
      file,
      previewUrl: URL.createObjectURL(file)
    }));
    const firstError = selected.map((item, index) => {
      const error = getImageFileValidationError(item.file);
      return error ? `${main ? '主圖' : `第 ${index + 1} 張照片`}：${error}` : '';
    }).find(Boolean);
    if (main) {
      if (mainImage) URL.revokeObjectURL(mainImage.previewUrl);
      setMainImage(selected[0] ?? null);
      setForm((current) => ({ ...current, mainMediaId: product?.main_media_id ?? null, error: firstError || '', status: selected[0] ? formatSelectedProductImage(selected[0].file, 1, 1) : '' }));
      return;
    }
    galleryImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setGalleryImages(selected);
    setForm((current) => ({ ...current, galleryMediaIds: product?.gallery_media_ids ?? [], error: firstError || '', status: selected.length ? `${selected.length} 張其他圖片已選擇，總大小 ${formatFileSize(selected.reduce((total, item) => total + item.file.size, 0))}` : '' }));
  };

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (!submitLock.acquire(saveLockKey)) return;
    const ownerId = product?.id ?? productId;
    if (!mainImage && !form.mainMediaId) {
      setForm((current) => ({ ...current, error: '請先上傳商品主圖' }));
      submitLock.release(saveLockKey);
      return;
    }
    const uploadedMediaIds: string[] = [];
    try {
      setForm((current) => ({ ...current, error: '', status: '商品儲存中：照片格式處理中' }));
      const nextMainMediaId = mainImage
        ? await uploadProductImage(mainImage.file, ownerId, childId, '主圖', uploadedMediaIds)
        : form.mainMediaId;
      const nextGalleryMediaIds = galleryImages.length
        ? await uploadProductImageList(galleryImages.map((item) => item.file), ownerId, childId, uploadedMediaIds)
        : form.galleryMediaIds;
      if (!nextMainMediaId) throw new Error('商品主圖建立失敗');
      setForm((current) => ({ ...current, status: '商品儲存中：商品資料儲存中' }));
      const input = {
        id: product ? undefined : ownerId,
        child_id: childId,
        name: form.name,
        price: Number(form.price),
        main_media_id: nextMainMediaId,
        gallery_media_ids: nextGalleryMediaIds,
        shelf_status: form.shelfStatus,
        client_request_id: `piggy-product:${ownerId}`
      };
      const saved = product
        ? piggyRepository.updatePiggyProduct(product.id, input)
        : piggyRepository.createPiggyProduct(input);
      logImageUploadDiagnostics('[piggy-product] product RPC completed', {
        stage: 'owner-rpc',
        ownerType: 'piggy-product',
        childId,
        ownerId: saved.id,
        mediaAssetId: saved.main_media_id,
        rpcStatus: 200
      });
      onClose();
    } catch (caught) {
      await Promise.allSettled(uploadedMediaIds.map((mediaId) => piggyRepository.deleteProductImage(mediaId)));
      const message = caught instanceof ImageUploadPipelineError
        ? caught.userMessage
        : caught instanceof Error
          ? `商品資料儲存失敗：${caught.message}`
          : '商品資料儲存失敗，請再試一次。';
      setForm((current) => ({ ...current, error: message, status: '' }));
      submitLock.release(saveLockKey);
    }
  };

  return (
    <div className="local-form-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="local-form-dialog piggy-product-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><small>{dataModeBadgeLabel}</small><h2>{product ? '修改商品' : '新增商品'}</h2></div><button type="button" onClick={onClose}>×</button></header>
        <form onSubmit={saveProduct}>
          <div className="piggy-product-form-scroll">
            <label className="is-full">商品名稱<input maxLength={50} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>價格<input required type="number" min="1" step="1" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
            <label>狀態<select value={form.shelfStatus} onChange={(event) => setForm({ ...form, shelfStatus: event.target.value as LocalPiggyProduct['shelf_status'] })}><option value="backlog">待購買</option><option value="shelf">商品架</option></select></label>
            <label className="is-full piggy-upload-field"><Upload size={16} /> 主圖<input type="file" accept="image/*,.heic,.heif" onChange={(event) => {
              const input = event.currentTarget;
              const files = captureSelectedFiles(input, 1);
              selectProductImages(files, true);
            }} /></label>
            {mainImage ? <ProductImagePreview image={mainImage} index={1} total={1} /> : form.mainMediaId ? <PiggyMediaImage className="piggy-form-preview" mediaId={form.mainMediaId} alt="商品主圖" /> : null}
            <label className="is-full piggy-upload-field"><Upload size={16} /> 其他圖片，最多 5 張<input multiple type="file" accept="image/*,.heic,.heif" onChange={(event) => {
              const input = event.currentTarget;
              const files = captureSelectedFiles(input, 5);
              selectProductImages(files, false);
            }} /></label>
            {galleryImages.length ? (
              <div className="piggy-selected-photo-grid">
                {galleryImages.map((image, index) => <ProductImagePreview key={image.id} image={image} index={index + 1} total={galleryImages.length} />)}
              </div>
            ) : null}
            {form.status ? <p className="local-form-status">{form.status}</p> : null}
            {form.error ? <p className="local-form-error">{form.error}</p> : null}
            <div className="piggy-product-form-bottom-spacer" aria-hidden="true" />
          </div>
          <footer>
            <button type="button" onClick={onClose} disabled={submitLock.isLocked(saveLockKey)}>取消</button>
            <button className="ds-primary-button piggy-product-save-button" type="submit" disabled={submitLock.isLocked(saveLockKey)}>
              {submitLock.isLocked(saveLockKey) ? '商品儲存中' : '儲存商品'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ProductImagePreview({ image, index, total }: { image: SelectedProductImage; index: number; total: number }) {
  return (
    <figure className="piggy-selected-photo-preview">
      <img src={image.previewUrl} alt={`商品照片 ${index}`} />
      <figcaption>
        <b>{image.file.name || `相機照片 ${index}`}</b>
        <small>{formatFileSize(image.file.size)} · {index}/{total}</small>
      </figcaption>
    </figure>
  );
}

async function uploadProductImage(file: File, ownerId: string, childId: string, label: string, uploadedMediaIds: string[]) {
  const prepared = await prepareImageFileForUpload(file, {
    fallbackBaseName: `${label}-${ownerId}`,
    ownerType: 'piggy-product',
    childId,
    ownerId
  });
  logImageUploadDiagnostics('[piggy-product] image prepared', {
    stage: 'prepare',
    ownerType: 'piggy-product',
    childId,
    ownerId,
    originalFileName: prepared.originalFileName,
    originalMimeType: prepared.originalMimeType,
    originalBytes: prepared.originalBytes,
    normalizedFileName: prepared.normalizedFileName,
    normalizedMimeType: prepared.mimeType,
    normalizedBytes: prepared.bytes
  });
  const mediaId = await piggyRepository.saveProductImageFile({
    ownerId,
    childId,
    file,
    blob: prepared.blob,
    mimeType: prepared.mimeType,
    fileName: prepared.normalizedFileName
  });
  uploadedMediaIds.push(mediaId);
  return mediaId;
}

async function uploadProductImageList(files: File[], ownerId: string, childId: string, uploadedMediaIds: string[]) {
  const ids: string[] = [];
  for (let index = 0; index < files.slice(0, 5).length; index += 1) {
    ids.push(await uploadProductImage(files[index], ownerId, childId, `其他圖片-${index + 1}`, uploadedMediaIds));
  }
  return ids;
}

function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatSelectedProductImage(file: File, index: number, total: number) {
  return `${file.name || `相機照片 ${index}`} · ${formatFileSize(file.size)} · ${index}/${total}`;
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

function ProductDetailModal({ product, onClose }: { product: LocalPiggyProduct; onClose: () => void }) {
  const mediaIds = [product.main_media_id, ...product.gallery_media_ids].filter((idValue): idValue is string => Boolean(idValue));
  const [index, setIndex] = useState(0);
  return (
    <div className="local-form-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="piggy-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <button className="piggy-detail-close" onClick={onClose}>×</button>
        <PiggyMediaImage mediaId={mediaIds[index] ?? product.main_media_id} alt={product.name} />
        <div><button disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}><ArrowLeft size={18} /></button><strong>{product.name}</strong><button disabled={index >= mediaIds.length - 1} onClick={() => setIndex((value) => Math.min(mediaIds.length - 1, value + 1))}><ArrowRight size={18} /></button></div>
        <span>{formatMoney(product.price)}</span>
      </section>
    </div>
  );
}

function PurchaseHistoryCard({ purchase }: { purchase: LocalPiggyPurchase }) {
  return <article className="piggy-history-card"><PiggyMediaImage mediaId={purchase.product_snapshot.main_media_id} alt={purchase.product_snapshot.name} /><div><strong>{purchase.product_snapshot.name}</strong><span>{formatMoney(purchase.product_snapshot.price)}</span><small>{formatDate(purchase.purchased_at ?? purchase.requested_at)} · 已購買</small></div></article>;
}

function PiggyMediaImage({ mediaId, alt, className = '' }: { mediaId: string | null; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!mediaId) {
      setUrl(null);
      return;
    }
    void piggyRepository.getProductMediaUrl(mediaId).then((objectUrl) => {
      if (active) setUrl(objectUrl);
    });
    return () => {
      active = false;
      piggyRepository.releaseProductMediaUrl(mediaId);
    };
  }, [mediaId]);
  return url ? <img className={className} src={url} alt={alt} /> : <div className={`piggy-image-placeholder ${className}`} aria-label={alt}>尚未上傳圖片</div>;
}

function PanelTitle({ title, meta }: { title: string; meta?: string }) {
  return <header className="piggy-panel-title"><h2>{title}</h2>{meta ? <span>{meta}</span> : null}</header>;
}

function EmptyPiggy({ text }: { text: string }) {
  return <div className="piggy-empty">{text}</div>;
}

function childName(state: LocalDatabaseState, childId: string) {
  return state.children.find((child) => child.id === childId)?.display_name ?? '孩子';
}

function isPendingPiggyPurchaseStatus(status: LocalPiggyPurchase['status']) {
  return status === 'pendingPurchase' || status === 'pending_parent_purchase';
}

function isArrivedPiggyPurchaseStatus(status: LocalPiggyPurchase['status']) {
  return status === 'arrived' || status === 'purchased';
}

function isCompletedPiggyPurchaseStatus(status: LocalPiggyPurchase['status']) {
  return status === 'completed';
}

function isActivePiggyPurchaseStatus(status: LocalPiggyPurchase['status']) {
  return isPendingPiggyPurchaseStatus(status) || isArrivedPiggyPurchaseStatus(status);
}

function buildPiggyCoinsFromLogs(logs: LocalPiggyBankLog[]) {
  const coins: Array<{
    id: string;
    value: PiggyCoinValue;
    left: number;
    bottom: number;
    rotate: number;
    scale: number;
    zIndex: number;
  }> = [];
  const addCoin = (coinId: string, value: PiggyCoinValue) => {
    if (coins.length >= 120) return;
    const coinIndex = coins.length;
    const row = Math.floor(coinIndex / 12);
    coins.push({
      id: coinId,
      value,
      left: 7 + seededRandom(`left:${coinId}:${coinIndex}`) * 78,
      bottom: 3 + row * 8 + seededRandom(`bottom:${coinId}:${coinIndex}`) * 7,
      rotate: -34 + seededRandom(`rotate:${coinId}:${coinIndex}`) * 68,
      scale: 0.78 + seededRandom(`scale:${coinId}:${coinIndex}`) * 0.34,
      zIndex: coinIndex
    });
  };
  const removeAmount = (amount: number) => {
    let remaining = amount;
    [...coinValues].sort((a, b) => b - a).forEach((value) => {
      while (remaining >= value) {
        const index = coins.findIndex((coin) => coin.value === value);
        if (index < 0) break;
        coins.splice(index, 1);
        remaining -= value;
      }
    });
  };
  logs
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach((log) => {
      if (log.type === 'purchase_debit') {
        removeAmount(log.amount);
        return;
      }
      if (log.type === 'coin_deposit' && isPiggyCoinValue(log.amount)) {
        addCoin(log.id, log.amount);
        return;
      }
      if (log.type === 'purchase_refund') {
        decomposePiggyAmount(log.amount).forEach((value, index) => addCoin(`${log.id}-${index}`, value));
      }
    });
  return coins;
}

function decomposePiggyAmount(amount: number) {
  const values: PiggyCoinValue[] = [];
  let remaining = Math.max(0, Math.floor(amount));
  [...coinValues].sort((a, b) => b - a).forEach((value) => {
    while (remaining >= value) {
      values.push(value);
      remaining -= value;
    }
  });
  return values;
}

function isPiggyCoinValue(value: number): value is PiggyCoinValue {
  return coinValues.includes(value as PiggyCoinValue);
}

function seededRandom(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function playCoinSound(kind: 'drop' | 'shake' | 'buy') {
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === 'shake' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(kind === 'buy' ? 520 : 820, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'shake' ? 360 : 240, context.currentTime + 0.18);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  } catch {
    // Audio is optional.
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

