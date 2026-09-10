/**
 * Structured logging for MCP server
 * Logs to stderr to not interfere with MCP stdio transport
 */

import { createHmac, randomBytes } from "node:crypto";

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

  /**
   * Identifiers are hashed before they are logged, with a salt drawn once per
   * process. Lines from one run still correlate (the same user hashes to the
   * same value, which is what makes a rate-limit line worth having) but nothing
   * in a log file names a person, a mole or a photo, and two runs cannot be
   * joined. Static, so child loggers share it.
   *
   * Verified before this existed: with the backend unreachable, every failed
   * tool call wrote its userId, moleId and imageIds to stderr in clear, and an
   * MCP server's stderr is routinely shown in the client's debug pane.
   */
  private static readonly salt = randomBytes(16);

  /** Keys whose values are credentials. Matched as substrings, case-insensitive. */
  private static readonly SECRET_KEYS = ["apikey", "token", "password", "secret", "authorization"];

  /** Keys whose values identify a record: userId, moleId, imageId1, riskFactorIds, user_id. */
  private static readonly ID_KEY = /id(s|\d+)?$/i;

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
      ...(data && { data: this.sanitize(data) as Record<string, unknown> }),
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
    // Everything here passes through sanitize() in log(), args and userId alike.
    this.log(level, `Tool call: ${log.tool}`, {
      tool: log.tool,
      args: log.args,
      duration_ms: log.duration_ms,
      success: log.success,
      ...(log.error && { error: log.error }),
      ...(log.userId && { userId: log.userId }),
    });
  }

  /** A stable, salted, non-reversible stand-in for an identifier. */
  private opaque(value: string): string {
    return `id#${createHmac("sha256", Logger.salt).update(value).digest("hex").slice(0, 10)}`;
  }

  /**
   * Make a logged value safe: credentials redacted, identifiers hashed, long
   * strings truncated, nested objects and arrays walked to a small depth. The
   * key decides the treatment, so a userId nested inside args gets the same
   * handling as one at the top level.
   */
  private sanitize(value: unknown, key = "", depth = 0): unknown {
    const lower = key.toLowerCase();
    if (Logger.SECRET_KEYS.some((s) => lower.includes(s))) return "[REDACTED]";

    if (Logger.ID_KEY.test(key)) {
      if (typeof value === "string") return this.opaque(value);
      if (typeof value === "number") return this.opaque(String(value));
      if (Array.isArray(value)) {
        return value.map((v) => (typeof v === "string" ? this.opaque(v) : this.sanitize(v, key, depth + 1)));
      }
    }

    if (typeof value === "string") {
      return value.length > 500 ? `${value.substring(0, 100)}... [truncated]` : value;
    }
    if (Array.isArray(value)) {
      return depth >= 3 ? "[array]" : value.map((v) => this.sanitize(v, "", depth + 1));
    }
    if (value && typeof value === "object") {
      if (depth >= 3) return "[object]";
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.sanitize(v, k, depth + 1);
      }
      return out;
    }
    return value;
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
