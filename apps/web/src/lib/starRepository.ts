import { dataRepository } from './dataRepository';

export const starRepository = {
  encourageShareWithStars: dataRepository.encourageShareWithStars.bind(dataRepository),
  getStarBalance: dataRepository.getStarBalance.bind(dataRepository),
  listStarTransactions: dataRepository.listStarTransactions.bind(dataRepository)
};
