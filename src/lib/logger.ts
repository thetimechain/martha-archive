import pino from "pino";
import { env } from "./env.js";

const isProd = env.NODE_ENV === "production";

export const logger = pino(
  isProd
    ? { level: env.LOG_LEVEL }
    : {
        level: env.LOG_LEVEL,
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l" },
        },
      },
);
