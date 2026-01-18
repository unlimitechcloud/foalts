// std
import { join } from 'path';

// 3p
import 'reflect-metadata';

// FoalTS
import { Class, ClassOrAbstractClass } from './class.interface';
import { Config } from './config';

export interface IDependency {
  propertyKey: string;
  serviceClassOrID: string|Class;
}

export interface ILazyDependency {
  propertyKey: string;
  serviceType?: any;
}

/**
 * Factory class for creating service instances with custom initialization logic.
 *
 * @export
 */
export class ServiceFactory<T = any> {
  /**
   * Creates a ServiceFactory instance.
   *
   * @param {(sm: ServiceManager) => [Class<T>, T]} factory - Factory function that creates the service.
   */
  constructor(
    private readonly factory: (sm: ServiceManager) => [Class<T>, T]
  ) {}

  /**
   * Create a service instance using the factory function.
   *
   * @param {ServiceManager} sm - The service manager.
   * @returns {[Class<T>, T]} A tuple of [ServiceClass, ServiceInstance].
   */
  create(sm: ServiceManager): [Class<T>, T] {
    return this.factory(sm);
  }
}

/**
 * Decorator injecting a service inside a controller or another service.
 *
 * @param id {string} - The service ID.
 */
export function Dependency(id: string) {
  return (target: any, propertyKey: string) => {
    const dependencies: IDependency[] = [ ...(Reflect.getMetadata('dependencies', target) || []) ];
    dependencies.push({ propertyKey, serviceClassOrID: id });
    Reflect.defineMetadata('dependencies', dependencies, target);
  };
}

/**
 * Decorator injecting a service inside a controller or another service.
 *
 * @export
 */
export function dependency(target: any, propertyKey: string) {
  const serviceClass = Reflect.getMetadata('design:type', target, propertyKey);

  // Validate that metadata was emitted
  if (serviceClass === undefined) {
    const className = target.constructor?.name || 'UnknownClass';
    throw new Error(
      `@dependency decorator on "${propertyKey}" in ${className}: ` +
      `Unable to resolve the service type. The TypeScript metadata was not emitted.\n\n` +
      `This usually happens when:\n` +
      `  1. "emitDecoratorMetadata" is not enabled in tsconfig.json\n` +
      `  2. Your build tool (esbuild, swc, etc.) doesn't support emitDecoratorMetadata\n` +
      `  3. The property type is an interface (interfaces don't exist at runtime)\n\n` +
      `Solutions:\n` +
      `  - Add "emitDecoratorMetadata": true to your tsconfig.json\n` +
      `  - Use @Dependency('serviceId') with a string identifier instead\n` +
      `  - If using Vitest/esbuild, configure it to use ts-node or swc\n` +
      `  - Use a class instead of an interface for the dependency type`
    );
  }

  const dependencies: IDependency[] = [ ...(Reflect.getMetadata('dependencies', target) || []) ];
  dependencies.push({ propertyKey, serviceClassOrID: serviceClass });
  Reflect.defineMetadata('dependencies', dependencies, target);
}

/**
 * Decorator for lazy-loaded services. Supports two usage patterns:
 * 1. With LazyService: @lazy myService = new LazyService(ServiceClass)
 * 2. Direct service reference: @lazy myService: ServiceClass (automatically wraps in LazyService)
 *
 * @export
 */
export function lazy(target: any, propertyKey: string): void;
/**
 * Decorator for lazy-loaded services with explicit service type.
 * Usage: @lazy(ServiceClass) myService: ServiceClass
 *
 * @export
 */
