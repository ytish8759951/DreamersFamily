import { dataRepository } from './dataRepository';

export const tabletRepository = {
  updateScreenTime: dataRepository.updateScreenTime.bind(dataRepository),
  createScreenTimeRequest: dataRepository.createScreenTimeRequest.bind(dataRepository),
  reviewScreenTimeRequest: dataRepository.reviewScreenTimeRequest.bind(dataRepository),
  listScreenTimeRequests: dataRepository.listScreenTimeRequests.bind(dataRepository),
  getScreenTimeBalance: dataRepository.getScreenTimeBalance.bind(dataRepository),
  listScreenTimeLogs: dataRepository.listScreenTimeLogs.bind(dataRepository),
  getWeeklyScreenTime: dataRepository.getWeeklyScreenTime.bind(dataRepository),
  updatePlannedScreenTime: dataRepository.updatePlannedScreenTime.bind(dataRepository),
  redeemStarsForScreenTime: dataRepository.redeemStarsForScreenTime.bind(dataRepository),
  addScreenTime: dataRepository.addScreenTime.bind(dataRepository),
  deductScreenTimePenalty: dataRepository.deductScreenTimePenalty.bind(dataRepository),
  recordScreenTimeUsed: dataRepository.recordScreenTimeUsed.bind(dataRepository),
  getScreenTimeLogsByChild: dataRepository.getScreenTimeLogsByChild.bind(dataRepository),
  getTodayScreenTimeByChild: dataRepository.getTodayScreenTimeByChild.bind(dataRepository)
};
