import { dataRepository } from './dataRepository';

export const purchaseRepository = {
  requestPiggyPurchase: dataRepository.requestPiggyPurchase.bind(dataRepository),
  cancelPiggyPurchase: dataRepository.cancelPiggyPurchase.bind(dataRepository),
  completePiggyPurchase: dataRepository.completePiggyPurchase.bind(dataRepository),
  confirmPiggyPurchaseArrived: dataRepository.confirmPiggyPurchaseArrived.bind(dataRepository),
  listPiggyPurchases: dataRepository.listPiggyPurchases.bind(dataRepository)
};
