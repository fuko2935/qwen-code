/**
 * @license
 * Copyright 2025 Qwen + BMAD Method
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { SessionState } from '../config/bmadConfig.js';
import {
  BmadPaths,
  BMAD_CONFIG,
  WorkflowPhase,
  AgentId,
} from '../config/bmadConfig.js';

/**
 * Manages BMAD session state persistence and recovery
 */
export class BmadSessionManager {
  private readonly paths: BmadPaths;
  private state: SessionState | null = null;

  constructor(_cwd: string) {
    this.paths = new BmadPaths(_cwd);
  }

  /**
   * Read session state from disk
   */
  async read(): Promise<SessionState | null> {
    try {
      const content = await fs.readFile(this.paths.sessionFile, 'utf-8');
      this.state = JSON.parse(content) as SessionState;
      return this.state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, not an error
        return null;
      }
      throw new Error(
        `Failed to read session file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Write session state to disk (atomic)
   */
  async write(state: SessionState): Promise<void> {
    this.state = state;

    // Ensure .qwen directory exists
    const sessionDir = path.dirname(this.paths.sessionFile);
    await fs.mkdir(sessionDir, { recursive: true });

    // Atomic write: write to temp file, then rename
    const tempFile = path.join(
      os.tmpdir(),
      `bmad-session-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );

    try {
      const content = JSON.stringify(state, null, 2);
      await fs.writeFile(tempFile, content, 'utf-8');

      // Atomic rename (works on Windows too)
      await fs.rename(tempFile, this.paths.sessionFile);
    } catch (error) {
      // Clean up temp file if rename failed
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
      throw new Error(
        `Failed to write session file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Update session state with partial data
   */
  async update(patch: Partial<SessionState>): Promise<SessionState> {
    const current =
      this.state || (await this.read()) || this.createInitialState();
    const updated: SessionState = {
      ...current,
      ...patch,
      timestamp: Date.now(),
    };
    await this.write(updated);
    return updated;
  }

  /**
   * Clear session state
   */
  async clear(): Promise<void> {
    this.state = null;
    try {
      await fs.unlink(this.paths.sessionFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Check if a session exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.paths.sessionFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current state (without reading from disk)
   */
  getState(): SessionState | null {
    return this.state;
  }

  /**
   * Create initial session state
   */
  private createInitialState(): SessionState {
    return {
      mode: BMAD_CONFIG.DEFAULT_MODE,
      projectType: 'greenfield',
      currentPhase: WorkflowPhase.INIT,
      currentAgent: null,
      completedSteps: [],
      artifacts: {
        epics: [],
        stories: [],
        qaReports: [],
        qaGates: [],
        shards: [],
      },
      context: {},
      timestamp: Date.now(),
      retryCount: 0,
    };
  }

  /**
   * Check if workflow is complete
   */
  isWorkflowComplete(state: SessionState): boolean {
    return state.currentPhase === WorkflowPhase.COMPLETE;
  }

  /**
   * Check if workflow can be resumed
   */
  canResume(state: SessionState): boolean {
    return (
      state.currentPhase !== WorkflowPhase.INIT &&
      state.currentPhase !== WorkflowPhase.COMPLETE &&
      state.completedSteps.length > 0
    );
  }

  /**
   * Get next phase based on current phase
   */
  getNextPhase(currentPhase: WorkflowPhase): WorkflowPhase {
    const phaseOrder = [
      WorkflowPhase.INIT,
      WorkflowPhase.ANALYSIS,
      WorkflowPhase.PRODUCT,
      WorkflowPhase.UX,
      WorkflowPhase.ARCHITECTURE,
      WorkflowPhase.PLANNING,
      WorkflowPhase.STORY_CREATION,
      WorkflowPhase.DEVELOPMENT,
      WorkflowPhase.QA,
      WorkflowPhase.COMPLETE,
    ];

    const currentIndex = phaseOrder.indexOf(currentPhase);
    if (currentIndex === -1 || currentIndex >= phaseOrder.length - 1) {
      return WorkflowPhase.COMPLETE;
    }

    return phaseOrder[currentIndex + 1];
  }

  /**
   * Get recommended agent for a phase
   */
  getPhaseAgent(phase: WorkflowPhase): AgentId | null {
    const phaseAgentMap: Record<WorkflowPhase, AgentId | null> = {
      [WorkflowPhase.INIT]: AgentId.ORCHESTRATOR,
      [WorkflowPhase.ANALYSIS]: AgentId.ANALYST,
      [WorkflowPhase.PRODUCT]: AgentId.PM,
      [WorkflowPhase.UX]: AgentId.UX,
      [WorkflowPhase.ARCHITECTURE]: AgentId.ARCHITECT,
      [WorkflowPhase.PLANNING]: AgentId.PO,
      [WorkflowPhase.STORY_CREATION]: AgentId.SM,
      [WorkflowPhase.DEVELOPMENT]: AgentId.DEV,
      [WorkflowPhase.QA]: AgentId.QA,
      [WorkflowPhase.COMPLETE]: null,
    };

    return phaseAgentMap[phase] || null;
  }

  /**
   * Backup current session
   */
  async backup(): Promise<string> {
    if (!this.state) {
      throw new Error('No session state to backup');
    }

    const backupDir = path.join(
      path.dirname(this.paths.sessionFile),
      'backups',
    );
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `bmad-session-${timestamp}.json`);

    await fs.writeFile(
      backupFile,
      JSON.stringify(this.state, null, 2),
      'utf-8',
    );
    return backupFile;
  }

  /**
   * Restore session from backup
   */
  async restore(backupFile: string): Promise<SessionState> {
    const content = await fs.readFile(backupFile, 'utf-8');
    const state = JSON.parse(content) as SessionState;
    await this.write(state);
    return state;
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<string[]> {
    const backupDir = path.join(
      path.dirname(this.paths.sessionFile),
      'backups',
    );
    try {
      const files = await fs.readdir(backupDir);
      return files
        .filter((f) => f.startsWith('bmad-session-') && f.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first
    } catch {
      return [];
    }
  }
}
