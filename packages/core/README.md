<p align="center">
  <a href="https://foalts.org" target="blank">
    <img src="https://raw.githubusercontent.com/FoalTS/foal/master/docs/static/img/logo.png" alt="Logo" />
  </a>
  <br>
</p>

## What is Foal?

*Foal* (or *FoalTS*) is a Node.JS framework for creating web applications.

It provides a set of ready-to-use components so you don't have to reinvent the wheel every time. In one single place, you have a complete environment to build web applications. This includes a CLI, testing tools, frontend utilities, scripts, advanced authentication, ORM, deployment environments, GraphQL and Swagger API, AWS utilities, and more. You no longer need to get lost on npm searching for packages and making them work together. All is provided.

But while offering all these features, the framework remains simple. Complexity and unnecessary abstractions are put aside to provide the most intuitive and expressive syntax. We believe that concise and elegant code is the best way to develop an application and maintain it in the future. It also allows you to spend more time coding rather than trying to understand how the framework works.

Finally, the framework is entirely written in TypeScript. The language brings you optional static type-checking along with the latest ECMAScript features. This allows you to detect most silly errors during compilation and improve the quality of your code. It also offers you autocompletion and a well documented API.

<p align="center">
  <a href="https://foalts.org">https://foalts.org</a>
</p>

---

## Advanced Dependency Injection

This version of `@foal/core` includes enhanced dependency injection capabilities through the `ServiceManager`.

### Quick Reference

| Method | Use Case |
|--------|----------|
| `@dependency` | Eager injection (immediate) |
| `@lazy(ServiceClass)` | Lazy injection (on first access) |
| `set()` | Pre-configured instances |
| `register()` | Lazy registration with options |
| `ServiceFactory` | Custom creation logic |

### Basic Dependency Injection

```typescript
import { dependency, ServiceManager } from '@foal/core';

class Logger {
  log(msg: string) { console.log(msg); }
}

class UserService {
  @dependency
  logger: Logger;

  createUser(name: string) {
    this.logger.log(`Creating user: ${name}`);
  }
}

const sm = new ServiceManager();
const userService = sm.get(UserService);
userService.createUser('John'); // Logger is automatically injected
```

### Lazy Dependency Injection with `@lazy`

The `@lazy` decorator defers service creation until first access. This optimizes startup time and memory usage.

```typescript
import { dependency, lazy, ServiceManager } from '@foal/core';

class ExpensiveService {
  constructor() {
    console.log('ExpensiveService created'); // Only when accessed
  }
  process() { return 'done'; }
}

class MyController {
  @dependency
  logger: Logger;  // Created immediately

  @lazy(ExpensiveService)
  expensive!: ExpensiveService;  // Created on first access

  simpleOperation() {
    this.logger.log('Simple');  // ExpensiveService NOT created
  }

  complexOperation() {
    return this.expensive.process();  // ExpensiveService created HERE
  }
}

const sm = new ServiceManager();
const controller = sm.get(MyController);

controller.simpleOperation();  // ExpensiveService still not created
controller.complexOperation(); // NOW ExpensiveService is created
```

### Pre-configured Instances with `set()`

Use `set()` to register pre-configured instances or mocks:

```typescript
import { ServiceManager } from '@foal/core';

// Map class to pre-configured instance
const dbConnection = new DatabaseConnection('postgres://localhost/mydb');
sm.set(DatabaseConnection, dbConnection);

// Map abstract class/interface to concrete implementation
abstract class ILogger { abstract log(msg: string): void; }
sm.set(ILogger, new ConsoleLogger());

// Map string identifier to instance
sm.set('config', { apiKey: 'secret', env: 'production' });

// With boot option (executes boot() method on ServiceManager.boot())
sm.set(CacheService, new RedisCache(), { boot: true });
```

### Lazy Registration with `register()`

Use `register()` to pre-register services for lazy or immediate initialization:

```typescript
import { ServiceManager } from '@foal/core';

const sm = new ServiceManager();

// Lazy registration (default) - created on first get()
sm.register(UserService);

// Map interface to concrete class
sm.register(IRepository, PostgresRepository);

// Map string identifier to class
sm.register('auth-service', AuthService);

// Immediate initialization
sm.register(CacheService, { init: true });

// Skip boot() method
sm.register(LogService, { boot: false });

// Combined options
sm.register(IDatabase, MySQLDatabase, { init: true, boot: false });
```

### Custom Creation with `ServiceFactory`

Use `ServiceFactory` for complex initialization logic:

```typescript
import { ServiceManager, ServiceFactory } from '@foal/core';

class DatabaseService {
  constructor(public url: string, public logger: Logger) {}
  query(sql: string) { /* ... */ }
}

// Factory with access to ServiceManager for resolving dependencies
const dbFactory = new ServiceFactory<DatabaseService>((sm: ServiceManager) => {
  const config = sm.get(ConfigService);
  const logger = sm.get(Logger);
  const instance = new DatabaseService(config.dbUrl, logger);
  return [DatabaseService, instance];
});

const sm = new ServiceManager();

// Register factory with string identifier
sm.register('database', dbFactory);

// Or map interface to factory
sm.register(IDatabase, dbFactory);

// Get service - factory is called on first access
const db = sm.get('database');
db.query('SELECT * FROM users');
```

### LazyService Wrapper (Advanced)

For more control, use the `LazyService` wrapper with optional transformation:

```typescript
import { LazyService, ServiceManager } from '@foal/core';

class MyController {
  // Basic lazy service
  private userDao = new LazyService(UserDao);

  // With transformation
  private cache = new LazyService(
    CacheService,
    (cache) => cache.getNamespace('users')
  );

  async getUser(id: string) {
    const cached = await this.cache.value.get(id);
    if (cached) return cached;
    return this.userDao.value.findById(id);
  }
}

// Initialize LazyService instances
const sm = new ServiceManager();
const controller = new MyController();
LazyService.boot(sm, controller);
```

### Boot Lifecycle

Services can implement a `boot()` method for async initialization:

```typescript
class DatabaseService {
  private connection: Connection;

  async boot() {
    this.connection = await createConnection();
    console.log('Database connected');
  }
}

const sm = new ServiceManager();
sm.get(DatabaseService);

// Boot all services
await sm.boot();

// Or boot specific service
await sm.boot(DatabaseService);
```

### Testing with Mocks

```typescript
import { createService, ServiceManager } from '@foal/core';

class UserService {
  @dependency
  database: DatabaseService;

  async getUser(id: string) {
    return this.database.query(`SELECT * FROM users WHERE id = ?`, [id]);
  }
}

// Option 1: Using createService with mock dependencies
const mockDb = { query: async () => ({ id: '1', name: 'Test' }) };
const userService = createService(UserService, { database: mockDb });

// Option 2: Using ServiceManager.set()
const sm = new ServiceManager();
sm.set(DatabaseService, mockDb);
const userService = sm.get(UserService);
```

### Summary

| Feature | Decorator/Method | When Created | Use Case |
|---------|------------------|--------------|----------|
| Eager injection | `@dependency` | Immediately | Always-needed dependencies |
| Lazy injection | `@lazy(Class)` | First access | Optional/expensive dependencies |
| Pre-configured | `set()` | Already created | Mocks, external instances |
| Lazy registration | `register()` | First `get()` | Interface→implementation mapping |
| Custom creation | `ServiceFactory` | First `get()` | Complex initialization logic |
