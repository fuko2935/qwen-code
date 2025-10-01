/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Core types for hierarchical session management system.
 *
 * This module defines the foundational types for interactive, nested sessions
 * that enable Roo Code-style subtask workflows with:
 * - Automatic UI session switching
 * - Bidirectional user-agent messaging
 * - Hierarchical task delegation
 * - Session lifecycle management
 */

/**
 * Unique identifier for a session.
 */
export type SessionId = string;

/**
 * Status of a session in its lifecycle.
 */
export type SessionStatus = 'active' | 'paused' | 'completed' | 'aborted';

/**
 * Configuration for subagent session behavior.
 */
export interface SubagentSessionConfig {
  /**
   * Whether the session supports interactive bidirectional messaging.
   * @default false
   */
  interactive: boolean;

  /**
   * Maximum depth of nested sessions (protection against infinite recursion).
   * @default 3
   */
  maxDepth: number;

  /**
   * Automatically switch UI to this session when created.
   * @default true
   */
  autoSwitch: boolean;

  /**
   * Inherit parent session's context state.
   * @default true
   */
  inheritContext: boolean;

  /**
   * Allow user to send messages to this session.
   * @default true
   */
  allowUserInteraction: boolean;
}

/**
 * Represents a node in the session tree.
 */
export interface SessionNode {
  /** Unique session identifier */
  id: SessionId;

  /** Human-readable session name */
  name: string;

  /** Depth in the session tree (0 = root) */
  depth: number;

  /** Current lifecycle status */
  status: SessionStatus;

  /** Parent session ID (undefined for root) */
  parentId?: SessionId;

  /** Child session IDs */
  children: SessionId[];

  /** Creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;

  /** Name of the subagent handling this session */
  subagentName?: string;

  /** Session configuration */
  config: SubagentSessionConfig;
}

/**
 * Base interface for all session events.
 */
export interface SessionEventBase {
  sessionId: SessionId;
  timestamp: number;
}

/**
 * Event: A new session was created and started.
 */
export interface SessionStartedEvent extends SessionEventBase {
  type: 'SESSION_STARTED';
  node: SessionNode;
}

/**
 * Event: The active session changed.
 */
export interface SessionSwitchedEvent extends SessionEventBase {
  type: 'SESSION_SWITCHED';
  fromSessionId?: SessionId;
}

/**
 * Event: A session was paused.
 */
export interface SessionPausedEvent extends SessionEventBase {
  type: 'SESSION_PAUSED';
}

/**
 * Event: A paused session was resumed.
 */
export interface SessionResumedEvent extends SessionEventBase {
  type: 'SESSION_RESUMED';
}

/**
 * Event: A session completed successfully.
 */
export interface SessionCompletedEvent extends SessionEventBase {
  type: 'SESSION_COMPLETED';
  result?: unknown;
  terminateReason?: string;
}

/**
 * Event: A session was aborted (error or user cancellation).
 */
export interface SessionAbortedEvent extends SessionEventBase {
  type: 'SESSION_ABORTED';
  reason?: string;
}

/**
 * Event: User sent a message to a specific session.
 */
export interface UserMessageToSessionEvent extends SessionEventBase {
  type: 'USER_MESSAGE_TO_SESSION';
  text: string;
}

/**
 * Event: Subagent sent a message chunk to the user.
 * Can be streaming (textChunk) or final (finalText).
 */
export interface SubagentMessageToUserEvent extends SessionEventBase {
  type: 'SUBAGENT_MESSAGE_TO_USER';
  /** Streaming text chunk (for real-time display) */
  textChunk?: string;
  /** Complete message text (sent at message end) */
  finalText?: string;
}

/**
 * Union type of all session events.
 */
export type SessionEvent =
  | SessionStartedEvent
  | SessionSwitchedEvent
  | SessionPausedEvent
  | SessionResumedEvent
  | SessionCompletedEvent
  | SessionAbortedEvent
  | UserMessageToSessionEvent
  | SubagentMessageToUserEvent;

/**
 * Type guard to check if an event is a SessionEvent.
 */
export function isSessionEvent(event: unknown): event is SessionEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    'sessionId' in event &&
    'timestamp' in event
  );
}

/**
 * Error thrown when session operations fail.
 */
export class SessionError extends Error {
  constructor(
    message: string,
    readonly sessionId?: SessionId,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}
