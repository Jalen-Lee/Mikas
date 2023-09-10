type LogLevel = "info" | "warning" | "error";

export class Logger {
  private static enable = true;
  private static instance: Logger;
  private levels: LogLevel[] = ["info", "warning", "error"];
  private logLevel: LogLevel;
  private _logger = {
    info: console.log,
    warning: console.warn,
    error: console.error,
  };

  constructor(logLevel: LogLevel = "info") {
    if (Logger.instance) return Logger.instance;
    Logger.instance = this;
    this.logLevel = logLevel;
  }

  static getInstance(logLevel?: LogLevel): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(logLevel);
    }
    return Logger.instance;
  }

  setLogLevel(logLevel: LogLevel): void {
    this.logLevel = logLevel;
  }

  private log(level: LogLevel, flag: string, message: any): void {
    if (Logger.enable && this.shouldLog(level)) {
      const _logger = this._logger[level] || console.log;
      _logger(`[${level.toUpperCase()} => ${flag}]: `, message);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels.indexOf(level) >= this.levels.indexOf(this.logLevel);
  }

  info(flag: string, message: any = ""): void {
    this.log("info", flag, message);
  }

  warn(flag: string, message: any): void {
    this.log("warning", flag, message);
  }

  error(flag: string, message: any): void {
    this.log("error", flag, message);
  }
}

export default new Logger();