export function lazy<T>(serviceClass: ClassOrAbstractClass<T>): (target: any, propertyKey: string) => void;
export function lazy<T>(targetOrServiceClass: any, propertyKey?: string): any {
  // Case 1: Used as @lazy (without parameters)
  if (propertyKey !== undefined) {
    const target = targetOrServiceClass;
    // Get the service type from TypeScript metadata
    const serviceType = Reflect.getMetadata('design:type', target, propertyKey);

    // Warn if metadata is not available (but don't throw - it might be a LazyService assignment)
    if (serviceType === undefined || serviceType === Object) {
      const className = target.constructor?.name || 'UnknownClass';
      console.warn(
        `@lazy decorator on "${propertyKey}" in ${className}: ` +
        `Unable to resolve the service type from metadata. ` +
        `Consider using @lazy(ServiceClass) syntax instead for explicit type specification.`
      );
    }

    const lazyDependencies: ILazyDependency[] = [ ...(Reflect.getMetadata('lazyDependencies', target) || []) ];
    lazyDependencies.push({ propertyKey, serviceType });
    Reflect.defineMetadata('lazyDependencies', lazyDependencies, target);
    return;
  }

  // Case 2: Used as @lazy(ServiceClass) - truly lazy with getter
  const serviceClass = targetOrServiceClass;

  // Validate that a valid class was provided
  if (serviceClass === undefined || serviceClass === null) {
    throw new Error(
      `@lazy(ServiceClass) decorator: The service class argument is ${serviceClass}. ` +
      `Make sure to pass a valid class reference.`
    );
  }

  return (target: any, propertyKey: string) => {
    const lazyDependencies: ILazyDependency[] = [ ...(Reflect.getMetadata('lazyDependencies', target) || []) ];
    lazyDependencies.push({ propertyKey, serviceType: serviceClass });
    Reflect.defineMetadata('lazyDependencies', lazyDependencies, target);

    // Property descriptor will be defined on each instance in injectDependencies
  };
}

/**
 * Create a new service with its dependencies.
 *
 * @export
 * @template Service
 * @param {ClassOrAbstractClass<Service>} serviceClass - The service class.
 * @param {object} [dependencies] - An object which key/values are the service properties/instances.
 * @returns {Service} - The created service.
 */
export function createService<Service extends object>(
  serviceClass: ClassOrAbstractClass<Service>, dependencies?: object
): Service {
  return createControllerOrService(serviceClass, dependencies);
}

export function createControllerOrService<T extends object>(
  serviceClass: ClassOrAbstractClass<T>, dependencies?: object
): T {
  const metadata: IDependency[] = Reflect.getMetadata('dependencies', serviceClass.prototype) || [];

  const serviceManager = new ServiceManager();

  if (dependencies) {
    metadata.forEach(dep => {
      const serviceMock = (dependencies as any)[dep.propertyKey];
      if (serviceMock) {
        serviceManager.set(dep.serviceClassOrID, serviceMock);
      }
    });
  }

  return serviceManager.get(serviceClass);
}

/**
 * Service entry in the service map.
 */
interface ServiceEntry {
  boot: boolean;
  service?: any;
  target?: Class|ServiceFactory<any>;
}

/**
 * Logger interface for ServiceManager.
 * Allows custom logging implementations.
 *
 * @export
 */
export interface ServiceManagerLogger {
  info(message: string): void;
  debug(message: string): void;
  warn(message: string): void;
}

/**
 * Default console logger implementation.
 */
const defaultLogger: ServiceManagerLogger = {
  info: (msg: string) => console.log(`[ServiceManager] ${msg}`),
  debug: (msg: string) => console.log(`[ServiceManager:DEBUG] ${msg}`),
  warn: (msg: string) => console.warn(`[ServiceManager] ${msg}`),
};

/**
 * Options for ServiceManager configuration.
 *
 * @export
 */
export interface ServiceManagerOptions {
  /**
   * Enable debug mode for detailed resolution logging.
   * Default: false
   */
  debug?: boolean;
  /**
   * Enable info-level logging for service lifecycle events.
   * Default: false
   */
  logging?: boolean;
  /**
   * Custom logger implementation.
   * Default: console-based logger
   */
  logger?: ServiceManagerLogger;
}

/**
 * Identity Mapper that instantiates and returns service singletons.
 *
 * @export
 * @class ServiceManager
 */
