/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContextState } from '../subagents/subagent.js';
import type { SessionId, SubagentSessionConfig } from './types.js';

/**
 * @fileoverview Manages context state for a single session with inheritance support.
 *
 * SessionContext wraps ContextState and provides:
 * - Per-session isolated context
 * - Optional inheritance from parent session
 * - Copy-on-write semantics for inherited values
 */

/**
 * Holds the runtime context state for a session.
 *
 * Each session has its own isolated ContextState that can optionally
 * inherit values from its parent session. This enables nested tasks
 * to access parent context while maintaining their own modifications.
 *
 * @example
 * ```ts
 * const parentCtx = new SessionContext('parent-1', { inheritContext: false, ... });
 * parentCtx.contextState.set('project_name', 'MyProject');
 *
 * const childCtx = new SessionContext('child-1', { inheritContext: true, ... }, parentCtx);
 * console.log(childCtx.contextState.get('project_name')); // 'MyProject'
 * childCtx.contextState.set('task', 'subtask-1'); // Child-specific value
 * ```
 */
export class SessionContext {
  /** Unique identifier for this session */
  readonly id: SessionId;

  /** Parent session ID (if any) */
  readonly parentId?: SessionId;

  /** Configuration for this session */
  readonly config: SubagentSessionConfig;

  /** Runtime context state accessible to the subagent */
  readonly contextState: ContextState;

  /**
   * Creates a new SessionContext.
   *
   * @param id - Unique session identifier
   * @param config - Session configuration
   * @param parent - Optional parent context for inheritance
   */
  constructor(
    id: SessionId,
    config: SubagentSessionConfig,
    parent?: SessionContext,
  ) {
    this.id = id;
    this.parentId = parent?.id;
    this.config = config;
    this.contextState = new ContextState();

    // Inherit parent context if configured
    if (config.inheritContext && parent) {
      this.inheritFromParent(parent);
    }
  }

  /**
   * Inherits all key-value pairs from parent context.
   * Uses shallow copy semantics - values are not deep cloned.
   *
   * @param parent - Parent SessionContext to inherit from
   */
  private inheritFromParent(parent: SessionContext): void {
    const parentState = parent.contextState;
    const keys = parentState.get_keys();

    for (const key of keys) {
      const value = parentState.get(key);
      this.contextState.set(key, value);
    }
  }

  /**
   * Gets all context keys for this session.
   *
   * @returns Array of all context keys
   */
  getKeys(): string[] {
    return this.contextState.get_keys();
  }

  /**
   * Gets a context value.
   *
   * @param key - Context key
   * @returns The value, or undefined if not found
   */
  get(key: string): unknown {
    return this.contextState.get(key);
  }

  /**
   * Sets a context value.
   *
   * @param key - Context key
   * @param value - Value to set
   */
  set(key: string, value: unknown): void {
    this.contextState.set(key, value);
  }

  /**
   * Creates a debug-friendly string representation.
   *
   * @returns Summary of session context
   */
  toString(): string {
    const keys = this.getKeys();
    return `SessionContext(id=${this.id}, parent=${this.parentId ?? 'none'}, keys=${keys.length})`;
  }
}
