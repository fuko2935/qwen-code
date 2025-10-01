/**
 * Transaction Manager
 *
 * Provides atomic file operations with rollback capabilities.
 * Uses temporary directories for staging changes before committing.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileOperationError } from '../errors/BmadErrors.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Transaction operation type
 */
export enum TransactionOperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  MOVE = 'move',
}

/**
 * Single file operation in a transaction
 */
export interface FileOperation {
  type: TransactionOperationType;
  targetPath: string;
  content?: string;
  sourcePath?: string;
  backupPath?: string;
}

/**
 * Transaction checkpoint
 */
export interface TransactionCheckpoint {
  id: string;
  timestamp: Date;
  operations: FileOperation[];
  committed: boolean;
}

/**
 * Transaction result
 */
export interface TransactionResult {
  success: boolean;
  committedFiles: string[];
  error?: Error;
  rolledBack: boolean;
}

/**
 * Transaction Manager for atomic file operations
 */
export class TransactionManager {
  private transactionId: string;
  private tempDir: string;
  private operations: FileOperation[] = [];
  private checkpoints: TransactionCheckpoint[] = [];
  private committed: boolean = false;

  constructor(
    private cwd: string,
    transactionId?: string,
  ) {
    this.transactionId = transactionId || uuidv4();
    this.tempDir = path.join(cwd, '.qwen', 'transactions', this.transactionId);
  }

  /**
   * Initialize transaction (create temp directory)
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log(`📦 Transaction ${this.transactionId} initialized`);
    } catch (error) {
      throw new FileOperationError('write', this.tempDir, error as Error);
    }
  }

  /**
   * Add a file creation operation
   */
  addCreate(targetPath: string, content: string): void {
    this.ensureNotCommitted();

    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.join(this.cwd, targetPath);

    this.operations.push({
      type: TransactionOperationType.CREATE,
      targetPath: absolutePath,
      content,
    });
  }

  /**
   * Add a file update operation
   */
  addUpdate(targetPath: string, content: string): void {
    this.ensureNotCommitted();

    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.join(this.cwd, targetPath);

    this.operations.push({
      type: TransactionOperationType.UPDATE,
      targetPath: absolutePath,
      content,
    });
  }

  /**
   * Add a file deletion operation
   */
  addDelete(targetPath: string): void {
    this.ensureNotCommitted();

    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.join(this.cwd, targetPath);

    this.operations.push({
      type: TransactionOperationType.DELETE,
      targetPath: absolutePath,
    });
  }

  /**
   * Add a file move operation
   */
  addMove(sourcePath: string, targetPath: string): void {
    this.ensureNotCommitted();

    const absoluteSource = path.isAbsolute(sourcePath)
      ? sourcePath
      : path.join(this.cwd, sourcePath);

    const absoluteTarget = path.isAbsolute(targetPath)
      ? targetPath
      : path.join(this.cwd, targetPath);

    this.operations.push({
      type: TransactionOperationType.MOVE,
      sourcePath: absoluteSource,
      targetPath: absoluteTarget,
    });
  }

  /**
   * Create a checkpoint
   */
  createCheckpoint(): string {
    const checkpoint: TransactionCheckpoint = {
      id: uuidv4(),
      timestamp: new Date(),
      operations: [...this.operations],
      committed: false,
    };
    this.checkpoints.push(checkpoint);
    console.log(`✓ Checkpoint created: ${checkpoint.id}`);
    return checkpoint.id;
  }