export class ServiceManager {

  private readonly map: Map<string|ClassOrAbstractClass|ServiceFactory<any>, ServiceEntry>  = new Map();
  private initialized: boolean = false;

  // Logging configuration
  private readonly debugMode: boolean;
  private readonly loggingEnabled: boolean;
  private readonly logger: ServiceManagerLogger;

  // Resolution tracking for debug mode
  private resolutionStack: string[] = [];
  private resolutionDepth: number = 0;

  /**
   * Creates a new ServiceManager instance.
   *
   * @param {ServiceManagerOptions} [options] - Configuration options.
   */
  constructor(options?: ServiceManagerOptions) {
    this.debugMode = options?.debug ?? false;
    this.loggingEnabled = options?.logging ?? false;
    this.logger = options?.logger ?? defaultLogger;
  }

  /**
   * Get the identifier name for logging purposes.
   */
  private getIdentifierName(identifier: string|ClassOrAbstractClass|ServiceFactory<any>): string {
    if (typeof identifier === 'string') {
      return `"${identifier}"`;
    }
    if (identifier instanceof ServiceFactory) {
      return 'ServiceFactory';
    }
    return (identifier as any).name || 'UnknownClass';
  }

  /**
   * Log an info-level message (when logging is enabled).
   */
  private logInfo(message: string): void {
    if (this.loggingEnabled || this.debugMode) {
      this.logger.info(message);
    }
  }

  /**
   * Log a debug-level message (only when debug mode is enabled).
   */
  private logDebug(message: string): void {
    if (this.debugMode) {
      const indent = '  '.repeat(this.resolutionDepth);
      this.logger.debug(`${indent}${message}`);
    }
  }

  /**
   * Boot all services : call the method "boot" of each service if it exists.
   *
   * If a service identifier is provided, only this service will be booted.
   *
   * Services are only booted once.
   *
   * @param {(string|ClassOrAbstractClass)} [identifier] - The service ID or the service class.
   * @returns {Promise<void>}
   * @memberof ServiceManager
   */
  async boot(identifier?: string|ClassOrAbstractClass): Promise<void> {
    if (typeof identifier !== 'undefined') {
      const identifierName = this.getIdentifierName(identifier);
      this.logInfo(`Booting service: ${identifierName}`);

      const value = this.map.get(identifier);
      if (!value) {
        throw new Error(`No service was found with the identifier "${identifier}".`);
      }
      // Ensure service is instantiated before booting
      if (value.target && !value.service) {
        this.logDebug(`Instantiating ${identifierName} before boot`);
        this.get(identifier as any);
      }
      await this.bootService(value);
      this.logDebug(`Boot completed for ${identifierName}`);
    } else {
      this.logInfo('Booting all registered services...');
      const promises: Promise<void>[] = [];
      for (const [key, value] of this.map.entries()) {
        const keyName = this.getIdentifierName(key);
        // Ensure service is instantiated before booting
        if (value.target && !value.service) {
          this.logDebug(`Instantiating ${keyName} before boot`);
          this.get(key as any);
        }
        promises.push(this.bootService(value));
      }
      await Promise.all(promises);
      this.initialized = true;
      this.logInfo(`Boot completed. ${this.map.size} services initialized.`);
    }
  }

