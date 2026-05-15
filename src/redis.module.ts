import { DynamicModule, Inject, InjectionToken, Logger, Module, OnApplicationShutdown, OptionalFactoryDependency, Type } from "@nestjs/common";
import { createClient, RedisClientOptions, type RedisClientType } from "redis";

export const DEFAULT_REDIS_NAME = "default";

export function getRedisToken(name: string = DEFAULT_REDIS_NAME): string {
  return `REDIS_CLIENT:${name}`;
}

export const REDIS_CLIENT = getRedisToken();
export const InjectRedis = (name?: string): ParameterDecorator => Inject(getRedisToken(name));

export interface RedisModuleOptions {
  name?: string;
  url?: string;
  database?: number;
  clientOptions?: RedisClientOptions;
  isGlobal?: boolean;
}

export interface RedisModuleAsyncOptions {
  name?: string;
  imports?: NonNullable<DynamicModule["imports"]>;
  inject?: (InjectionToken | OptionalFactoryDependency)[];
  /** Args match resolved `inject` tokens (same typing model as Nest `FactoryProvider["useFactory"]`). */
  // biome-ignore lint/suspicious/noExplicitAny: inject tokens resolve to instances; cannot correlate token types to param types in TS
  useFactory: (...args: any[]) => Promise<RedisModuleOptions> | RedisModuleOptions;
  isGlobal?: boolean;
}

function createShutdownProvider(token: string): Type<OnApplicationShutdown> {
  class RedisShutdownService implements OnApplicationShutdown {
    constructor(@Inject(token) private readonly client: RedisClientType) {}

    async onApplicationShutdown(): Promise<void> {
      if (this.client.isOpen) {
        await this.client.quit();
      }
    }
  }

  Object.defineProperty(RedisShutdownService, "name", {
    value: `RedisShutdownService:${token}`,
  });

  return RedisShutdownService;
}

@Module({})
export class RedisModule {
  public static register(options: RedisModuleOptions): DynamicModule {
    const token = getRedisToken(options.name);
    const ShutdownService = createShutdownProvider(token);

    return {
      global: options.isGlobal ?? false,
      module: RedisModule,
      providers: [
        {
          provide: token,
          useFactory: () => RedisModule.createClient(options),
        },
        ShutdownService,
      ],
      exports: [token],
    };
  }

  public static registerAsync(options: RedisModuleAsyncOptions): DynamicModule {
    const token = getRedisToken(options.name);
    const ShutdownService = createShutdownProvider(token);

    return {
      global: options.isGlobal ?? false,
      module: RedisModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: token,
          inject: options.inject ?? [],
          // biome-ignore lint/suspicious/noExplicitAny: forwarded Nest DI args from inject list
          useFactory: async (...args: any[]) => {
            const resolved = await options.useFactory(...args);
            return RedisModule.createClient({ ...resolved, name: options.name });
          },
        },
        ShutdownService,
      ],
      exports: [token],
    };
  }

  private static async createClient(options: RedisModuleOptions): Promise<RedisClientType> {
    const name = options.name ?? DEFAULT_REDIS_NAME;
    const logger = new Logger(`RedisModule:${name}`);

    const clientOptions: RedisClientOptions = {
      ...options.clientOptions,
      ...(options.database !== undefined ? { database: options.database } : {}),
    };
    const client = createClient({ url: options.url, ...clientOptions });

    client.on("error", (err) => logger.error("Redis Client Error", err));
    client.on("connect", () => logger.log(`Redis Client Connected (${name})`));

    await client.connect();
    return client as RedisClientType;
  }
}
