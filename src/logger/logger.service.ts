import pino from "pino";

export class LoggerService {
  private static instance: LoggerService;
  private static pinoRoot: pino.Logger;
  private logger: pino.Logger;

  private constructor(private context: string = "Application") {
    if (!LoggerService.pinoRoot) {
      LoggerService.pinoRoot = pino({
        level: process.env.LOG_LEVEL || "info",
        name: process.env.APP_ID || "bun-elysia-app",
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
          level(label) {
            return { level: label };
          },
          bindings(bindings) {
            return { name: bindings.name, hostname: bindings.hostname };
          },
        },
      });
    }

    this.logger = LoggerService.pinoRoot.child({ module: context });
  }

  static getInstance(context = "Application"): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService(context);
    } else {
      LoggerService.instance.setContext(context);
    }
    return LoggerService.instance;
  }

  setContext(context: string): void {
    this.logger = LoggerService.pinoRoot.child({ module: context });
  }

  verbose(message: string, ...args: any[]) {
    this.logger.trace({ msg: message, ...args });
  }

  debug(message: string, ...args: any[]) {
    this.logger.debug({ msg: message, ...args });
  }

  info(message: string, ...args: any[]) {
    this.logger.info({ msg: message, ...args });
  }

  warn(message: string, ...args: any[]) {
    this.logger.warn({ msg: message, ...args });
  }

  error(message: string, ...args: any[]) {
    this.logger.error({ msg: message, ...args });
  }
} 