  /**
   * Register a service for lazy initialization.
   *
   * @param {string} identifier - The service ID.
   * @param {Class|ServiceFactory<any>} target - The service class or factory.
   * @param {{ boot?: boolean, init?: boolean }} [options] - Options for registration.
   * @returns {this} The service manager.
   * @memberof ServiceManager
   */
  register(identifier: string, target: Class|ServiceFactory<any>, options?: { boot?: boolean, init?: boolean }): this;
  /**
   * Register a service for lazy initialization.
   *
   * @template T
   * @param {ClassOrAbstractClass<T>} identifier - The service class.
   * @param {Class<T>|ServiceFactory<T>} target - The service class or factory.
   * @param {{ boot?: boolean, init?: boolean }} [options] - Options for registration.
   * @returns {this} The service manager.
   * @memberof ServiceManager
   */
  register<T>(identifier: ClassOrAbstractClass<T>, target: Class<T>|ServiceFactory<T>, options?: { boot?: boolean, init?: boolean }): this;
  /**
   * Register a service for lazy initialization.
   *
   * @param {ClassOrAbstractClass} identifierOrTarget - The service class (when used without a separate target).
   * @param {{ boot?: boolean, init?: boolean }} [options] - Options for registration.
   * @returns {this} The service manager.
   * @memberof ServiceManager
   */
  register(identifierOrTarget: ClassOrAbstractClass, options?: { boot?: boolean, init?: boolean }): this;
  register(
    identifierOrTarget: string|ClassOrAbstractClass,
    targetOrOptions?: Class|ServiceFactory<any>|{ boot?: boolean, init?: boolean },
    options?: { boot?: boolean, init?: boolean }
  ): this {
    let identifier: string|ClassOrAbstractClass;
    let target: Class|ServiceFactory<any>;
    let opts: { boot?: boolean, init?: boolean } = {};

    // Parse arguments based on their types and count
    if (arguments.length === 3) {
      // Case: register(identifier, target, options)
      identifier = identifierOrTarget;
      target = targetOrOptions as Class|ServiceFactory<any>;
      opts = options || {};
    } else if (arguments.length === 2 && typeof targetOrOptions === 'function') {
      // Case: register(identifier, Class)
      identifier = identifierOrTarget;
      target = targetOrOptions as Class;
      opts = {};
    } else if (arguments.length === 2 && targetOrOptions instanceof ServiceFactory) {
      // Case: register(identifier, factory)
      identifier = identifierOrTarget;
      target = targetOrOptions;
      opts = {};
    } else if (arguments.length === 2 && typeof targetOrOptions === 'object') {
      // Case: register(target, options)
      identifier = identifierOrTarget;
      target = identifierOrTarget as Class;
      opts = targetOrOptions as { boot?: boolean, init?: boolean };
    } else {
      // Case: register(target) with no options
      identifier = identifierOrTarget;
      target = identifierOrTarget as Class;
    }

    // Set defaults
    if (opts.boot === undefined) {
      opts.boot = true;
    }

    const identifierName = this.getIdentifierName(identifier);
    const targetName = target instanceof ServiceFactory ? 'ServiceFactory' : (target as any).name || 'UnknownClass';

    if (opts.init) {
      // Immediate initialization
      this.logInfo(`Registering ${identifierName} -> ${targetName} (immediate initialization)`);
      const service = this.get(target as any);
      this.map.set(identifier, {
        boot: false, // Already handled during get
        service
      });
      this.logDebug(`${identifierName} instantiated immediately`);
    } else {
      // Lazy initialization
      this.logInfo(`Registering ${identifierName} -> ${targetName} (lazy, boot=${opts.boot})`);
      this.map.set(identifier, {
        boot: opts.boot,
        target
      });
    }

    return this;
  }

  /**
   * Add manually a service to the identity mapper.
   *
   * @param {string|ClassOrAbstractClass} identifier - The service ID or the service class.
   * @param {*} service - The service object (or mock).
   * @param {{ boot: boolean }} [options={ boot: false }] If `boot` is true, the service method "boot"
   * will be executed when calling `ServiceManager.boot` is called.
   * @returns {this} The service manager.
   * @memberof ServiceManager
   */
  set(identifier: string|ClassOrAbstractClass, service: any, options: { boot: boolean } = { boot: false }): this {
    const identifierName = this.getIdentifierName(identifier);
    const serviceName = service?.constructor?.name || 'instance';
    this.logInfo(`Setting ${identifierName} = ${serviceName} (boot=${options.boot})`);

    this.map.set(identifier, {
      boot: options.boot,
      service,
    });
    return this;
  }

