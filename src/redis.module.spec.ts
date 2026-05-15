import "reflect-metadata";

import type { DynamicModule } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { RedisClientType } from "redis";
import { createClient } from "redis";

import {
  DEFAULT_REDIS_NAME,
  getRedisToken,
  REDIS_CLIENT,
  RedisModule,
} from "./redis.module";

jest.mock("redis", () => ({
  createClient: jest.fn(),
}));

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function buildRedisClientStub(overrides: Partial<{ isOpen: boolean }> = {}): RedisClientType & {
  connect: jest.Mock;
  on: jest.Mock;
  quit: jest.Mock;
} {
  const connect = jest.fn().mockResolvedValue(undefined);
  const on = jest.fn();
  const quit = jest.fn().mockResolvedValue(undefined);
  const client = {
    connect,
    on,
    quit,
    isOpen: overrides.isOpen ?? true,
  };
  mockedCreateClient.mockReturnValue(client as unknown as RedisClientType);
  return client as RedisClientType & {
    connect: jest.Mock;
    on: jest.Mock;
    quit: jest.Mock;
  };
}

describe("getRedisToken", () => {
  it("defaults to REDIS_CLIENT:default token", () => {
    expect(getRedisToken()).toBe(`REDIS_CLIENT:${DEFAULT_REDIS_NAME}`);
    expect(REDIS_CLIENT).toBe(getRedisToken());
  });

  it("scopes token by custom name", () => {
    expect(getRedisToken("cache")).toBe("REDIS_CLIENT:cache");
  });
});

describe("RedisModule.register", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("builds dynamic module with RedisModule core and default non-global", () => {
    const dm = RedisModule.register({ url: "redis://localhost:6379" });

    expect(dm.module).toBe(RedisModule);
    expect(dm.global).toBe(false);
    expect(dm.imports).toBeUndefined();
    expect(dm.exports).toEqual([getRedisToken()]);
    expect(dm.providers).toHaveLength(2);
  });

  it("honors isGlobal flag", () => {
    const dm = RedisModule.register({
      url: "redis://localhost:6379",
      isGlobal: true,
    });
    expect(dm.global).toBe(true);
  });

  it("wires factory to createClient with url merged after clientOptions", async () => {
    const stub = buildRedisClientStub();

    const moduleRef = await Test.createTestingModule({
      imports: [
        RedisModule.register({
          url: "redis://from-options",
          clientOptions: { url: "redis://from-client-options", socket: { reconnectStrategy: false } },
          name: "jobs",
        }),
      ],
    }).compile();

    expect(mockedCreateClient).toHaveBeenCalledWith({
      url: "redis://from-client-options",
      socket: { reconnectStrategy: false },
    });

    expect(moduleRef.get(getRedisToken("jobs"))).toBe(stub);

    await moduleRef.close();
  });

  it("registers error and connect listeners", async () => {
    const stub = buildRedisClientStub();

    const moduleRef = await Test.createTestingModule({
      imports: [RedisModule.register({ url: "redis://x" })],
    }).compile();

    expect(stub.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(stub.on).toHaveBeenCalledWith("connect", expect.any(Function));
    await moduleRef.close();
  });

  it("closes client on shutdown when socket open", async () => {
    const stub = buildRedisClientStub({ isOpen: true });

    const moduleRef = await Test.createTestingModule({
      imports: [RedisModule.register({ url: "redis://x" })],
    }).compile();

    await moduleRef.init();
    await moduleRef.close();

    expect(stub.quit).toHaveBeenCalledTimes(1);
  });

  it("skips quit when client not open", async () => {
    const stub = buildRedisClientStub({ isOpen: false });

    const moduleRef = await Test.createTestingModule({
      imports: [RedisModule.register({ url: "redis://x" })],
    }).compile();

    await moduleRef.init();
    await moduleRef.close();

    expect(stub.quit).not.toHaveBeenCalled();
  });
});

describe("RedisModule.registerAsync", () => {
  const TOKEN = Symbol("ASYNC_OPTIONS");

  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  function stubDynamicModuleProvidingToken(value: unknown): DynamicModule {
    return {
      module: class TokenHolder {},
      providers: [{ provide: TOKEN, useValue: value }],
      exports: [TOKEN],
    };
  }

  it("imports extra modules and injects deps into factory", async () => {
    buildRedisClientStub();

    const moduleRef = await Test.createTestingModule({
      imports: [
        RedisModule.registerAsync({
          imports: [stubDynamicModuleProvidingToken({ url: "redis://async" })],
          inject: [TOKEN],
          useFactory: (cfg: { url: string }) => ({ url: cfg.url }),
        }),
      ],
    }).compile();

    expect(mockedCreateClient).toHaveBeenCalledWith({ url: "redis://async" });
    await moduleRef.close();
  });

  it("binds Redis client to token from module name ignoring factory-returned name", async () => {
    const stub = buildRedisClientStub();

    const moduleRef = await Test.createTestingModule({
      imports: [
        RedisModule.registerAsync({
          name: "cache",
          useFactory: async () => ({
            url: "redis://x",
            name: "should-not-win",
          }),
        }),
      ],
    }).compile();

    expect(mockedCreateClient).toHaveBeenCalledWith({
      url: "redis://x",
    });

    expect(moduleRef.get(getRedisToken("cache"))).toBe(stub);
    expect(() => moduleRef.get(getRedisToken("should-not-win"))).toThrow();

    await moduleRef.close();
  });

  it("defaults inject to empty when omitted", async () => {
    buildRedisClientStub();

    const moduleRef = await Test.createTestingModule({
      imports: [
        RedisModule.registerAsync({
          useFactory: () => ({ url: "redis://solo" }),
        }),
      ],
    }).compile();

    expect(mockedCreateClient).toHaveBeenCalledWith({ url: "redis://solo" });
    await moduleRef.close();
  });
});
