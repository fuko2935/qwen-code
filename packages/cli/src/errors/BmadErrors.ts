/**
 * BMAD Error Handling System
 * 
 * Provides structured error types, error contexts, and base error classes
 * for robust error handling across BMAD workflows.
 */

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  /** Can be recovered automatically */
  RECOVERABLE = 'recoverable',
  /** Requires user intervention */
  WARNING = 'warning',
  /** Critical error, stops execution */
  CRITICAL = 'critical',
}

/**
 * Error types for categorization
 */
export enum ErrorType {
  // File system errors
  FILE_NOT_FOUND = 'file_not_found',
  FILE_WRITE_FAILED = 'file_write_failed',
  FILE_READ_FAILED = 'file_read_failed',
  PERMISSION_DENIED = 'permission_denied',
  
  // Agent errors
  AGENT_NOT_FOUND = 'agent_not_found',
  AGENT_LOAD_FAILED = 'agent_load_failed',
  AGENT_EXECUTION_FAILED = 'agent_execution_failed',
  
  // Task errors
  TASK_NOT_FOUND = 'task_not_found',
  TASK_EXECUTION_FAILED = 'task_execution_failed',
  TASK_TIMEOUT = 'task_timeout',
  
  // Template errors
  TEMPLATE_NOT_FOUND = 'template_not_found',
  TEMPLATE_RENDER_FAILED = 'template_render_failed',
  TEMPLATE_VALIDATION_FAILED = 'template_validation_failed',
  
  // Session errors
  SESSION_CORRUPTED = 'session_corrupted',
  SESSION_WRITE_FAILED = 'session_write_failed',
  SESSION_LOAD_FAILED = 'session_load_failed',
  
  // Workflow errors
  WORKFLOW_INTERRUPTED = 'workflow_interrupted',
  WORKFLOW_STEP_FAILED = 'workflow_step_failed',
  INVALID_WORKFLOW_STATE = 'invalid_workflow_state',
  
  // Context errors
  CONTEXT_OVERFLOW = 'context_overflow',
  TOKEN_LIMIT_EXCEEDED = 'token_limit_exceeded',
  
  // Validation errors
  INVALID_INPUT = 'invalid_input',
  MISSING_REQUIRED_FIELD = 'missing_required_field',
  VALIDATION_FAILED = 'validation_failed',
  
  // Network/External errors
  NETWORK_ERROR = 'network_error',
  EXTERNAL_SERVICE_ERROR = 'external_service_error',
  
  // Unknown
  UNKNOWN = 'unknown',
}

/**
 * Context information for errors
 */
export interface ErrorContext {
  /** Correlation ID for tracing across operations */
  correlationId?: string;
  /** Current workflow step */
  step?: string;
  /** Agent ID involved */
  agentId?: string;
  /** Task ID involved */
  taskId?: string;
  /** File path involved */
  filePath?: string;
  /** Original error if wrapped */
  originalError?: Error;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
  /** Stack trace */
  stackTrace?: string;
}

/**
 * Base BMAD Error class
 */
export class BmadError extends Error {
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    type: ErrorType,
    severity: ErrorSeverity,
    context: Partial<ErrorContext> = {},
    isRetryable = false
  ) {
    super(message);
    this.name = 'BmadError';
    this.type = type;
    this.severity = severity;
    this.isRetryable = isRetryable;
    this.context = {
      timestamp: new Date(),
      ...context,
    };

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    
    this.context.stackTrace = this.stack;
  }

  /**
   * Convert error to structured log format
   */
  toLogEntry() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      isRetryable: this.isRetryable,
      context: this.context,
    };
  }

  /**
   * Convert error to user-friendly message
   */
  toUserMessage(): string {
    const baseMessage = this.message;
    const contextInfo: string[] = [];

    if (this.context.agentId) {
      contextInfo.push(`Agent: ${this.context.agentId}`);
    }
    if (this.context.taskId) {
      contextInfo.push(`Task: ${this.context.taskId}`);
    }
    if (this.context.step) {
      contextInfo.push(`Step: ${this.context.step}`);
    }

    if (contextInfo.length > 0) {
      return `${baseMessage}\n[${contextInfo.join(', ')}]`;
    }
    return baseMessage;
  }
}

/**
 * Recoverable error - can be automatically retried
 */
export class RecoverableError extends BmadError {
  constructor(
    message: string,
    type: ErrorType,
    context: Partial<ErrorContext> = {}
  ) {
    super(message, type, ErrorSeverity.RECOVERABLE, context, true);
    this.name = 'RecoverableError';
  }
}

/**
 * Critical error - requires immediate attention and stops execution
 */
export class CriticalError extends BmadError {
  constructor(
    message: string,
    type: ErrorType,
    context: Partial<ErrorContext> = {}
  ) {
    super(message, type, ErrorSeverity.CRITICAL, context, false);
    this.name = 'CriticalError';
  }
}

