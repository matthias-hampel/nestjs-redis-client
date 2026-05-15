import { Controller, Get } from "@nestjs/common";
import type { RedisClientType } from "redis";

import { InjectRedis } from "../src/redis.module";

@Controller("redis-jobs")
export class RedisNamedE2EController {
  constructor(@InjectRedis("jobs") private readonly redis: RedisClientType) {}

  @Get("ping")
  async ping(): Promise<{ ping: string }> {
    return { ping: await this.redis.ping() };
  }
}
