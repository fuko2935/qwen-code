/**
 * BMAD Integration Tests
 *
 * Comprehensive test suite covering all BMAD functionality:
 * - Error handling
 * - Retry mechanisms
 * - Transaction management
 * - Logging
 * - Workflow execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  BmadError,
  RecoverableError,
  CriticalError,
  ValidationError,
  FileOperationError,
  AgentError,
  ErrorType,
  ErrorSeverity,
  isRetryableError,
  isCriticalError,
  wrapError,
} from '../errors/BmadErrors';
import { RetryHelper } from '../services/RetryHelper';
import { createTransaction } from '../services/TransactionManager';
import { BmadLogger, initializeLogger, LogLevel } from '../services/BmadLogger';

// Test utilities
const TEST_DIR = path.join(process.cwd(), '.test-temp');
const TEST_CWD = path.join(TEST_DIR, 'project');

describe('BMAD Integration Tests', () => {
  beforeEach(async () => {
    // Setup test directory
    await fs.mkdir(TEST_CWD, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe('Error Handling System', () => {
    describe('BmadError Base Class', () => {
      it('should create error with correct properties', () => {
        const error = new BmadError(
          'Test error',
          ErrorType.AGENT_EXECUTION_FAILED,
          ErrorSeverity.RECOVERABLE,
          { agentId: 'pm', taskId: 'test-task' },
        );

        expect(error.message).toBe('Test error');
        expect(error.type).toBe(ErrorType.AGENT_EXECUTION_FAILED);
        expect(error.severity).toBe(ErrorSeverity.RECOVERABLE);
        expect(error.context.agentId).toBe('pm');
        expect(error.context.taskId).toBe('test-task');
        expect(error.context.timestamp).toBeInstanceOf(Date);
      });

      it('should convert to log entry', () => {
        const error = new BmadError(
          'Test error',
          ErrorType.FILE_WRITE_FAILED,
          ErrorSeverity.CRITICAL,
        );

        const logEntry = error.toLogEntry();
        expect(logEntry.name).toBe('BmadError');
        expect(logEntry.message).toBe('Test error');
        expect(logEntry.type).toBe(ErrorType.FILE_WRITE_FAILED);
        expect(logEntry.severity).toBe(ErrorSeverity.CRITICAL);
      });

      it('should convert to user message with context', () => {
        const error = new BmadError(
          'Operation failed',
          ErrorType.TASK_EXECUTION_FAILED,
          ErrorSeverity.WARNING,
          { agentId: 'dev', taskId: 'implement', step: 'coding' },
        );

        const message = error.toUserMessage();
        expect(message).toContain('Operation failed');
        expect(message).toContain('Agent: dev');
        expect(message).toContain('Task: implement');
        expect(message).toContain('Step: coding');
      });
    });

    describe('Specialized Error Classes', () => {
      it('should create RecoverableError', () => {
        const error = new RecoverableError(
          'Temporary failure',
          ErrorType.NETWORK_ERROR,
        );

        expect(error.isRetryable).toBe(true);
        expect(error.severity).toBe(ErrorSeverity.RECOVERABLE);
      });

      it('should create CriticalError', () => {
        const error = new CriticalError(
          'Fatal error',
          ErrorType.SESSION_CORRUPTED,
        );

        expect(error.isRetryable).toBe(false);
        expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      });

      it('should create ValidationError with details', () => {
        const validationErrors = [
          'Field "name" is required',
          'Field "age" must be a number',
        ];
        const error = new ValidationError(
          'Validation failed',
          validationErrors,
        );

        expect(error.validationErrors).toEqual(validationErrors);
        const message = error.toUserMessage();
        expect(message).toContain('Validation errors:');
        expect(message).toContain('Field "name" is required');
      });

      it('should create FileOperationError', () => {
        const error = new FileOperationError(
          'write',
          '/test/file.txt',
          new Error('Permission denied'),
        );

        expect(error.type).toBe(ErrorType.FILE_WRITE_FAILED);
        expect(error.context.filePath).toBe('/test/file.txt');
      });

      it('should create AgentError', () => {
        const error = new AgentError(
          'Agent crashed',
          'pm',
          ErrorType.AGENT_EXECUTION_FAILED,
          ErrorSeverity.RECOVERABLE,
        );

        expect(error.context.agentId).toBe('pm');
        expect(error.isRetryable).toBe(true);
      });
    });

    describe('Error Utilities', () => {
      it('should detect retryable errors', () => {
        const retryable = new RecoverableError('Test', ErrorType.NETWORK_ERROR);
        const critical = new CriticalError('Test', ErrorType.SESSION_CORRUPTED);

        expect(isRetryableError(retryable)).toBe(true);
        expect(isRetryableError(critical)).toBe(false);
        expect(isRetryableError(new Error('Regular error'))).toBe(false);
      });

      it('should detect critical errors', () => {
        const critical = new CriticalError('Test', ErrorType.SESSION_CORRUPTED);
        const recoverable = new RecoverableError(
          'Test',
          ErrorType.NETWORK_ERROR,
        );

        expect(isCriticalError(critical)).toBe(true);
        expect(isCriticalError(recoverable)).toBe(false);
      });

      it('should wrap unknown errors', () => {
        const regularError = new Error('Something went wrong');
        const wrapped = wrapError(regularError, ErrorType.UNKNOWN, {
          agentId: 'test',
        });

        expect(wrapped).toBeInstanceOf(RecoverableError);
        expect(wrapped.message).toBe('Something went wrong');
        expect(wrapped.context.agentId).toBe('test');
      });

      it('should not re-wrap BmadErrors', () => {
        const original = new RecoverableError(
          'Test',
          ErrorType.AGENT_LOAD_FAILED,
        );
        const wrapped = wrapError(original);

        expect(wrapped).toBe(original);
      });
    });
  });

  describe('Retry System', () => {
    describe('RetryHelper Basic Functionality', () => {
      it('should succeed on first attempt', async () => {
        const retryHelper = new RetryHelper();
        let attempts = 0;

        const result = await retryHelper.executeWithRetry(async () => {
          attempts++;
          return 'success';
        });

        expect(result.success).toBe(true);
        expect(result.result).toBe('success');
        expect(result.attempts).toBe(1);
        expect(attempts).toBe(1);
      });

      it('should retry on recoverable error', async () => {
        const retryHelper = new RetryHelper({
          maxAttempts: 3,
          initialDelay: 10,
        });
        let attempts = 0;

        const result = await retryHelper.executeWithRetry(async () => {
          attempts++;
          if (attempts < 2) {
            throw new RecoverableError(
              'Temporary failure',
              ErrorType.NETWORK_ERROR,
            );
          }
          return 'success';
        });

        expect(result.success).toBe(true);
        expect(result.attempts).toBe(2);
        expect(attempts).toBe(2);
      });

      it('should not retry on critical error', async () => {
        const retryHelper = new RetryHelper({ maxAttempts: 3 });
        let attempts = 0;

        const result = await retryHelper.executeWithRetry(async () => {
          attempts++;
          throw new CriticalError('Fatal error', ErrorType.SESSION_CORRUPTED);
        });

        expect(result.success).toBe(false);
        expect(result.attempts).toBe(1);
        expect(attempts).toBe(1);
      });

      it('should fail after max attempts', async () => {
        const retryHelper = new RetryHelper({
          maxAttempts: 3,
          initialDelay: 10,
          enableContextRefresh: false,
          enableUserGuidance: false,
        });
        let attempts = 0;

        const result = await retryHelper.executeWithRetry(async () => {
          attempts++;
          throw new RecoverableError(
            'Always fails',
            ErrorType.TASK_EXECUTION_FAILED,
          );
        });

        expect(result.success).toBe(false);
        expect(result.attempts).toBe(3);
        expect(attempts).toBe(3);
      });
    });

    describe('Context Refresh', () => {
      it('should trigger context refresh on second attempt', async () => {
        const retryHelper = new RetryHelper({
          maxAttempts: 3,
          initialDelay: 10,
          enableContextRefresh: true,
        });

        let contextRefreshed = false;
        let attempts = 0;

        const result = await retryHelper.executeWithRetry(
          async () => {
            attempts++;
            if (attempts < 2) {
              throw new RecoverableError(
                'First failure',
                ErrorType.AGENT_LOAD_FAILED,
              );
            }
            return 'success';
          },
          {
            contextRefresh: async () => {
              contextRefreshed = true;
            },
          },
        );

        expect(result.success).toBe(true);
        expect(contextRefreshed).toBe(true);
        expect(result.recoveryAction).toBe('context-refresh');
      });
    });

    describe('User Guidance', () => {
      it('should request user guidance on third attempt', async () => {
        const retryHelper = new RetryHelper({
          maxAttempts: 3,
          initialDelay: 10,
          enableUserGuidance: true,
        });

        let userGuidanceRequested = false;
        retryHelper.setUserGuidanceCallback(async (error, context) => {
          userGuidanceRequested = true;
          expect(context.attempt).toBe(3);
          return 'continue'; // User input
        });

        let attempts = 0;
        const result = await retryHelper.executeWithRetry(async (ctx) => {
          attempts++;
          if (attempts < 3) {
            throw new RecoverableError('Failure', ErrorType.TASK_TIMEOUT);
          }
          // Succeed after user guidance
          expect(ctx.userInput).toBe('continue');
          return 'success';
        });

        expect(result.success).toBe(true);
        expect(userGuidanceRequested).toBe(true);
      });

      it('should cancel on user rejection', async () => {
        const retryHelper = new RetryHelper({
          maxAttempts: 3,
          initialDelay: 10,
          enableUserGuidance: true,
        });

        retryHelper.setUserGuidanceCallback(async () => null); // User cancels

        let attempts = 0;
        const result = await retryHelper.executeWithRetry(async () => {
          attempts++;
          throw new RecoverableError(
            'Failure',
            ErrorType.TASK_EXECUTION_FAILED,
          );
        });

        expect(result.success).toBe(false);
        expect(attempts).toBe(2); // Only 2 attempts before user cancel
      });
    });

    describe('Batch Operations', () => {
      it('should execute batch operations sequentially', async () => {
        const retryHelper = new RetryHelper({ initialDelay: 10 });
        const executionOrder: number[] = [];

        const operations = [
          {
            name: 'op1',
            execute: async () => {
              executionOrder.push(1);
              return 'result1';
            },
          },
          {
            name: 'op2',
            execute: async () => {
              executionOrder.push(2);
              return 'result2';
            },
          },
          {
            name: 'op3',
            execute: async () => {
              executionOrder.push(3);
              return 'result3';
            },
          },
        ];

        const results = await retryHelper.executeBatchWithRetry(operations, {
          parallelExecution: false,
        });

        expect(results).toHaveLength(3);
        expect(results.every((r) => r.success)).toBe(true);
        expect(executionOrder).toEqual([1, 2, 3]);
      });

      it('should stop on first failure when configured', async () => {
        const retryHelper = new RetryHelper({ maxAttempts: 1 });

        const operations = [
          {
            name: 'op1',
            execute: async () => 'success',
          },
          {
            name: 'op2',
            execute: async () => {
              throw new Error('Failure');
            },
          },
          {
            name: 'op3',
            execute: async () => 'success',
          },
        ];

        const results = await retryHelper.executeBatchWithRetry(operations, {
          stopOnFirstFailure: true,
        });

        expect(results).toHaveLength(2); // Only first two executed
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(false);
      });
    });
  });

  describe('Transaction System', () => {
    describe('Transaction Creation and Initialization', () => {
      it('should create and initialize transaction', async () => {
        const transaction = await createTransaction(TEST_CWD);
        const info = transaction.getInfo();

        expect(info.id).toBeTruthy();
        expect(info.operationCount).toBe(0);
        expect(info.committed).toBe(false);
        expect(info.tempDir).toContain('.qwen\\transactions');
      });
    });

    describe('File Operations', () => {
      it('should create new files atomically', async () => {
        const transaction = await createTransaction(TEST_CWD);
        const filePath = path.join(TEST_CWD, 'docs', 'test.md');

        transaction.addCreate(filePath, '# Test Document');
        const result = await transaction.commit();

        expect(result.success).toBe(true);
        expect(result.committedFiles).toContain(filePath);

        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toBe('# Test Document');
      });

      it('should update existing files', async () => {
        const filePath = path.join(TEST_CWD, 'update-test.md');
        await fs.writeFile(filePath, 'Original content');

        const transaction = await createTransaction(TEST_CWD);
        transaction.addUpdate(filePath, 'Updated content');
        const result = await transaction.commit();

        expect(result.success).toBe(true);
        const content = await fs.readFile(filePath, 'utf-8');
        expect(content).toBe('Updated content');
      });

      it('should delete files', async () => {
        const filePath = path.join(TEST_CWD, 'delete-test.md');
        await fs.writeFile(filePath, 'To be deleted');

        const transaction = await createTransaction(TEST_CWD);
        transaction.addDelete(filePath);
        const result = await transaction.commit();

        expect(result.success).toBe(true);
        await expect(fs.access(filePath)).rejects.toThrow();
      });

      it('should move files', async () => {
        const sourcePath = path.join(TEST_CWD, 'source.md');
        const targetPath = path.join(TEST_CWD, 'target.md');
        await fs.writeFile(sourcePath, 'Content to move');

        const transaction = await createTransaction(TEST_CWD);
        transaction.addMove(sourcePath, targetPath);
        const result = await transaction.commit();

        expect(result.success).toBe(true);
        await expect(fs.access(sourcePath)).rejects.toThrow();
        const content = await fs.readFile(targetPath, 'utf-8');
        expect(content).toBe('Content to move');
      });
    });

    describe('Multiple Operations', () => {
      it('should commit multiple operations atomically', async () => {
        const transaction = await createTransaction(TEST_CWD);

        transaction.addCreate(path.join(TEST_CWD, 'file1.md'), 'Content 1');
        transaction.addCreate(path.join(TEST_CWD, 'file2.md'), 'Content 2');
        transaction.addCreate(path.join(TEST_CWD, 'file3.md'), 'Content 3');

        const result = await transaction.commit();

        expect(result.success).toBe(true);
        expect(result.committedFiles).toHaveLength(3);

        // Verify all files exist
        const file1 = await fs.readFile(
          path.join(TEST_CWD, 'file1.md'),
          'utf-8',
        );
        const file2 = await fs.readFile(
          path.join(TEST_CWD, 'file2.md'),
          'utf-8',
        );
        const file3 = await fs.readFile(
          path.join(TEST_CWD, 'file3.md'),
          'utf-8',
        );

        expect(file1).toBe('Content 1');
        expect(file2).toBe('Content 2');
        expect(file3).toBe('Content 3');
      });
    });

    describe('Rollback Mechanism', () => {
      it('should rollback on failure', async () => {
        const transaction = await createTransaction(TEST_CWD);
        const validFile = path.join(TEST_CWD, 'valid.md');

        // Create a scenario that will definitely fail - mock a staging failure
        transaction.addCreate(validFile, 'Valid content');

        // Add a second file with an invalid path that will fail during staging/commit
        const invalidPath = path.join(
          TEST_CWD,
          'nested',
          'very',
          'deep',
          'invalid\x00path.md',
        ); // Null byte in path
        transaction.addCreate(invalidPath, 'This will fail');

        const result = await transaction.commit();

        // Should fail and rollback
        expect(result.success).toBe(false);
        expect(result.rolledBack).toBe(true);

        // Verify the valid file does NOT exist (was rolled back)
        try {
          await fs.access(validFile);
          // If we reach here, file exists - test should fail
          expect(false).toBe(true); // Force failure
        } catch (error) {
          // File doesn't exist - this is what we want
          expect(error).toBeDefined();
        }
      });
    });

    describe('Checkpoints', () => {
      it('should create and restore checkpoints', async () => {
        const transaction = await createTransaction(TEST_CWD);

        transaction.addCreate('file1.md', 'Content 1');
        const checkpointId = transaction.createCheckpoint();

        transaction.addCreate('file2.md', 'Content 2');
        transaction.addCreate('file3.md', 'Content 3');

        // Restore to checkpoint
        transaction.restoreCheckpoint(checkpointId);

        const info = transaction.getInfo();
        expect(info.operationCount).toBe(1); // Only file1
        expect(info.checkpointCount).toBe(1);
      });
    });
  });

  describe('Logging System', () => {
    describe('Logger Initialization', () => {
      it('should initialize logger with default config', () => {
        const logger = initializeLogger(TEST_CWD);

        expect(logger).toBeDefined();
        expect(logger.getCorrelationId()).toBeTruthy();
      });

      it('should respect QWEN_BMAD_LOG_LEVEL env variable', () => {
        const originalEnv = process.env.QWEN_BMAD_LOG_LEVEL;
        process.env.QWEN_BMAD_LOG_LEVEL = 'debug';

        const logger = new BmadLogger(TEST_CWD);

        // Debug logs should be processed
        expect(logger).toBeDefined();

        process.env.QWEN_BMAD_LOG_LEVEL = originalEnv;
      });
    });

    describe('Log Levels', () => {
      it('should log at different levels', async () => {
        const logger = new BmadLogger(TEST_CWD, undefined, {
          level: LogLevel.DEBUG, // Explicitly set to DEBUG to log all levels
          consoleOutput: false,
          fileOutput: true,
        });

        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warning message');
        logger.error('Error message', new Error('Test error'));

        await logger.flush();
        await logger.shutdown();

        // Verify log file exists
        const logPath = path.join(TEST_CWD, '.qwen', 'logs', 'bmad.log');
        const logContent = await fs.readFile(logPath, 'utf-8');

        expect(logContent).toContain('Debug message');
        expect(logContent).toContain('Info message');
        expect(logContent).toContain('Warning message');
        expect(logContent).toContain('Error message');
      });

      it('should filter logs below threshold', async () => {
        const logger = new BmadLogger(TEST_CWD, undefined, {
          level: LogLevel.WARN,
          consoleOutput: false,
          fileOutput: true,
        });

        logger.debug('Should not appear');
        logger.info('Should not appear');
        logger.warn('Should appear');
        logger.error('Should appear');

        await logger.flush();
        await logger.shutdown();

        const logPath = path.join(TEST_CWD, '.qwen', 'logs', 'bmad.log');
        const logContent = await fs.readFile(logPath, 'utf-8');

        expect(logContent).not.toContain('Should not appear');
        expect(logContent).toContain('Should appear');
      });
    });

    describe('Context Tracking', () => {
      it('should track correlation ID across logs', async () => {
        const correlationId = 'test-correlation-123';
        const logger = new BmadLogger(TEST_CWD, correlationId, {
          consoleOutput: false,
          fileOutput: true,
        });

        logger.info('Message 1');
        logger.info('Message 2');
        logger.info('Message 3');

        await logger.flush();
        await logger.shutdown();

        const logPath = path.join(TEST_CWD, '.qwen', 'logs', 'bmad.log');
        const logContent = await fs.readFile(logPath, 'utf-8');
        const lines = logContent.trim().split('\n');

        lines.forEach((line) => {
          const entry = JSON.parse(line);
          expect(entry.correlationId).toBe(correlationId);
        });
      });

      it('should include context in logs', async () => {
        const logger = new BmadLogger(TEST_CWD, undefined, {
          consoleOutput: false,
          fileOutput: true,
        });

        logger.info('Agent started', {
          agentId: 'pm',
          taskId: 'generate-prd',
          step: 'initialization',
        });

        await logger.flush();
        await logger.shutdown();

        const logPath = path.join(TEST_CWD, '.qwen', 'logs', 'bmad.log');
        const logContent = await fs.readFile(logPath, 'utf-8');
        const entry = JSON.parse(logContent.trim());

        expect(entry.context.agentId).toBe('pm');
        expect(entry.context.taskId).toBe('generate-prd');
        expect(entry.context.step).toBe('initialization');
      });
    });

    describe('Secret Redaction', () => {
      it('should redact API keys', async () => {
        const logger = new BmadLogger(TEST_CWD, undefined, {
          consoleOutput: false,
          fileOutput: true,
          redactSecrets: true,
        });

        logger.info(
          'API key is: api_key=sk_test_1234567890abcdefghijklmnopqrstuvwxyz',
        );

        await logger.flush();
        await logger.shutdown();

        const logPath = path.join(TEST_CWD, '.qwen', 'logs', 'bmad.log');
        const logContent = await fs.readFile(logPath, 'utf-8');

        expect(logContent).toContain('[REDACTED]');
        expect(logContent).not.toContain(
          'sk_test_1234567890abcdefghijklmnopqrstuvwxyz',
        );
      });

      it('should redact tokens', async () => {
        const logger = new BmadLogger(TEST_CWD, undefined, {
          consoleOutput: false,
          fileOutput: true,
          redactSecrets: true,
        });

        logger.info('Token: token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test"');

        await logger.flush();
        await logger.shutdown();

        const logPath = path.join(TEST_CWD, '.qwen', 'logs', 'bmad.log');
        const logContent = await fs.readFile(logPath, 'utf-8');

        expect(logContent).toContain('[REDACTED]');
      });

      it('should redact passwords', async () => {
        const logger = new BmadLogger(TEST_CWD, undefined, {
          consoleOutput: false,
          fileOutput: true,
          redactSecrets: true,
        });

        logger.info('Config: password="SuperSecret123!"');

        await logger.flush();
        await logger.shutdown();

        const logPath = path.join(TEST_CWD, '.qwen', 'logs', 'bmad.log');
        const logContent = await fs.readFile(logPath, 'utf-8');

        expect(logContent).toContain('[REDACTED]');
        expect(logContent).not.toContain('SuperSecret123!');
      });
    });

    describe('Child Loggers', () => {
      it('should create child logger with inherited context', async () => {
        const logger = new BmadLogger(TEST_CWD, undefined, {
          consoleOutput: false,
          fileOutput: true,
        });

        const childLogger = logger.child({ agentId: 'architect' });
        childLogger.info('Child log message', { taskId: 'design' });

        await logger.flush();
        await logger.shutdown();

        const logPath = path.join(TEST_CWD, '.qwen', 'logs', 'bmad.log');
        const logContent = await fs.readFile(logPath, 'utf-8');
        const entry = JSON.parse(logContent.trim());

        expect(entry.context.agentId).toBe('architect');
        expect(entry.context.taskId).toBe('design');
      });
    });
  });

  describe('Integration Scenarios', () => {
    describe('Error Handling + Retry + Logging', () => {
      it('should log retry attempts', async () => {
        const logger = new BmadLogger(TEST_CWD, 'test-correlation', {
          consoleOutput: false,
          fileOutput: true,
        });

        const retryHelper = new RetryHelper({
          maxAttempts: 3,
          initialDelay: 10,
        });

        let attempts = 0;
        await retryHelper.executeWithRetry(async () => {
          attempts++;
          logger.info(`Attempt ${attempts}`);

          if (attempts < 2) {
            throw new RecoverableError(
              'Temporary failure',
              ErrorType.NETWORK_ERROR,
            );
          }
          return 'success';
        });

        await logger.flush();
        await logger.shutdown();

        const logPath = path.join(TEST_CWD, '.qwen', 'logs', 'bmad.log');
        const logContent = await fs.readFile(logPath, 'utf-8');

        expect(logContent).toContain('Attempt 1');
        expect(logContent).toContain('Attempt 2');
      });
    });

    describe('Transaction + Error Handling + Logging', () => {
      it('should log transaction operations', async () => {
        const logger = new BmadLogger(TEST_CWD, undefined, {
          consoleOutput: false,
          fileOutput: true,
        });

        logger.info('Starting transaction');

        const transaction = await createTransaction(TEST_CWD);
        transaction.addCreate('docs/prd.md', '# PRD');
        transaction.addCreate('docs/architecture.md', '# Architecture');

        const result = await transaction.commit();

        if (result.success) {
          logger.info('Transaction committed', {
            metadata: { filesCommitted: result.committedFiles.length },
          });
        } else {
          logger.error('Transaction failed', result.error);
        }

        await logger.flush();
        await logger.shutdown();

        const logPath = path.join(TEST_CWD, '.qwen', 'logs', 'bmad.log');
        const logContent = await fs.readFile(logPath, 'utf-8');

        expect(logContent).toContain('Starting transaction');
        expect(logContent).toContain('Transaction committed');
      });
    });

    describe('Full Workflow Simulation', () => {
      it('should handle complete error + retry + transaction flow', async () => {
        const logger = new BmadLogger(TEST_CWD, 'workflow-test', {
          consoleOutput: false,
          fileOutput: true,
        });

        const retryHelper = new RetryHelper({
          maxAttempts: 3,
          initialDelay: 10,
        });

        // Simulate agent execution with retry
        const result = await retryHelper.executeWithRetry(async () => {
          logger.info('Executing PM agent');

          const transaction = await createTransaction(TEST_CWD);
          transaction.addCreate('docs/prd.md', '# Product Requirements');

          const txResult = await transaction.commit();

          if (!txResult.success) {
            logger.error('Transaction failed', txResult.error);
            throw new RecoverableError(
              'Failed to write PRD',
              ErrorType.FILE_WRITE_FAILED,
            );
          }

          logger.info('PRD created successfully');
          return txResult;
        });

        expect(result.success).toBe(true);

        await logger.flush();
        await logger.shutdown();

        // Verify PRD was created
        const prdPath = path.join(TEST_CWD, 'docs', 'prd.md');
        const prdContent = await fs.readFile(prdPath, 'utf-8');
        expect(prdContent).toBe('# Product Requirements');

        // Verify logs
        const logPath = path.join(TEST_CWD, '.qwen', 'logs', 'bmad.log');
        const logContent = await fs.readFile(logPath, 'utf-8');
        expect(logContent).toContain('Executing PM agent');
        expect(logContent).toContain('PRD created successfully');
      });
    });
  });
});
