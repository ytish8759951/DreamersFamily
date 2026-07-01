import { dataRepository } from './dataRepository';

export const growthRepository = {
  createGrowthRecord: dataRepository.createGrowthRecord.bind(dataRepository),
  updateGrowthRecord: dataRepository.updateGrowthRecord.bind(dataRepository),
  deleteGrowthRecord: dataRepository.deleteGrowthRecord.bind(dataRepository),
  getGrowthRecords: dataRepository.getGrowthRecords.bind(dataRepository),
  getLatestGrowthRecordByChild: dataRepository.getLatestGrowthRecordByChild.bind(dataRepository),
  getGrowthRecordsByChild: dataRepository.getGrowthRecordsByChild.bind(dataRepository)
};
