/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import type {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
} from '../tools/tools.js';

export type SubAgentEvent =
  | 'start'
  | 'round_start'
  | 'round_end'
  | 'stream_text'
  | 'tool_call'
  | 'tool_result'
  | 'tool_waiting_approval'
  | 'finish'
  | 'error'
  | 'session_started'
  | 'session_switched'
  | 'session_paused'
  | 'session_resumed'
  | 'session_completed'
  | 'session_aborted'
  | 'user_message_to_session'
  | 'subagent_message_to_user';

export enum SubAgentEventType {
  START = 'start',
  ROUND_START = 'round_start',
  ROUND_END = 'round_end',
  STREAM_TEXT = 'stream_text',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
  TOOL_WAITING_APPROVAL = 'tool_waiting_approval',
  FINISH = 'finish',
  ERROR = 'error',
  SESSION_STARTED = 'session_started',
  SESSION_SWITCHED = 'session_switched',
  SESSION_PAUSED = 'session_paused',
  SESSION_RESUMED = 'session_resumed',
  SESSION_COMPLETED = 'session_completed',
  SESSION_ABORTED = 'session_aborted',
  USER_MESSAGE_TO_SESSION = 'user_message_to_session',
  SUBAGENT_MESSAGE_TO_USER = 'subagent_message_to_user',
}

export interface SubAgentStartEvent {
  subagentId: string;
  name: string;
  model?: string;
  tools: string[];
  timestamp: number;
}

export interface SubAgentRoundEvent {
  subagentId: string;
  round: number;
  promptId: string;
  timestamp: number;
}

export interface SubAgentStreamTextEvent {
  subagentId: string;
  round: number;
  text: string;
  timestamp: number;
}

export interface SubAgentToolCallEvent {
  subagentId: string;
  round: number;
  callId: string;
  name: string;
  args: Record<string, unknown>;
  description: string;
  timestamp: number;
}

export interface SubAgentToolResultEvent {
  subagentId: string;
  round: number;
  callId: string;
  name: string;
  success: boolean;
  error?: string;
  resultDisplay?: string;
  durationMs?: number;
  timestamp: number;
}

export interface SubAgentApprovalRequestEvent {
  subagentId: string;
  round: number;
  callId: string;
  name: string;
  description: string;
  confirmationDetails: Omit<ToolCallConfirmationDetails, 'onConfirm'> & {
    type: ToolCallConfirmationDetails['type'];
  };
  respond: (
    outcome: ToolConfirmationOutcome,
    payload?: Parameters<ToolCallConfirmationDetails['onConfirm']>[1],
  ) => Promise<void>;
  timestamp: number;
}

export interface SubAgentFinishEvent {
  subagentId: string;
  terminateReason: string;
  timestamp: number;
  rounds?: number;
  totalDurationMs?: number;
  totalToolCalls?: number;
  successfulToolCalls?: number;
  failedToolCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface SubAgentErrorEvent {
  subagentId: string;
  error: string;
  timestamp: number;
}

/**
 * Base interface for session-related events.
 */
export interface SessionEventPayload {
  sessionId: string;
  timestamp: number;
}

/**
 * Event: A new interactive session was started.
 */
export interface SubAgentSessionStartedEvent extends SessionEventPayload {
  node: import('../session/types.js').SessionNode;
}

/**
 * Event: The active session switched to a different one.
 */
export interface SubAgentSessionSwitchedEvent extends SessionEventPayload {
  fromSessionId?: string;
}

/**
 * Event: A session was paused.
 * Inherits sessionId and timestamp from SessionEventPayload.
 */
export type SubAgentSessionPausedEvent = SessionEventPayload;

/**
 * Event: A paused session was resumed.
 * Inherits sessionId and timestamp from SessionEventPayload.
 */
export type SubAgentSessionResumedEvent = SessionEventPayload;

/**
 * Event: A session completed successfully.
 */
export interface SubAgentSessionCompletedEvent extends SessionEventPayload {
  result?: unknown;
  terminateReason?: string;
}

/**
 * Event: A session was aborted (error or cancellation).
 */
export interface SubAgentSessionAbortedEvent extends SessionEventPayload {
  reason?: string;
}

/**
 * Event: User sent a message to a session.
 */
export interface SubAgentUserMessageEvent extends SessionEventPayload {
  text: string;
}

/**
 * Event: Subagent sent a message (chunk or final) to user.
 */
export interface SubAgentToUserMessageEvent extends SessionEventPayload {
  textChunk?: string;
  finalText?: string;
}

export class SubAgentEventEmitter {
  private ee = new EventEmitter();

  on(event: SubAgentEvent, listener: (...args: unknown[]) => void) {
    this.ee.on(event, listener);
  }

  off(event: SubAgentEvent, listener: (...args: unknown[]) => void) {
    this.ee.off(event, listener);
  }

  emit(event: SubAgentEvent, payload: unknown) {
    this.ee.emit(event, payload);
  }
}
