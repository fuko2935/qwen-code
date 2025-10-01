/**
 * Retry Helper Service
 *
 * Provides intelligent retry mechanisms with three escalation levels:
 * 1. Direct retry - Immediate retry without changes
 * 2. Context refresh - Reload session, agent, and tasks before retry
 * 3. User guidance - Pause and ask user for input before retry
 */

import {
  BmadError,
  isRetryableError,
  isCriticalError,
  ErrorType,
} from '../errors/BmadErrors.js';
import type { BmadSessionManager } from './BmadSessionManager.js';
import type { BmadAgentLoader } from './BmadAgentLoader.js';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  /** Enable context refresh on second attempt */
  enableContextRefresh: boolean;
  /** Enable user prompt on third attempt */
  enableUserGuidance: boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  enableContextRefresh: true,
  enableUserGuidance: true,
};

/**
 * Retry context for tracking attempts
 */
export interface RetryContext {
  attempt: number;
  totalAttempts: number;
  lastError?: BmadError;
  userInput?: string;
}

/**
 * Retry result
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: BmadError;
  attempts: number;
  recoveryAction?: 'direct' | 'context-refresh' | 'user-guidance' | 'none';
}

/**
 * Context refresh callback
 */
export type ContextRefreshCallback = () => Promise<void>;

/**
 * User guidance callback - returns user input or null if user cancels
 */
export type UserGuidanceCallback = (
  error: BmadError,
  context: RetryContext,
) => Promise<string | null>;

/**
 * Retry Helper Service
 */
export class RetryHelper {
  private config: RetryConfig;
  private sessionManager?: BmadSessionManager;
  private agentLoader?: BmadAgentLoader;
  private userGuidanceCallback?: UserGuidanceCallback;

