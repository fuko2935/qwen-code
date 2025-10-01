/**
 * BMAD Logger Service
 *
 * Structured logging with correlation IDs, log levels, and secret redaction.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Log level priorities for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  correlationId: string;
  message: string;
  context?: {
    agentId?: string;
    taskId?: string;
    step?: string;
    filePath?: string;
    [key: string]: unknown;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Log file path */
  logFilePath: string;
  /** Console output enabled */
  consoleOutput: boolean;
  /** File output enabled */
  fileOutput: boolean;
  /** Enable secret redaction */
  redactSecrets: boolean;
  /** Patterns to redact (regex) */
  redactionPatterns: RegExp[];
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  logFilePath: '',
  consoleOutput: true,
  fileOutput: true,
  redactSecrets: true,
  redactionPatterns: [
    /api[_-]?key["\s:=]+([a-zA-Z0-9-_]{20,})/gi,
    /token["\s:=]+([a-zA-Z0-9-_.]{20,})/gi,
    /password["\s:=]+([^\s"']+)/gi,
    /secret["\s:=]+([^\s"']+)/gi,
  ],
};

/**
 * BMAD Logger
 */
export class BmadLogger {
  private config: LoggerConfig;
  private correlationId: string;
  private logBuffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    cwd: string,
    correlationId?: string,
    config: Partial<LoggerConfig> = {},
  ) {
    this.correlationId = correlationId || uuidv4();

    // Read log level from environment variable
    const envLogLevel = process.env['QWEN_BMAD_LOG_LEVEL']?.toLowerCase();
    const logLevel =
      envLogLevel && Object.values(LogLevel).includes(envLogLevel as LogLevel)
        ? (envLogLevel as LogLevel)
        : LogLevel.INFO;

    this.config = {
      ...DEFAULT_CONFIG,
      level: logLevel,
      logFilePath: path.join(cwd, '.qwen', 'logs', 'bmad.log'),
      ...config,
    };

    // Start periodic flush
    if (this.config.fileOutput) {
      this.startPeriodicFlush();
    }
  }

  /**
   * Set correlation ID
   */
  setCorrelationId(correlationId: string): void {
    this.correlationId = correlationId;
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Log debug message
   */
  debug(
    message: string,
    context?: LogEntry['context'],
    metadata?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.DEBUG, message, context, metadata);
  }

  /**
   * Log info message
   */
  info(
    message: string,
    context?: LogEntry['context'],
    metadata?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.INFO, message, context, metadata);
  }

  /**
   * Log warning message
   */
  warn(
    message: string,
    context?: LogEntry['context'],
    metadata?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.WARN, message, context, metadata);
  }

  /**
   * Log error message
   */
  error(
    message: string,
    error?: Error,
    context?: LogEntry['context'],
    metadata?: Record<string, unknown>,
  ): void {
    const errorInfo = error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : undefined;

    this.log(LogLevel.ERROR, message, context, metadata, errorInfo);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: LogEntry['context'],
    metadata?: Record<string, unknown>,
    error?: LogEntry['error'],
  ): void {
    // Check if log level meets threshold
    if (!this.shouldLog(level)) {
      return;
    }

    // Redact secrets if enabled
    const redactedMessage = this.config.redactSecrets
      ? this.redactSecrets(message)
      : message;

    const redactedMetadata =
      this.config.redactSecrets && metadata
        ? this.redactSecretsFromObject(metadata)
        : metadata;

    // Create log entry
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: this.correlationId,
      message: redactedMessage,
      context,
      error,
      metadata: redactedMetadata,
    };

    // Console output
    if (this.config.consoleOutput) {
      this.outputToConsole(entry);
    }

    // Buffer for file output
    if (this.config.fileOutput) {
      this.logBuffer.push(entry);
    }
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  /**
   * Output to console with formatting
   */
  private outputToConsole(entry: LogEntry): void {
    const icon = this.getLevelIcon(entry.level);
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();

    let output = `${icon} [${timestamp}] ${entry.message}`;

    if (entry.context) {
      const contextStr = Object.entries(entry.context)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      if (contextStr) {
        output += ` (${contextStr})`;
      }
    }

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
        console.error(output);
        if (entry.error) {
          console.error(`  Error: ${entry.error.name}: ${entry.error.message}`);
          if (entry.error.stack) {
            console.error(entry.error.stack);
          }
        }
        break;
      default:
        // Handle any unexpected log levels
        console.log(output);
        break;
    }
  }

  /**
   * Get icon for log level
   */
  private getLevelIcon(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return '🐛';
      case LogLevel.INFO:
        return 'ℹ️';
      case LogLevel.WARN:
        return '⚠️';
      case LogLevel.ERROR:
        return '❌';
      default:
        return '📝';
    }
  }

  /**
   * Redact secrets from text
   */
  private redactSecrets(text: string): string {
    let redacted = text;
    for (const pattern of this.config.redactionPatterns) {
      redacted = redacted.replace(pattern, (match, secret) =>
        match.replace(secret, '[REDACTED]'),
      );
    }
    return redacted;
  }

  /**
   * Redact secrets from object
   */
  private redactSecretsFromObject(
    obj: Record<string, unknown>,
  ): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        redacted[key] = this.redactSecrets(value);
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactSecretsFromObject(
          value as Record<string, unknown>,
        );
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Start periodic flush to file
   */
  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => {
        console.error('Failed to flush logs:', err);
      });
    }, 5000); // Flush every 5 seconds
  }

  /**
   * Flush log buffer to file
   */
  async flush(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // Ensure log directory exists
      const logDir = path.dirname(this.config.logFilePath);
      await fs.mkdir(logDir, { recursive: true });

      // Format entries as JSON lines
      const lines =
        entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';

      // Append to log file
      await fs.appendFile(this.config.logFilePath, lines, 'utf-8');
    } catch (error) {
      console.error('Failed to write logs to file:', error);
      // Put entries back in buffer
      this.logBuffer.unshift(...entries);
    }
  }

  /**
   * Shutdown logger (flush and stop interval)
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  /**
   * Create child logger with additional context
   */
  child(context: LogEntry['context']): ChildLogger {
    return new ChildLogger(this, context);
  }
}

