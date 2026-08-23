/**
 * Structured logging for MCP server
 * Logs to stderr to not interfere with MCP stdio transport
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
}

interface ToolCallLog {
  tool: string;
  args: Record<string, unknown>;
  duration_ms: number;
  success: boolean;
  error?: string;
  userId?: string;
}

class Logger {
  private level: LogLevel;
  private component: string;

  private readonly LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(component: string = "mcp-server") {
    this.component = component;
    this.level = (process.env.LOG_LEVEL as LogLevel) || "info";
  }

  private shouldLog(level: LogLevel): boolean {
    return this.LEVELS[level] >= this.LEVELS[this.level];
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      ...(data && { data }),
    };

    // Log as JSON to stderr (MCP uses stdout for protocol)
    console.error(JSON.stringify(entry));
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log("error", message, data);
  }

  /**
   * Log a tool call with timing and result
   */
  toolCall(log: ToolCallLog): void {
    const level = log.success ? "info" : "error";
    this.log(level, `Tool call: ${log.tool}`, {
      tool: log.tool,
      args: this.sanitizeArgs(log.args),
      duration_ms: log.duration_ms,
      success: log.success,
      ...(log.error && { error: log.error }),
      ...(log.userId && { userId: log.userId }),
    });
  }

  /**
   * Remove sensitive data from logged arguments
   */
  private sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sensitive = ["apiKey", "token", "password", "secret"];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      if (sensitive.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "string" && value.length > 500) {
        sanitized[key] = `${value.substring(0, 100)}... [truncated]`;
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Create a child logger with a specific component name
   */
  child(component: string): Logger {
    return new Logger(`${this.component}:${component}`);
  }
}

// Singleton instance
export const logger = new Logger();

// Component-specific loggers
export const loggers = {
  mlflow: logger.child("mlflow"),
  infra: logger.child("infrastructure"),
  cicd: logger.child("cicd"),
  feast: logger.child("feast"),
  clinical: logger.child("clinical"),
};

/**
 * Timer helper for measuring operation duration
 */
export function createTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
