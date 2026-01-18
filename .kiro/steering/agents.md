# Faulty S - Módulo Core Focus

## Contexto del Proyecto

Este repositorio es una versión especial de **FoalTS** (Faulty S) donde estamos trabajando exclusivamente en modificaciones al módulo `packages/core`. El objetivo principal es integrar mejoras avanzadas de inyección de dependencias basadas en una implementación personalizada.

## Área de Trabajo Principal

**Directorio principal**: `packages/core/src/core/`

### Archivos Clave Modificados

1. **`service-manager.ts`** - Contiene las mejoras principales:
   - `ServiceFactory<T>` - Clase para crear servicios con lógica de inicialización personalizada
   - `LazyService<T, V>` - Wrapper para resolución diferida de servicios con caché
   - `@lazy` decorator - Decorador para propiedades de servicios lazy-loaded
   - `register()` method - Método para pre-registrar servicios con inicialización lazy o inmediata

2. **`service-manager.spec.ts`** - Tests para las nuevas funcionalidades

3. **`index.ts`** - Exports actualizados (`ServiceFactory`, `LazyService`, `lazy`)

## Capacidades de Inyección de Dependencias

El ServiceManager soporta múltiples estrategias de mapeo para inyección de dependencias:

### 1. Mapeo con `set()` - Instancias Pre-creadas

El método `set()` permite mapear identificadores a instancias ya creadas. Útil para:
- Inyectar mocks en tests
- Usar instancias configuradas externamente
- Mapear interfaces/clases abstractas a implementaciones concretas

```typescript
// Mapear clase a instancia pre-creada
const dbConnection = new DatabaseConnection(config);
sm.set(DatabaseConnection, dbConnection);

// Mapear interfaz/clase abstracta a implementación concreta
abstract class ILogger { abstract log(msg: string): void; }
const consoleLogger = new ConsoleLogger();
sm.set(ILogger, consoleLogger);

// Mapear string ID a instancia
sm.set('database', dbConnection);

// Con opción de boot (ejecutar boot() en el servicio)
sm.set(CacheService, new RedisCache(), { boot: true });
```

### 2. Mapeo con `register()` - Inicialización Lazy/Diferida

El método `register()` permite pre-registrar servicios para inicialización lazy o inmediata:

```typescript
// Registro simple (lazy por defecto)
sm.register(UserService);

// Mapear interfaz a clase concreta (lazy)
sm.register(IRepository, PostgresRepository);

// Mapear string ID a clase
sm.register('auth-service', AuthService);

// Inicialización inmediata
sm.register(CacheService, { init: true });

// Sin ejecutar boot()
sm.register(LogService, { boot: false });

// Combinación de opciones
sm.register(IDatabase, MySQLDatabase, { init: true, boot: false });
```

### 3. Mapeo con ServiceFactory - Lógica de Creación Personalizada

ServiceFactory permite control total sobre la creación del servicio:

```typescript
// Factory con acceso al ServiceManager para resolver dependencias
const dbFactory = new ServiceFactory<DatabaseService>((sm: ServiceManager) => {
  const config = sm.get(ConfigService);
  const logger = sm.get(LoggerService);
  const instance = new DatabaseService(config.dbUrl, logger);
  return [DatabaseService, instance];
});

// Registrar factory con string ID
sm.register('database', dbFactory);

// Registrar factory mapeando interfaz
sm.register(IDatabase, dbFactory);

// Usar factory directamente en get()
const db = sm.get(dbFactory);
```

### 4. LazyService - Resolución Diferida con Caché

Wrapper para propiedades que se resuelven en el primer acceso:

```typescript
class EstimateController {
  // Se resuelve cuando se accede a .value
  private employeeDao = new LazyService(EmployeeDao);
  
  // Con transformación opcional
  private cache = new LazyService(CacheService, (c) => c.getNamespace('estimates'));
  
  async getEstimate() {
    const employees = await this.employeeDao.value.getAll();
    return this.cache.value.get('key');
  }
}

// Inicializar LazyServices (inyecta ServiceManager)
const controller = new EstimateController();
LazyService.boot(serviceManager, controller);
```

### 5. @lazy Decorator - Propiedades Lazy Automáticas

```typescript
class MyService {
  // Resuelve OtherService en primer acceso
  @lazy(OtherService) otherService!: OtherService;
  
  // Inferencia de tipo (requiere emitDecoratorMetadata)
  @lazy anotherService!: AnotherService;
}
```

## Resumen de Métodos de Mapeo

| Método | Identificador | Target | Inicialización | Uso Principal |
|--------|---------------|--------|----------------|---------------|
| `set()` | string \| Class | Instancia | Inmediata | Mocks, instancias pre-configuradas |
| `register()` | string \| Class | Class | Lazy/Inmediata | Mapeo interfaz→implementación |
| `register()` | string \| Class | ServiceFactory | Lazy | Creación con lógica personalizada |
| `get()` | ServiceFactory | - | Inmediata | Uso directo de factory |

## Suites de Tests Personalizados

Archivo: `packages/core/src/core/service-manager.spec.ts`

### Tests de Funcionalidades Personalizadas (Líneas ~850-1355)

