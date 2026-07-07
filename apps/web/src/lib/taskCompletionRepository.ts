import { dataRepository } from './dataRepository';

export const taskCompletionRepository = {
  completeTask: dataRepository.completeTask.bind(dataRepository),
  approveTask: dataRepository.approveTask.bind(dataRepository)
};
