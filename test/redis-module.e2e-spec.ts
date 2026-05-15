import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import type { App } from "supertest/types";
import request from "supertest";

import { RedisModule } from "../src/redis.module";
import { RedisNamedE2EController } from "./redis-e2e-named.controller";
import { RedisE2EController } from "./redis-e2e.controller";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const describeE2e = process.env.SKIP_REDIS_E2E === "1" || process.env.SKIP_REDIS_E2E === "true" ? describe.skip : describe;

describeE2e("RedisModule (e2e)", () => {
  jest.setTimeout(30_000);

  async function createAndInit(
    imports: Parameters<typeof Test.createTestingModule>[0]["imports"],
    controllers: Parameters<typeof Test.createTestingModule>[0]["controllers"],
  ): Promise<INestApplication<App>> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports,
      controllers,
    }).compile();
    const application = moduleFixture.createNestApplication();
    await application.init();
    return application;
  }

  describe("RedisModule.register", () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createAndInit([RedisModule.register({ url: redisUrl })], [RedisE2EController]);
    });

    afterAll(async () => {
      await app.close();
    });

    it("GET /redis/ping returns Redis PONG", async () => {
      const res = await request(app.getHttpServer()).get("/redis/ping").expect(200);
      expect(res.body).toEqual({ ping: "PONG" });
    });
  });

  describe("RedisModule.registerAsync", () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createAndInit(
        [
          RedisModule.registerAsync({
            useFactory: () => ({ url: redisUrl }),
          }),
        ],
        [RedisE2EController],
      );
    });

    afterAll(async () => {
      await app.close();
    });

    it("GET /redis/ping returns Redis PONG", async () => {
      const res = await request(app.getHttpServer()).get("/redis/ping").expect(200);
      expect(res.body).toEqual({ ping: "PONG" });
    });
  });

  describe("named client", () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createAndInit([RedisModule.register({ url: redisUrl, name: "jobs" })], [RedisNamedE2EController]);
    });

    afterAll(async () => {
      await app.close();
    });

    it("GET /redis-jobs/ping resolves InjectRedis(jobs)", async () => {
      const res = await request(app.getHttpServer()).get("/redis-jobs/ping").expect(200);
      expect(res.body).toEqual({ ping: "PONG" });
    });
  });
});