  /**
   * Get (and create if necessary) the service singleton.
   *
   * @param {string|ClassOrAbstractClass} identifier - The service ID or the service class.
   * @returns {*} - The service instance.
   * @memberof ServiceManager
   */
  get<T>(identifier: ClassOrAbstractClass<T> | ServiceFactory<T>, context?: { parentClass?: string, propertyKey?: string }): T;
  get(identifier: string, context?: { parentClass?: string, propertyKey?: string }): any;
  get(identifier: string|ClassOrAbstractClass|ServiceFactory<any>, context?: { parentClass?: string, propertyKey?: string }): any {
    const identifierName = this.getIdentifierName(identifier);

    // Validate identifier is not undefined/null
    if (identifier === undefined || identifier === null) {
      const contextMsg = context
        ? ` while resolving dependency "${context.propertyKey}" in ${context.parentClass}`
        : '';
      throw new Error(
        `Cannot resolve service: identifier is ${identifier}${contextMsg}. ` +
        `This usually happens when:\n` +
        `  1. The dependency class is not properly imported\n` +
        `  2. There's a circular dependency between modules\n` +
        `  3. The TypeScript compiler option "emitDecoratorMetadata" is not enabled\n` +
        `  4. The dependency type is an interface (interfaces don't exist at runtime)`
      );
    }

    // Track resolution chain for debug mode
    const parentInfo = context ? `${context.parentClass}.${context.propertyKey}` : 'root';
    this.resolutionStack.push(identifierName);
    this.resolutionDepth++;

    if (context) {
      this.logDebug(`Resolving ${identifierName} (requested by ${parentInfo})`);
    } else {
      this.logDebug(`Resolving ${identifierName}`);
    }

    try {
      // @ts-ignore : Type 'ServiceManager' is not assignable to type 'Service'.
      if (identifier === ServiceManager || identifier.isServiceManager === true) {
        this.logDebug(`Returning ServiceManager instance`);
        // @ts-ignore : Type 'ServiceManager' is not assignable to type 'Service'.
        return this;
      }

      // Get the service if it exists.
      const value = this.map.get(identifier);
      if (value) {
        // Handle lazy initialization
        if (value.target && !value.service) {
          this.logInfo(`Creating ${identifierName} (lazy initialization triggered)`);
          const [serviceClass, service] = this.instantiateService(value.target);
          value.service = service;
          this.logDebug(`Injecting dependencies into ${identifierName}`);
          this.injectDependencies(serviceClass, service);

          // Boot immediately if initialized and boot is true
          if (this.initialized && value.boot && service.boot) {
            this.logDebug(`Executing boot() for ${identifierName}`);
            const result = service.boot();
            if (result && typeof result.then === 'function') {
              throw new Error(
                `Lazy initialized services must not have async 'boot' hooks: ${identifierName}`
              );
            }
            value.boot = false;
          }

          value.target = undefined;
          this.logDebug(`${identifierName} ready`);
        } else {
          this.logDebug(`${identifierName} found in cache`);
        }
        return value.service;
      }

      // Throw an error if the identifier is a string and no service was found in the map.
      if (typeof identifier === 'string') {
        throw new Error(`No service was found with the identifier "${identifier}".`);
      }

      if (!(identifier instanceof ServiceFactory) && identifier.hasOwnProperty('concreteClassConfigPath')) {
        this.logDebug(`${identifierName} has concreteClassConfigPath, resolving from config`);
        const concreteClass = this.getConcreteClassFromConfig(identifier);
        return this.get(concreteClass);
      }

      // If the service has not been instantiated yet then do it.
      this.logInfo(`Creating ${identifierName} (first access)`);
      const [serviceClass, service] = this.instantiateService(identifier as Class|ServiceFactory<any>);

      this.logDebug(`Injecting dependencies into ${identifierName}`);
      this.injectDependencies(serviceClass, service);

      // Save the service using the identifier (could be a factory or a class).
      this.map.set(identifier, {
        boot: true,
        service,
      });

      this.logDebug(`${identifierName} ready and cached`);
      return service;
    } finally {
      this.resolutionStack.pop();
      this.resolutionDepth--;
    }
  }

