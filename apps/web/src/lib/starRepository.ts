import { dataRepository } from './dataRepository';

export const starRepository = {
  getStarBalance: dataRepository.getStarBalance.bind(dataRepository),
  listStarTransactions: dataRepository.listStarTransactions.bind(dataRepository)
};