  constructor(
    config: Partial<RetryConfig> = {},
    sessionManager?: BmadSessionManager,
    agentLoader?: BmadAgentLoader,
  ) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.sessionManager = sessionManager;
    this.agentLoader = agentLoader;
  }

  /**
   * Set user guidance callback
   */
  setUserGuidanceCallback(callback: UserGuidanceCallback) {
    this.userGuidanceCallback = callback;
  }

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: (context: RetryContext) => Promise<T>,
    options: {
      operationName?: string;
      contextRefresh?: ContextRefreshCallback;
      skipRetryForErrors?: ErrorType[];
    } = {},
  ): Promise<RetryResult<T>> {
    const {
      operationName = 'operation',
      contextRefresh,
      skipRetryForErrors = [],
    } = options;

    let lastError: BmadError | undefined;
    let recoveryAction: RetryResult<T>['recoveryAction'] = 'none';

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      const retryContext: RetryContext = {
        attempt,
        totalAttempts: this.config.maxAttempts,
        lastError,
      };

      try {
        // Attempt 2: Context refresh
        if (
          attempt === 2 &&
          this.config.enableContextRefresh &&
          contextRefresh
        ) {
          console.log(`🔄 Retry attempt ${attempt}: Refreshing context...`);
          await contextRefresh();
          recoveryAction = 'context-refresh';
        }

        // Attempt 3: User guidance
        if (attempt === 3 && this.config.enableUserGuidance && lastError) {
          console.log(
            `🤔 Retry attempt ${attempt}: Requesting user guidance...`,
          );
          const userInput = await this.requestUserGuidance(
            lastError,
            retryContext,
          );

          if (!userInput) {
            // User cancelled
            return {
              success: false,
              error: lastError,
              attempts: attempt - 1,
              recoveryAction,
            };
          }

          retryContext.userInput = userInput;
          recoveryAction = 'user-guidance';
        }

        // Attempt 1: Direct retry (or subsequent attempts after preparation)
        if (attempt > 1) {
          await this.delay(this.calculateDelay(attempt));
          console.log(
            `🔁 Retry attempt ${attempt}: Executing ${operationName}...`,
          );
          if (attempt === 1) {
            recoveryAction = 'direct';
          }
        }

        // Execute operation
        const result = await operation(retryContext);

        // Success
        console.log(`✅ ${operationName} succeeded on attempt ${attempt}`);
        return {
          success: true,
          result,
          attempts: attempt,
          recoveryAction: attempt > 1 ? recoveryAction : 'none',
        };
      } catch (error) {
        // Wrap error if needed
        lastError =
          error instanceof BmadError
            ? error
            : new BmadError(
                String(error),
                ErrorType.UNKNOWN,
                'recoverable' as ErrorSeverity,
                { originalError: error instanceof Error ? error : undefined },
              );

        console.error(
          `❌ ${operationName} failed on attempt ${attempt}:`,
          lastError.message,
        );

        // Check if error should skip retry
        if (skipRetryForErrors.includes(lastError.type)) {
          console.log(`⏭️  Skipping retry for error type: ${lastError.type}`);
          return {
            success: false,
            error: lastError,
            attempts: attempt,
            recoveryAction,
          };
        }

        // Check if error is critical (don't retry)
        if (isCriticalError(lastError)) {
          console.error(`🚨 Critical error encountered, stopping retries`);
          return {
            success: false,
            error: lastError,
            attempts: attempt,
            recoveryAction,
          };
        }

        // Check if error is not retryable
        if (!isRetryableError(lastError) && attempt === 1) {
          console.log(`⚠️  Error is not retryable, stopping retries`);
          return {
            success: false,
            error: lastError,
            attempts: attempt,
            recoveryAction,
          };
        }

        // Last attempt - return failure
        if (attempt === this.config.maxAttempts) {
          console.error(`💥 ${operationName} failed after ${attempt} attempts`);
          return {
            success: false,
            error: lastError,
            attempts: attempt,
            recoveryAction,
          };
        }
      }
    }

    // Should never reach here, but TypeScript needs this
    return {
      success: false,
      error: lastError,
      attempts: this.config.maxAttempts,
      recoveryAction,
    };
  }

  /**
   * Request user guidance
   */
  private async requestUserGuidance(
    error: BmadError,
    context: RetryContext,
  ): Promise<string | null> {
    if (this.userGuidanceCallback) {
      return await this.userGuidanceCallback(error, context);
    }

    // Default implementation - return null (cancel)
    console.warn('No user guidance callback configured, cancelling retry');
    return null;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateDelay(attempt: number): number {
    const delay = Math.min(
      this.config.initialDelay *
        Math.pow(this.config.backoffMultiplier, attempt - 1),
      this.config.maxDelay,
    );
    return delay;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create context refresh callback for session and agent
   */
  createContextRefreshCallback(
    agentId?: string,
    _taskId?: string,
  ): ContextRefreshCallback {
    return async () => {
      console.log('🔄 Refreshing context...');

      // Reload session
      if (this.sessionManager) {
        try {
          await this.sessionManager.read();
          console.log('  ✓ Session reloaded');
        } catch (error) {
          console.warn('  ⚠ Failed to reload session:', error);
        }
      }

      // Reload agent
      if (this.agentLoader && agentId) {
        try {
          await this.agentLoader.loadAgent(agentId);
          console.log(`  ✓ Agent "${agentId}" reloaded`);
        } catch (error) {
          console.warn(`  ⚠ Failed to reload agent "${agentId}":`, error);
        }
      }

      // Clear any caches
      if (this.agentLoader) {
        // Agent loader should have a cache clear method
        // this.agentLoader.clearCache?.();
      }

      console.log('✓ Context refresh completed');
    };
  }

  /**
   * Batch retry - retry multiple operations with shared retry logic
   */
  async executeBatchWithRetry<T>(
    operations: Array<{
      name: string;
      execute: (context: RetryContext) => Promise<T>;
      contextRefresh?: ContextRefreshCallback;
    }>,
    options: {
      stopOnFirstFailure?: boolean;
      parallelExecution?: boolean;
    } = {},
  ): Promise<Array<RetryResult<T>>> {
    const { stopOnFirstFailure = false, parallelExecution = false } = options;
    const results: Array<RetryResult<T>> = [];

    if (parallelExecution) {
      // Execute all in parallel
      const promises = operations.map((op) =>
        this.executeWithRetry(op.execute, {
          operationName: op.name,
          contextRefresh: op.contextRefresh,
        }),
      );
      return await Promise.all(promises);
    } else {
      // Execute sequentially
      for (const op of operations) {
        const result = await this.executeWithRetry(op.execute, {
          operationName: op.name,
          contextRefresh: op.contextRefresh,
        });
        results.push(result);

        if (stopOnFirstFailure && !result.success) {
          console.error(
            `Batch execution stopped due to failure in "${op.name}"`,
          );
          break;
        }
      }
      return results;
    }
  }
}

/**
 * Create a default retry helper instance
 */
export function createRetryHelper(
  config?: Partial<RetryConfig>,
  sessionManager?: BmadSessionManager,
  agentLoader?: BmadAgentLoader,
): RetryHelper {
  return new RetryHelper(config, sessionManager, agentLoader);
}