/**
 * Validation error - input data is invalid
 */
export class ValidationError extends BmadError {
  public readonly validationErrors: string[];

  constructor(
    message: string,
    validationErrors: string[] = [],
    context: Partial<ErrorContext> = {}
  ) {
    super(message, ErrorType.VALIDATION_FAILED, ErrorSeverity.WARNING, context, false);
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
  }

  override toUserMessage(): string {
    const base = super.toUserMessage();
    if (this.validationErrors.length > 0) {
      return `${base}\n\nValidation errors:\n${this.validationErrors.map(e => `  - ${e}`).join('\n')}`;
    }
    return base;
  }
}

/**
 * File operation error
 */
export class FileOperationError extends RecoverableError {
  constructor(
    operation: 'read' | 'write' | 'delete' | 'move',
    filePath: string,
    originalError?: Error
  ) {
    const typeMap = {
      read: ErrorType.FILE_READ_FAILED,
      write: ErrorType.FILE_WRITE_FAILED,
      delete: ErrorType.FILE_WRITE_FAILED,
      move: ErrorType.FILE_WRITE_FAILED,
    };

    super(
      `Failed to ${operation} file: ${filePath}`,
      typeMap[operation],
      {
        filePath,
        originalError,
        metadata: { operation },
      }
    );
    this.name = 'FileOperationError';
  }
}

/**
 * Agent error
 */
export class AgentError extends BmadError {
  constructor(
    message: string,
    agentId: string,
    type: ErrorType = ErrorType.AGENT_EXECUTION_FAILED,
    severity: ErrorSeverity = ErrorSeverity.RECOVERABLE,
    originalError?: Error
  ) {
    super(
      message,
      type,
      severity,
      {
        agentId,
        originalError,
      },
      severity === ErrorSeverity.RECOVERABLE
    );
    this.name = 'AgentError';
  }
}

/**
 * Task error
 */
export class TaskError extends RecoverableError {
  constructor(
    message: string,
    taskId: string,
    type: ErrorType = ErrorType.TASK_EXECUTION_FAILED,
    originalError?: Error
  ) {
    super(message, type, {
      taskId,
      originalError,
    });
    this.name = 'TaskError';
  }
}

/**
 * Template error
 */
export class TemplateError extends RecoverableError {
  constructor(
    message: string,
    templateId: string,
    type: ErrorType = ErrorType.TEMPLATE_RENDER_FAILED,
    originalError?: Error
  ) {
    super(message, type, {
      metadata: { templateId },
      originalError,
    });
    this.name = 'TemplateError';
  }
}

/**
 * Session error
 */
export class SessionError extends CriticalError {
  constructor(
    message: string,
    type: ErrorType = ErrorType.SESSION_CORRUPTED,
    originalError?: Error
  ) {
    super(message, type, {
      originalError,
    });
    this.name = 'SessionError';
  }
}

/**
 * Workflow error
 */
export class WorkflowError extends BmadError {
  constructor(
    message: string,
    step: string,
    type: ErrorType = ErrorType.WORKFLOW_STEP_FAILED,
    severity: ErrorSeverity = ErrorSeverity.RECOVERABLE,
    originalError?: Error
  ) {
    super(
      message,
      type,
      severity,
      {
        step,
        originalError,
      },
      severity === ErrorSeverity.RECOVERABLE
    );
    this.name = 'WorkflowError';
  }
}

/**
 * Context overflow error
 */
export class ContextOverflowError extends RecoverableError {
  public readonly currentTokens: number;
  public readonly maxTokens: number;

  constructor(currentTokens: number, maxTokens: number) {
    super(
      `Context token limit exceeded: ${currentTokens}/${maxTokens}`,
      ErrorType.TOKEN_LIMIT_EXCEEDED,
      {
        metadata: { currentTokens, maxTokens },
      }
    );
    this.name = 'ContextOverflowError';
    this.currentTokens = currentTokens;
    this.maxTokens = maxTokens;
  }
}

/**
 * Helper to wrap unknown errors
 */
export function wrapError(
  error: unknown,
  type: ErrorType = ErrorType.UNKNOWN,
  context: Partial<ErrorContext> = {}
): BmadError {
  if (error instanceof BmadError) {
    return error;
  }

  const originalError = error instanceof Error ? error : new Error(String(error));
  
  return new RecoverableError(
    originalError.message || 'Unknown error occurred',
    type,
    {
      ...context,
      originalError,
    }
  );
}

/**
 * Type guard to check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof BmadError) {
    return error.isRetryable;
  }
  return false;
}

/**
 * Type guard to check if error is critical
 */
export function isCriticalError(error: unknown): boolean {
  if (error instanceof BmadError) {
    return error.severity === ErrorSeverity.CRITICAL;
  }
  return false;
}