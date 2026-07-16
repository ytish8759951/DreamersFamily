import { dataRepository } from './dataRepository';

export const deviceBindingRepository = {
  getChildByToken: dataRepository.getChildByToken.bind(dataRepository),
  createChildLoginChallenge: dataRepository.createChildLoginChallenge.bind(dataRepository),
  resolveChildLoginChallenge: dataRepository.resolveChildLoginChallenge.bind(dataRepository),
  completeChildLoginChallenge: dataRepository.completeChildLoginChallenge.bind(dataRepository),
  validateChildDeviceSession: dataRepository.validateChildDeviceSession.bind(dataRepository),
  heartbeatChildDeviceSession: dataRepository.heartbeatChildDeviceSession.bind(dataRepository),
  bindChildDeviceByToken: dataRepository.bindChildDeviceByToken.bind(dataRepository),
  syncChildDeviceLogin: dataRepository.syncChildDeviceLogin.bind(dataRepository),
  regenerateChildToken: dataRepository.regenerateChildToken.bind(dataRepository),
  unbindChildDevice: dataRepository.unbindChildDevice.bind(dataRepository),
  listDeviceBindings: dataRepository.listDeviceBindings.bind(dataRepository)
};