| Suite | Tests | Descripción |
|-------|-------|-------------|
| `when "register" is called` | 6 | Registro lazy, string ID, opciones boot/init, ServiceFactory |
| `ServiceFactory integration` | 2 | Factory en get(), caché de servicios |
| `lazy initialization` | 3 | Async boot error, sync boot inmediato, boot false |
| `LazyService` | 5 | Resolución lazy, caché, transformación, error transform, múltiples instancias |
| `@lazy decorator` | 12 | Inyección automática, múltiples props, transformación, herencia, caché, sintaxis directa `@lazy(ServiceClass)`, verificación lazy loading |
| `@lazy decorator with mixed dependencies` | 5 | Escenarios reales: eager+lazy combinados, ServiceFactory, dependencias anidadas, caché, set() |

### Comandos para Ejecutar Tests Específicos

```bash
# Todos los tests del ServiceManager
cd packages/core && npm test -- --grep "ServiceManager"

# Solo tests de register()
cd packages/core && npm test -- --grep "register"

# Solo tests de ServiceFactory
cd packages/core && npm test -- --grep "ServiceFactory"

# Solo tests de LazyService
cd packages/core && npm test -- --grep "LazyService"

# Solo tests del decorador @lazy
cd packages/core && npm test -- --grep "@lazy decorator"

# Tests de lazy initialization
cd packages/core && npm test -- --grep "lazy initialization"
```

### Tests Clave a Mantener

1. **`should verify lazy loading - service created only on first access`** (línea ~1310)
   - Verifica que el servicio NO se crea durante la instanciación del controlador
   - Verifica que el servicio SÍ se crea en el primer acceso a la propiedad

2. **`should throw error if lazy service has async boot hook after initialized`** (línea ~870)
   - Previene boot hooks async en servicios lazy post-inicialización

3. **`should support ServiceFactory for service creation`** (línea ~860)
   - Valida integración de factories con register()

4. **`should work with direct service reference using @lazy(ServiceClass)`** (línea ~1200)
   - Sintaxis simplificada sin wrapper LazyService

## Documentación de Referencia

- **Patch principal**: `fragmentation/service-manager-enhancements.md`
- **Sistema de fragmentación**: `fragmentation/README.md`

## Comandos de Desarrollo

```bash
# Build del módulo core
cd packages/core && npm run build

# Tests del ServiceManager
cd packages/core && npm test -- --grep "ServiceManager"

# Linting
cd packages/core && npm run lint
```

## Reglas de Desarrollo

1. **Solo modificar `packages/core`** - No tocar otros paquetes
2. **Mantener compatibilidad hacia atrás** - Las APIs existentes deben seguir funcionando
3. **Documentar cambios** - Actualizar `fragmentation/service-manager-enhancements.md` con nuevos commits
4. **Tests obligatorios** - Toda nueva funcionalidad debe tener cobertura de tests
5. **TypeScript estricto** - Mantener tipado fuerte en todas las implementaciones

## Proceso de Incremento de Versión

Al incrementar la versión de `@unlimitechcloud/foalts.core`, se deben actualizar las referencias en todos los paquetes que dependen de él.

### Archivos a Actualizar

1. **`packages/core/package.json`** - Versión principal
2. **Otros paquetes** - Actualizar la referencia `@foal/core` en:
   - `packages/*/package.json` (todos los paquetes: jwt, typeorm, graphql, etc.)
   - `packages/cli/package.json`
   - `packages/cli/specs/app/*.json`
   - `packages/cli/fixtures/*/package*.json`
   - `packages/cli/templates/app/package*.json`
   - `examples/demo-app/package.json`
   - `tests/*/package.json`

### Comando para Buscar Referencias

```bash
# Buscar todas las referencias a la versión actual
grep -r "5.1.1005" --include="package.json" .
```

### Comando para Actualizar (sed)

```bash
# Reemplazar versión antigua por nueva en todos los package.json
find . -name "package.json" -exec sed -i 's/5.1.1005/5.1.1006/g' {} \;
```

### Después de Actualizar

```bash
# Regenerar package-lock.json
npm install

# Verificar que los tests pasen
npx lerna run test
```

## Estado Actual

- Base: FoalTS 5.1.1
- Branch activo: `copilot/analyze-custom-service-manager`
- Funcionalidades implementadas:
  - ✅ ServiceFactory
  - ✅ LazyService
  - ✅ @lazy decorator
  - ✅ register() method
  - ✅ Tracking de estado de inicialización
  - ✅ Sistema de logging para debug

## Sistema de Logging

El ServiceManager usa el `Logger` de FoalTS para debugging. El logging está deshabilitado por defecto y solo se activa con `debug: true`.

### Configuración

```typescript
// Sin logging (por defecto)
const sm = new ServiceManager();

// Habilitar debug logging
const sm = new ServiceManager({ debug: true });
```

### Control de Nivel de Log

El nivel de log se controla via configuración estándar de FoalTS:

```yaml
# config/default.yml
settings:
  logger:
    logLevel: debug  # debug, info, warn, error
    format: raw      # raw, dev, json, none
```

### Niveles de Log

| Nivel Logger | Output ServiceManager |
|--------------|----------------------|
| `debug` | Cadena de resolución completa con indentación |
| `info` | Creación de servicios, registro, boot |
| `warn` | Advertencias (ej: metadata faltante) |
| `error` | Solo errores |

### Tests de Logging

```bash
# Ejecutar tests de logging
cd packages/core && npm test -- --grep "logging"
```