  private instantiateService(target: Class|ServiceFactory<any>): [Class, any] {
    if (target instanceof ServiceFactory) {
      this.logDebug(`Invoking ServiceFactory.create()`);
      return target.create(this);
    } else {
      const className = (target as any).name || 'UnknownClass';
      this.logDebug(`Instantiating new ${className}()`);
      return [target, new target()];
    }
  }

  private injectDependencies(serviceClass: Class, service: any): void {
    const dependencies: IDependency[] = Reflect.getMetadata('dependencies', serviceClass.prototype) || [];
    const serviceClassName = serviceClass.name || 'UnknownService';

    for (const dependency of dependencies) {
      // Validate the dependency identifier
      if (dependency.serviceClassOrID === undefined || dependency.serviceClassOrID === null) {
        throw new Error(
          `Cannot resolve dependency "${dependency.propertyKey}" in ${serviceClassName}: ` +
          `the service type is undefined. ` +
          `This usually happens when:\n` +
          `  1. The dependency class is not properly imported\n` +
          `  2. There's a circular dependency between modules\n` +
          `  3. The TypeScript compiler option "emitDecoratorMetadata" is not enabled\n` +
          `  4. The dependency type is an interface (interfaces don't exist at runtime)`
        );
      }
      (service as any)[dependency.propertyKey] = this.get(
        dependency.serviceClassOrID as any,
        { parentClass: serviceClassName, propertyKey: dependency.propertyKey }
      );
    }

    // Inject ServiceManager into @lazy decorated properties
    const lazyDependencies: ILazyDependency[] = Reflect.getMetadata('lazyDependencies', serviceClass.prototype) || [];
    for (const lazyDep of lazyDependencies) {
      // Check if property already has a value (manually set LazyService)
      const propertyValue = (service as any)[lazyDep.propertyKey];

      // If it's already a LazyService, inject ServiceManager
      if (propertyValue instanceof LazyService) {
        injectLazyService(this, propertyValue);
      } else if (lazyDep.serviceType && !propertyValue) {
        // Validate the lazy dependency type
        if (lazyDep.serviceType === undefined || lazyDep.serviceType === null) {
          throw new Error(
            `Cannot resolve lazy dependency "${lazyDep.propertyKey}" in ${serviceClassName}: ` +
            `the service type is undefined. ` +
            `Make sure to use @lazy(ServiceClass) with an explicit class reference.`
          );
        }

        // For @lazy(ServiceClass) with getter, define property on instance
        if (lazyDep.serviceType !== LazyService && lazyDep.serviceType !== Object) {
          const cacheKey = Symbol(`__lazy_cache_${lazyDep.propertyKey}`);
          const sm = this;

          // Define property with getter on the instance
          Object.defineProperty(service, lazyDep.propertyKey, {
            get() {
              // Return cached value if available
              if ((this as any)[cacheKey] !== undefined) {
                return (this as any)[cacheKey];
              }

              // Resolve the service on first access and cache it
              (this as any)[cacheKey] = sm.get(lazyDep.serviceType);
              return (this as any)[cacheKey];
            },
            enumerable: true,
            configurable: true
          });
        }
      }
    }
  }

  private async bootService(value: ServiceEntry): Promise<void> {
    if (value.boot && value.service && value.service.boot) {
      const serviceName = value.service.constructor?.name || 'UnknownService';
      this.logDebug(`Executing boot() for ${serviceName}`);
      value.boot = false;
      await value.service.boot();
      this.logDebug(`boot() completed for ${serviceName}`);
    }
  }

