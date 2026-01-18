// std
import { strictEqual } from 'assert';

// FoalTS
import { ServiceFactory, ServiceManager, LazyService, lazy } from './index';

describe('Index exports', () => {

  it('should export ServiceFactory', () => {
    strictEqual(typeof ServiceFactory, 'function');
  });

  it('should export LazyService', () => {
    strictEqual(typeof LazyService, 'function');
  });

  it('should export lazy', () => {
    strictEqual(typeof lazy, 'function');
  });

  it('should export ServiceManager', () => {
    strictEqual(typeof ServiceManager, 'function');
  });

  it('should create a ServiceFactory instance', () => {
    const factory = new ServiceFactory((sm: ServiceManager) => {
      class TestService {}
      return [TestService, new TestService()];
    });
    strictEqual(factory instanceof ServiceFactory, true);
  });

});
