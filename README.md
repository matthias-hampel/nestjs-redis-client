# nestjs-redis-client

![NPM Last Update](https://img.shields.io/npm/last-update/nestjs-redis-client)
![GitHub License](https://img.shields.io/github/license/matthias-hampel/nestjs-redis-client)

## Description

Redis client module for NestJS.

## Usage

### Install

In your NestJS application:

```bash
npm install nestjs-redis-client
```

Ensure peer dependencies match your app: `@nestjs/common`, `@nestjs/core`, and `@nestjs/platform-express` (see `package.json` in this repo for supported versions). The `redis` driver is bundled with this package.

### Register the module

**Synchronous configuration** — pass a Redis URL and optional [`RedisClientOptions`](https://github.com/redis/node-redis/blob/master/docs/client-configuration.md) from the `redis` package:

```typescript
import { Module } from "@nestjs/common";
import { RedisModule } from "nestjs-redis-client";

@Module({
  imports: [
    RedisModule.register({
      url: process.env.REDIS_URL ?? "redis://localhost:6379",
      database: 2,
      // Optional: socket, TLS, etc.
      // clientOptions: { socket: { reconnectStrategy: () => 1000 } },
      isGlobal: true,
    }),
  ],
})
export class AppModule {}
```

**Async configuration** — typical pattern with `ConfigModule` and a factory (install `@nestjs/config` in your app if you use this):

```typescript
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RedisModule } from "nestjs-redis-client";

@Module({
  imports: [
    ConfigModule.forRoot(),
    RedisModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        url: config.getOrThrow<string>("REDIS_URL"),
        isGlobal: true,
      }),
    }),
  ],
})
export class AppModule {}
```

- **`isGlobal: true`** — makes the Redis provider available in every module without re-importing `RedisModule`.
- Omit `isGlobal` or set `false` if you only want Redis in modules that import `RedisModule` (or a module that re-exports it).

### Inject the client

The module provides a connected [`RedisClientType`](https://github.com/redis/node-redis) instance. Use the `InjectRedis` decorator (or `@Inject(REDIS_CLIENT)`):

```typescript
import { Injectable } from "@nestjs/common";
import type { RedisClientType } from "redis";
import { InjectRedis } from "nestjs-redis-client";

@Injectable()
export class CacheService {
  constructor(@InjectRedis() private readonly redis: RedisClientType) {}

  async get(key: string): Promise<string | undefined> {
    return this.redis.get(key);
  }
}
```

### Multiple Redis connections

Give each connection a **`name`** when registering. Inject the matching name:

```typescript
// App module
RedisModule.register({ name: "cache", url: "redis://localhost:6379/0", isGlobal: true }),
RedisModule.register({ name: "sessions", url: "redis://localhost:6379/1", isGlobal: true }),

// Service
import { InjectRedis } from "nestjs-redis-client";

@Injectable()
export class SessionStore {
  constructor(@InjectRedis("sessions") private readonly redis: RedisClientType) {}
}
```

For custom tokens in tests or advanced wiring, use `getRedisToken("cache")` or the default export constant `REDIS_CLIENT` for the default client name (`default`).

### Shutdown

The module registers an `OnApplicationShutdown` hook that calls `quit()` on the client when the Nest application shuts down, so connections close cleanly.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## License

This project is [MIT licensed](https://github.com/matthias-hampel/nestjs-redis-client/blob/main/LICENSE).