/**
 * Child logger with inherited context
 */
class ChildLogger {
  constructor(
    private parent: BmadLogger,
    private context: LogEntry['context'],
  ) {}

  debug(
    message: string,
    additionalContext?: LogEntry['context'],
    metadata?: Record<string, unknown>,
  ): void {
    this.parent.debug(
      message,
      { ...this.context, ...additionalContext },
      metadata,
    );
  }

  info(
    message: string,
    additionalContext?: LogEntry['context'],
    metadata?: Record<string, unknown>,
  ): void {
    this.parent.info(
      message,
      { ...this.context, ...additionalContext },
      metadata,
    );
  }

  warn(
    message: string,
    additionalContext?: LogEntry['context'],
    metadata?: Record<string, unknown>,
  ): void {
    this.parent.warn(
      message,
      { ...this.context, ...additionalContext },
      metadata,
    );
  }

  error(
    message: string,
    error?: Error,
    additionalContext?: LogEntry['context'],
    metadata?: Record<string, unknown>,
  ): void {
    this.parent.error(
      message,
      error,
      { ...this.context, ...additionalContext },
      metadata,
    );
  }
}

/**
 * Global logger instance
 */
let globalLogger: BmadLogger | null = null;

/**
 * Initialize global logger
 */
export function initializeLogger(
  cwd: string,
  config?: Partial<LoggerConfig>,
): BmadLogger {
  globalLogger = new BmadLogger(cwd, undefined, config);
  return globalLogger;
}

/**
 * Get global logger instance
 */
export function getLogger(): BmadLogger {
  if (!globalLogger) {
    throw new Error('Logger not initialized. Call initializeLogger() first.');
  }
  return globalLogger;
}

/**
 * Shutdown global logger
 */
export async function shutdownLogger(): Promise<void> {
  if (globalLogger) {
    await globalLogger.shutdown();
    globalLogger = null;
  }
}
