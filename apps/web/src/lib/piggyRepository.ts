import { dataRepository } from './dataRepository';
import { mediaRepository } from './mediaRepository';

export const piggyRepository = {
  addPiggyIncome: dataRepository.addPiggyIncome.bind(dataRepository),
  depositPiggyCoin: dataRepository.depositPiggyCoin.bind(dataRepository),
  getPiggyBankSummary: dataRepository.getPiggyBankSummary.bind(dataRepository),
  getPiggyIncomeRecords: dataRepository.getPiggyIncomeRecords.bind(dataRepository),
  getPiggyBankLogs: dataRepository.getPiggyBankLogs.bind(dataRepository),
  getPiggyProductDisplaySettings: dataRepository.getPiggyProductDisplaySettings.bind(dataRepository),
  savePiggyProductDisplaySettings: dataRepository.savePiggyProductDisplaySettings.bind(dataRepository),
  createPiggyProduct: dataRepository.createPiggyProduct.bind(dataRepository),
  updatePiggyProduct: dataRepository.updatePiggyProduct.bind(dataRepository),
  deletePiggyProduct: dataRepository.deletePiggyProduct.bind(dataRepository),
  listPiggyProducts: dataRepository.listPiggyProducts.bind(dataRepository),
  listPiggyPurchases: dataRepository.listPiggyPurchases.bind(dataRepository),
  setPiggyProductShelfStatus: dataRepository.setPiggyProductShelfStatus.bind(dataRepository),
  requestPiggyPurchase: dataRepository.requestPiggyPurchase.bind(dataRepository),
  cancelPiggyPurchase: dataRepository.cancelPiggyPurchase.bind(dataRepository),
  completePiggyPurchase: dataRepository.completePiggyPurchase.bind(dataRepository),
  confirmPiggyPurchaseArrived: dataRepository.confirmPiggyPurchaseArrived.bind(dataRepository),
  saveProductImage,
  saveProductImageFile,
  deleteProductImage,
  updateProductMediaOwner,
  getProductMediaUrl,
  releaseProductMediaUrl
};

async function saveProductImage(input: { ownerId: string; childId?: string | null; blob: Blob; mimeType: string; fileName?: string }) {
  const media = await mediaRepository.saveMedia({
    ownerType: 'piggy-product',
    ownerId: input.ownerId,
    childId: input.childId,
    mediaType: 'image',
    mimeType: input.mimeType,
    fileName: input.fileName,
    blob: input.blob
  });
  return media.id;
}

async function saveProductImageFile(input: { ownerId: string; childId?: string | null; file: File; blob?: Blob; mimeType?: string; fileName?: string }) {
  const blob = input.blob ?? new Blob([await input.file.arrayBuffer()], { type: input.file.type || 'image/jpeg' });
  return saveProductImage({
    ownerId: input.ownerId,
    childId: input.childId,
    blob,
    mimeType: input.mimeType || blob.type || input.file.type || 'image/jpeg',
    fileName: input.fileName || input.file.name
  });
}

async function updateProductMediaOwner(mediaId: string, ownerId: string) {
  await mediaRepository.updateMedia({ id: mediaId, ownerType: 'piggy-product', ownerId });
}

async function deleteProductImage(mediaId: string) {
  await mediaRepository.deleteMedia(mediaId);
}

function getProductMediaUrl(mediaId: string) {
  return mediaRepository.acquireMediaObjectUrl(mediaId);
}

function releaseProductMediaUrl(mediaId: string) {
  mediaRepository.releaseMediaObjectUrl(mediaId);
}