  /**
   * Restore to a checkpoint
   */
  restoreCheckpoint(checkpointId: string): void {
    this.ensureNotCommitted();

    const checkpoint = this.checkpoints.find((cp) => cp.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    this.operations = [...checkpoint.operations];
    console.log(`↺ Restored to checkpoint: ${checkpointId}`);
  }

  /**
   * Stage all operations (prepare files in temp directory)
   */
  private async stage(): Promise<void> {
    console.log(`📝 Staging ${this.operations.length} operations...`);

    for (const operation of this.operations) {
      try {
        switch (operation.type) {
          case TransactionOperationType.CREATE:
          case TransactionOperationType.UPDATE:
            await this.stageWrite(operation);
            break;

          case TransactionOperationType.DELETE:
            await this.stageDelete(operation);
            break;

          case TransactionOperationType.MOVE:
            await this.stageMove(operation);
            break;
          default:
            // Handle unknown operation types
            throw new FileOperationError(
              'write',
              operation.targetPath,
              new Error(`Unknown operation type: ${(operation as { type: string }).type}`),
            );
        }
      } catch (error) {
        throw new FileOperationError(
          'write',
          operation.targetPath,
          error as Error,
        );
      }
    }

    console.log(`✓ All operations staged successfully`);
  }

  /**
   * Stage a write operation
   */
  private async stageWrite(operation: FileOperation): Promise<void> {
    if (!operation.content) {
      throw new Error('Content is required for create/update operations');
    }

    const tempPath = path.join(
      this.tempDir,
      path.basename(operation.targetPath),
    );

    // Write to temp file
    await fs.writeFile(tempPath, operation.content, 'utf-8');
    operation.backupPath = tempPath;

    // For updates, backup original file if it exists
    if (operation.type === TransactionOperationType.UPDATE) {
      try {
        const originalContent = await fs.readFile(
          operation.targetPath,
          'utf-8',
        );
        const backupPath = path.join(
          this.tempDir,
          `${path.basename(operation.targetPath)}.backup`,
        );
        await fs.writeFile(backupPath, originalContent, 'utf-8');
        // Store backup path for potential rollback
      } catch (_error) {
        // File might not exist yet, which is okay
      }
    }
  }

  /**
   * Stage a delete operation
   */
  private async stageDelete(operation: FileOperation): Promise<void> {
    // Backup file before deletion
    try {
      const content = await fs.readFile(operation.targetPath, 'utf-8');
      const backupPath = path.join(
        this.tempDir,
        `${path.basename(operation.targetPath)}.backup`,
      );
      await fs.writeFile(backupPath, content, 'utf-8');
      operation.backupPath = backupPath;
    } catch (_error) {
      // File might not exist, which is okay for delete
      console.warn(
        `Could not backup file for deletion: ${operation.targetPath}`,
      );
    }
  }

  /**
   * Stage a move operation
   */
  private async stageMove(operation: FileOperation): Promise<void> {
    if (!operation.sourcePath) {
      throw new Error('Source path is required for move operations');
    }

    try {
      // Backup source file
      const content = await fs.readFile(operation.sourcePath, 'utf-8');
      const backupPath = path.join(
        this.tempDir,
        `${path.basename(operation.sourcePath)}.backup`,
      );
      await fs.writeFile(backupPath, content, 'utf-8');
      operation.backupPath = backupPath;
    } catch (error) {
      throw new FileOperationError(
        'read',
        operation.sourcePath,
        error as Error,
      );
    }
  }

  /**
   * Commit all operations atomically
   */
  async commit(): Promise<TransactionResult> {
    this.ensureNotCommitted();

    const committedFiles: string[] = [];

    try {
      // Stage all operations first
      await this.stage();

      console.log(`💾 Committing ${this.operations.length} operations...`);

      // Apply all operations
      for (const operation of this.operations) {
        try {
          switch (operation.type) {
            case TransactionOperationType.CREATE:
            case TransactionOperationType.UPDATE:
              await this.commitWrite(operation);
              break;

            case TransactionOperationType.DELETE:
              await this.commitDelete(operation);
              break;

            case TransactionOperationType.MOVE:
              await this.commitMove(operation);
              break;
            default:
              // Handle unknown operation types
              throw new FileOperationError(
                'write',
                operation.targetPath,
                new Error(`Unknown operation type: ${(operation as { type: string }).type}`),
              );
          }
          committedFiles.push(operation.targetPath);
        } catch (error) {
          // Rollback on any failure
          console.error(
            `❌ Commit failed for ${operation.targetPath}, rolling back...`,
          );
          await this.rollback(committedFiles);

          return {
            success: false,
            committedFiles: [],
            error: error as Error,
            rolledBack: true,
          };
        }
      }

      this.committed = true;

      // Cleanup temp directory
      await this.cleanup();

      console.log(
        `✅ Transaction ${this.transactionId} committed successfully`,
      );

      return {
        success: true,
        committedFiles,
        rolledBack: false,
      };
    } catch (error) {
      console.error(`❌ Transaction ${this.transactionId} failed:`, error);
      await this.rollback(committedFiles);

      return {
        success: false,
        committedFiles: [],
        error: error as Error,
        rolledBack: true,
      };
    }
  }

  /**
   * Commit a write operation
   */
  private async commitWrite(operation: FileOperation): Promise<void> {
    if (!operation.backupPath) {
      throw new Error('Backup path not found, operation was not staged');
    }

    // Ensure target directory exists
    const targetDir = path.dirname(operation.targetPath);
    await fs.mkdir(targetDir, { recursive: true });

    // Copy from temp to target (atomic rename if possible)
    try {
      await fs.copyFile(operation.backupPath, operation.targetPath);
    } catch (error) {
      throw new FileOperationError(
        'write',
        operation.targetPath,
        error as Error,
      );
    }
  }

  /**
   * Commit a delete operation
   */
  private async commitDelete(operation: FileOperation): Promise<void> {
    try {
      await fs.unlink(operation.targetPath);
    } catch (_error) {
      // File might already be deleted
      console.warn(`Could not delete file: ${operation.targetPath}`);
    }
  }

  /**
   * Commit a move operation
   */
  private async commitMove(operation: FileOperation): Promise<void> {
    if (!operation.sourcePath) {
      throw new Error('Source path is required for move operations');
    }

    // Ensure target directory exists
    const targetDir = path.dirname(operation.targetPath);
    await fs.mkdir(targetDir, { recursive: true });

    try {
      await fs.rename(operation.sourcePath, operation.targetPath);
    } catch (error) {
      throw new FileOperationError(
        'move',
        operation.targetPath,
        error as Error,
      );
    }
  }

  /**
   * Rollback committed files
   */
  private async rollback(committedFiles: string[]): Promise<void> {
    console.log(`↩️  Rolling back ${committedFiles.length} files...`);

    for (const filePath of committedFiles) {
      const operation = this.operations.find(
        (op) => op.targetPath === filePath,
      );
      if (!operation) continue;

      try {
        if (operation.backupPath) {
          // Restore from backup
          const backupContent = await fs.readFile(
            operation.backupPath,
            'utf-8',
          );
          await fs.writeFile(operation.targetPath, backupContent, 'utf-8');
          console.log(`  ↺ Restored: ${filePath}`);
        } else if (operation.type === TransactionOperationType.CREATE) {
          // Delete newly created file
          await fs.unlink(operation.targetPath);
          console.log(`  🗑️  Deleted: ${filePath}`);
        }
      } catch (error) {
        console.error(`  ⚠️  Failed to rollback ${filePath}:`, error);
      }
    }

    console.log(`✓ Rollback completed`);
  }

  /**
   * Cleanup temp directory
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
      console.log(`🧹 Transaction temp directory cleaned up`);
    } catch (error) {
      console.warn(`Could not cleanup temp directory: ${this.tempDir}`, error);
    }
  }

  /**
   * Ensure transaction has not been committed yet
   */
  private ensureNotCommitted(): void {
    if (this.committed) {
      throw new Error('Transaction has already been committed');
    }
  }

  /**
   * Get transaction info
   */
  getInfo() {
    return {
      id: this.transactionId,
      operationCount: this.operations.length,
      checkpointCount: this.checkpoints.length,
      committed: this.committed,
      tempDir: this.tempDir,
    };
  }
}

/**
 * Create a new transaction
 */
export async function createTransaction(
  cwd: string,
  transactionId?: string,
): Promise<TransactionManager> {
  const transaction = new TransactionManager(cwd, transactionId);
  await transaction.init();
  return transaction;
}