  private getConcreteClassFromConfig(cls: ClassOrAbstractClass<any>): any {
    const concreteClassConfigPath: string = this.getProperty(
      cls,
      'concreteClassConfigPath',
      'string',
    );

    const concreteClassName: string = this.getProperty(
      cls,
      'concreteClassName',
      'string',
    );

    let concreteClassPath: string;
    if (cls.hasOwnProperty('defaultConcreteClassPath')) {
      concreteClassPath = Config.get(concreteClassConfigPath, 'string', 'local');
    } else {
      concreteClassPath = Config.getOrThrow(concreteClassConfigPath, 'string');
    }

    let prettyConcreteClassPath: string | undefined;

    if (concreteClassPath === 'local') {
      concreteClassPath = this.getProperty(
        cls,
        'defaultConcreteClassPath',
        'string',
        `[CONFIG] ${cls.name} does not support the "local" option in ${concreteClassConfigPath}.`
      );
    } else if (concreteClassPath.startsWith('./')) {
      prettyConcreteClassPath = concreteClassPath;
      concreteClassPath = join(process.cwd(), 'build', concreteClassPath);
    }

    prettyConcreteClassPath = prettyConcreteClassPath || concreteClassPath;

    let pkg: any;
    try {
      pkg = require(concreteClassPath);
    } catch (err: any) {
      // TODO: test this line.
      if (err.code !== 'MODULE_NOT_FOUND') {
        throw err;
      }
      throw new Error(`[CONFIG] The package or file ${prettyConcreteClassPath} was not found.`);
    }

    const concreteClass = this.getProperty(
      pkg,
      concreteClassName,
      'function',
      `[CONFIG] ${prettyConcreteClassPath} is not a valid package or file for ${cls.name}:`
        + ` class ${concreteClassName} not found.`,
      `[CONFIG] ${prettyConcreteClassPath} is not a valid package or file for ${cls.name}:`
        + ` ${concreteClassName} is not a class.`
    );

    return concreteClass;
  }

  private getProperty(obj: any, propertyKey: string, type: string, notFoundMsg?: string, typeMsg?: string): any {
    if (!obj.hasOwnProperty(propertyKey)) {
      throw new Error(notFoundMsg || `[CONFIG] ${obj.name}.${propertyKey} is missing.`);
    }

    const property = (obj as any)[propertyKey];
    if (typeof property !== type) {
      throw new Error(typeMsg || `[CONFIG] ${obj.name}.${propertyKey} should be a ${type}.`);
    }

    return property;
  }

}

/**
 * Helper function to inject dependencies into a LazyService instance.
 */
const injectLazyService = (sm: ServiceManager, l: LazyService<any>) =>
  (Reflect.getMetadata('dependencies', Object.getPrototypeOf(l)) as IDependency[] | undefined)
    ?.forEach(d => ((l as any)[d.propertyKey] = sm.get(d.serviceClassOrID as any)));

/**
 * Lazy-loading wrapper for services with optional transformation.
 * Provides deferred service resolution with caching.
 *
 * @export
 */
export class LazyService<T, V extends T = T> {
  @dependency private sm!: ServiceManager;
  private c?: V;

  constructor(
    readonly type: ClassOrAbstractClass<T>,
    private readonly tx?: (v: T) => V
  ) {}

  /**
   * Get the lazy-loaded service instance.
   * The service is resolved and cached on first access.
   */
  get value(): V {
    return (
      this.c ??
      (this.c = (() => {
        const v = this.sm.get(this.type);
        if (!v) {
          throw new Error(`Unable to resolve service: ${this.type.name}`);
        }
        const r = this.tx ? this.tx(v) : (v as any);
        if (!r) {
          throw new Error(`Invalid transform: ${this.type.name}`);
        }
        return r;
      })())
    );
  }

  /**
   * Boot all LazyService instances within a service.
   * Injects the ServiceManager into any LazyService properties.
   *
   * @template T
   * @param {ServiceManager} sm - The service manager.
   * @param {T} s - The service instance.
   * @returns {T} The service instance.
   */
  static boot<T>(sm: ServiceManager, s: T): T {
    Object.values(s as any).forEach(v => v instanceof LazyService && injectLazyService(sm, v));
    return s;
  }
}

