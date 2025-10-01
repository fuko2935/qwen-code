/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Session management system for hierarchical, interactive subagent workflows.
 *
 * This module provides a complete session management infrastructure enabling:
 * - Hierarchical session trees with parent-child relationships
 * - Automatic UI session switching
 * - Bidirectional messaging between user and subagents
 * - Context inheritance from parent to child sessions
 * - Event-driven architecture for UI integration
 *
 * @example
 * ```ts
 * import { SessionManager, type SubagentSessionConfig } from './session/index.js';
 *
 * // Create session manager
 * const sm = new SessionManager();
 *
 * // Create a session
 * const config: SubagentSessionConfig = {
 *   interactive: true,
 *   maxDepth: 3,
 *   autoSwitch: true,
 *   inheritContext: true,
 *   allowUserInteraction: true,
 * };
 *
 * const sessionId = await sm.createSession({
 *   name: 'analyzer',
 *   sessionConfig: config,
 * });
 *
 * // Listen to events
 * sm.on((event) => {
 *   console.log('Session event:', event.type);
 * });
 * ```
 */

// Core types
export type {
  SessionId,
  SessionStatus,
  SessionNode,
  SubagentSessionConfig,
  SessionEvent,
  SessionEventBase,
  SessionStartedEvent,
  SessionSwitchedEvent,
  SessionPausedEvent,
  SessionResumedEvent,
  SessionCompletedEvent,
  SessionAbortedEvent,
  UserMessageToSessionEvent,
  SubagentMessageToUserEvent,
} from './types.js';

export { SessionError, isSessionEvent } from './types.js';

// Core classes
export { SessionContext } from './SessionContext.js';
export { SessionStack } from './SessionStack.js';
export {
  SessionManager,
  type SessionEventListener,
  type CreateSessionOptions,
} from './SessionManager.js';
