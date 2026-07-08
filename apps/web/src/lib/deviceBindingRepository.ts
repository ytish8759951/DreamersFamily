import { dataRepository } from './dataRepository';

export const deviceBindingRepository = {
  getChildByToken: dataRepository.getChildByToken.bind(dataRepository),
  bindChildDeviceByToken: dataRepository.bindChildDeviceByToken.bind(dataRepository),
  syncChildDeviceLogin: dataRepository.syncChildDeviceLogin.bind(dataRepository),
  regenerateChildToken: dataRepository.regenerateChildToken.bind(dataRepository),
  unbindChildDevice: dataRepository.unbindChildDevice.bind(dataRepository),
  listDeviceBindings: dataRepository.listDeviceBindings.bind(dataRepository)
};
