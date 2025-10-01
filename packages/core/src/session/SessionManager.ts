/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { SessionStack } from './SessionStack.js';
import { SessionContext } from './SessionContext.js';
import type {
  SessionId,
  SessionNode,
  SubagentSessionConfig,
  SessionEvent,
  SessionStartedEvent,
  SessionSwitchedEvent,
  SessionCompletedEvent,
  SessionAbortedEvent,
} from './types.js';
import { SessionError } from './types.js';
import type { ContextState } from '../subagents/subagent.js';

/**
 * @fileoverview Central orchestrator for hierarchical session management.
 *
 * SessionManager provides:
 * - Session lifecycle management (create, pause, resume, complete, abort)
 * - Active session stack management
 * - Event emission for UI integration
 * - SubAgentScope binding for interactive sessions
 */

/**
 * Event listener type for session events.
 */
export type SessionEventListener = (event: SessionEvent) => void;

/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
  /** Human-readable session name */
  name: string;

  /** Name of the subagent handling this session */
  subagentName?: string;

  /** Parent session ID (undefined for root sessions) */
  parentId?: SessionId;

  /** Session configuration */
  sessionConfig: SubagentSessionConfig;

  /** Initial task prompt for the session */
  taskPrompt?: string;
}

/**
 * Central manager for hierarchical, interactive sessions.
 *
 * SessionManager orchestrates the complete lifecycle of sessions:
 * - Creating and switching between sessions
 * - Managing parent-child relationships
 * - Emitting events for UI reactivity
 * - Binding SubAgentScope instances for message routing
 *
 * @example
 * ```ts
 * const sm = new SessionManager(config, subagentManager);
 *
 * // Listen to events
 * sm.on((event) => {
 *   if (event.type === 'SESSION_STARTED') {
 *     console.log('New session:', event.node.name);
 *   }
 * });
 *
 * // Create a session
 * const sessionId = await sm.createSession({
 *   name: 'analyzer',
 *   subagentName: 'bmad-analyst',
 *   sessionConfig: defaultConfig,
 *   taskPrompt: 'Analyze the requirements',
 * });
 *
 * // Send messages
 * await sm.sendUserMessage(sessionId, 'What are the key features?');
 * ```
 */
export class SessionManager {
  /** Event emitter for session lifecycle events */
  private readonly ee = new EventEmitter();

  /** Stack managing active sessions */
  private readonly stack = new SessionStack();

  /** Map of session contexts by ID */
  private readonly contexts = new Map<SessionId, SessionContext>();

  /** Map of SubAgentScope instances by session ID */
  private readonly scopes = new Map<SessionId, unknown>(); // unknown to avoid circular dep

  /** Metadata: session ID to parent ID mapping */
  private readonly parentMap = new Map<SessionId, SessionId | undefined>();

  /** Metadata: session ID to depth mapping */
  private readonly depthMap = new Map<SessionId, number>();

  /**
   * Registers a listener for all session events.
   *
   * @param listener - Callback function to handle events
   */
  on(listener: SessionEventListener): void {
    this.ee.on('session_event', listener);
  }

  /**
   * Unregisters a session event listener.
   *
   * @param listener - The listener to remove
   */
  off(listener: SessionEventListener): void {
    this.ee.off('session_event', listener);
  }

  /**
   * Emits a session event to all registered listeners.
   *
   * @param event - The session event to emit
   */
  private emit(event: SessionEvent): void {
    this.ee.emit('session_event', event);
  }

  /**
   * Creates a new session.
   *
   * This method:
   * 1. Validates depth limits
   * 2. Creates a SessionNode
   * 3. Initializes SessionContext (with optional parent inheritance)
   * 4. Emits SESSION_STARTED event
   * 5. Optionally switches UI to the new session
   *
   * @param options - Session creation options
   * @returns The newly created session ID
   * @throws SessionError if depth limit exceeded
   */
  async createSession(options: CreateSessionOptions): Promise<SessionId> {
    const { name, subagentName, parentId, sessionConfig, taskPrompt } = options;

    // Generate unique session ID
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const id: SessionId = `${name}-${randomSuffix}`;

    // Calculate depth and enforce limits
    const parentDepth = parentId ? (this.depthMap.get(parentId) ?? 0) : 0;
    const depth = parentId ? parentDepth + 1 : 0;

    if (depth >= sessionConfig.maxDepth) {
      throw new SessionError(
        `Max session depth (${sessionConfig.maxDepth}) exceeded`,
        id,
        'MAX_DEPTH_EXCEEDED',
      );
    }

    // Create session node
    const node: SessionNode = {
      id,
      name,
      subagentName,
      depth,
      status: 'active',
      parentId,
      children: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      config: sessionConfig,
    };

    // Add to stack and establish relationships
    this.stack.addNode(node);
    this.stack.linkChild(parentId, id);
    this.parentMap.set(id, parentId);
    this.depthMap.set(id, depth);

    // Create session context (with optional parent inheritance)
    const parentCtx = parentId ? this.contexts.get(parentId) : undefined;
    const sessionContext = new SessionContext(id, sessionConfig, parentCtx);

    // Set initial task prompt if provided
    if (taskPrompt) {
      sessionContext.contextState.set('task_prompt', taskPrompt);
    }

    this.contexts.set(id, sessionContext);

    // Emit SESSION_STARTED event
    const startEvent: SessionStartedEvent = {
      type: 'SESSION_STARTED',
      sessionId: id,
      node,
      timestamp: Date.now(),
    };
    this.emit(startEvent);

    // Auto-switch to this session if configured
    if (sessionConfig.autoSwitch) {
      this.switchActiveSession(id);
    }

    return id;
  }

  /**
   * Switches the active session to the specified session ID.
   *
   * This makes the target session active and emits a SESSION_SWITCHED event.
   * The UI should respond by displaying the new session's history.
   *
   * @param sessionId - Session ID to activate
   * @throws SessionError if session doesn't exist
   */
  switchActiveSession(sessionId: SessionId): void {
    const currentActiveId = this.stack.getActive();

    // Push new session onto stack
    this.stack.push(sessionId);

    // Emit SESSION_SWITCHED event
    const switchEvent: SessionSwitchedEvent = {
      type: 'SESSION_SWITCHED',
      sessionId,
      fromSessionId: currentActiveId,
      timestamp: Date.now(),
    };
    this.emit(switchEvent);
  }

  /**
   * Returns to the parent session (pops current session from stack).
   *
   * If successful, emits a SESSION_SWITCHED event with the parent session ID.
   *
   * @returns Parent session ID, or undefined if already at root
   */
  backToParent(): SessionId | undefined {
    const currentId = this.stack.getActive();

    // Pop current session
    this.stack.pop();

    // Get the new active session (parent)
    const parentId = this.stack.getActive();

    // Emit event if we successfully switched
    if (parentId) {
      const switchEvent: SessionSwitchedEvent = {
        type: 'SESSION_SWITCHED',
        sessionId: parentId,
        fromSessionId: currentId,
        timestamp: Date.now(),
      };
      this.emit(switchEvent);
    }

    return parentId;
  }

  /**
   * Gets the currently active session ID.
   *
   * @returns Active session ID, or undefined if no sessions exist
   */
  getActiveSessionId(): SessionId | undefined {
    return this.stack.getActive();
  }

  /**
   * Gets a session node by ID.
   *
   * @param id - Session ID
   * @returns SessionNode, or undefined if not found
   */
  getSessionNode(id: SessionId): SessionNode | undefined {
    return this.stack.getNode(id);
  }

  /**
   * Gets all session nodes in the tree.
   *
   * @returns Array of all session nodes
   */
  getTree(): SessionNode[] {
    return this.stack.getTree();
  }

  /**
   * Pauses a session.
   *
   * @param sessionId - Session ID to pause
   */
  pause(sessionId: SessionId): void {
    this.stack.setStatus(sessionId, 'paused');
    this.emit({
      type: 'SESSION_PAUSED',
      sessionId,
      timestamp: Date.now(),
    });
  }

  /**
   * Resumes a paused session.
   *
   * @param sessionId - Session ID to resume
   */
  resume(sessionId: SessionId): void {
    this.stack.setStatus(sessionId, 'active');
    this.emit({
      type: 'SESSION_RESUMED',
      sessionId,
      timestamp: Date.now(),
    });
  }

  /**
   * Marks a session as completed.
   *
   * This method:
   * 1. Updates session status to 'completed'
   * 2. Emits SESSION_COMPLETED event
   * 3. Automatically pops the session if it's currently active
   *
   * @param sessionId - Session ID to complete
   * @param result - Optional result value
   * @param terminateReason - Optional termination reason
   */
  complete(
    sessionId: SessionId,
    result?: unknown,
    terminateReason?: string,
  ): void {
    this.stack.setStatus(sessionId, 'completed');

    const completeEvent: SessionCompletedEvent = {
      type: 'SESSION_COMPLETED',
      sessionId,
      result,
      terminateReason,
      timestamp: Date.now(),
    };
    this.emit(completeEvent);

    // Auto-pop if this is the active session
    const activeId = this.getActiveSessionId();
    if (activeId === sessionId) {
      this.backToParent();
    }
  }

  /**
   * Aborts a session (used for errors or user cancellation).
   *
   * @param sessionId - Session ID to abort
   * @param reason - Reason for abortion
   */
  abort(sessionId: SessionId, reason?: string): void {
    this.stack.setStatus(sessionId, 'aborted');

    const abortEvent: SessionAbortedEvent = {
      type: 'SESSION_ABORTED',
      sessionId,
      reason,
      timestamp: Date.now(),
    };
    this.emit(abortEvent);

    // Auto-pop if this is the active session
    const activeId = this.getActiveSessionId();
    if (activeId === sessionId) {
      this.backToParent();
    }
  }

  /**
   * Sends a user message to a specific session.
   *
   * This method:
   * 1. Emits USER_MESSAGE_TO_SESSION event
   * 2. Routes the message to the bound SubAgentScope (if interactive mode)
   *
   * @param sessionId - Target session ID
   * @param text - Message text
   */
  async sendUserMessage(sessionId: SessionId, text: string): Promise<void> {
    console.log(
      `[SessionManager] sendUserMessage called for session: ${sessionId}`,
    );
    console.log(`[SessionManager] Message text: "${text}"`);
    console.log(`[SessionManager] Total scopes bound: ${this.scopes.size}`);

    // Emit event for UI tracking
    this.emit({
      type: 'USER_MESSAGE_TO_SESSION',
      sessionId,
      text,
      timestamp: Date.now(),
    });

    // Route to interactive SubAgentScope if bound
    const scope = this.scopes.get(sessionId) as
      | { enqueueUserMessage?: (text: string) => Promise<void> }
      | undefined;
    console.log(`[SessionManager] Scope found for session: ${!!scope}`);

    if (scope && typeof scope.enqueueUserMessage === 'function') {
      console.log(`[SessionManager] Calling scope.enqueueUserMessage`);
      await scope.enqueueUserMessage(text);
    } else if (!scope) {
      console.warn(`[SessionManager] No scope bound for session: ${sessionId}`);
    } else {
      console.warn(
        `[SessionManager] Scope exists but enqueueUserMessage is not a function`,
      );
    }
  }

  /**
   * Binds a SubAgentScope to a session for interactive message routing.
   *
   * This is called by TaskTool when creating an interactive session.
   * The scope's enqueueUserMessage method will be called when
   * sendUserMessage is invoked for this session.
   *
   * @param sessionId - Session ID
   * @param scope - SubAgentScope instance
   */
  bindScope(sessionId: SessionId, scope: unknown): void {
    console.log(`[SessionManager] bindScope called for session: ${sessionId}`);
    const typedScope = scope as
      | { enqueueUserMessage?: (text: string) => Promise<void> }
      | undefined;
    console.log(
      `[SessionManager] Scope has enqueueUserMessage: ${typeof typedScope?.enqueueUserMessage === 'function'}`,
    );
    this.scopes.set(sessionId, scope);
    console.log(`[SessionManager] Total bound scopes: ${this.scopes.size}`);
  }

  /**
   * Gets the session context for a given session.
   *
   * @param sessionId - Session ID
   * @returns ContextState for the session
   * @throws SessionError if session not found
   */
  getSessionContext(sessionId: SessionId): ContextState {
    const ctx = this.contexts.get(sessionId);
    if (!ctx) {
      throw new SessionError(
        `Session context not found for "${sessionId}"`,
        sessionId,
        'CONTEXT_NOT_FOUND',
      );
    }
    return ctx.contextState;
  }

  /**
   * Builds a breadcrumb path from root to the specified session.
   *
   * @param sessionId - Target session ID
   * @returns Array of session names from root to target
   */
  getBreadcrumb(sessionId: SessionId): string[] {
    return this.stack.getBreadcrumb(sessionId);
  }

  /**
   * Gets the depth of a session.
   *
   * @param sessionId - Session ID
   * @returns Depth (0 for root), or -1 if not found
   */
  getDepth(sessionId: SessionId): number {
    return this.depthMap.get(sessionId) ?? -1;
  }

  /**
   * Checks if a session exists.
   *
   * @param sessionId - Session ID
   * @returns True if session exists
   */
  hasSession(sessionId: SessionId): boolean {
    return this.stack.has(sessionId);
  }

  /**
   * Gets the total number of sessions.
   *
   * @returns Total session count
   */
  getSessionCount(): number {
    return this.stack.size();
  }

  /**
   * Gets the current stack depth (number of nested active sessions).
   *
   * @returns Stack depth
   */
  getStackDepth(): number {
    return this.stack.list().length;
  }

  /**
   * Cancels the currently processing message in the active session.
   * Only works for interactive sessions. The session remains active.
   */
  cancelCurrentMessage(): void {
    const activeId = this.getActiveSessionId();
    if (!activeId) {
      console.log('[SessionManager] No active session to cancel');
      return;
    }

    const scope = this.scopes.get(activeId) as
      | { cancelCurrentMessage?: () => void }
      | undefined;
    if (scope && typeof scope.cancelCurrentMessage === 'function') {
      console.log(
        `[SessionManager] Cancelling current message in session: ${activeId}`,
      );
      scope.cancelCurrentMessage();
    } else {
      console.log(
        `[SessionManager] Session ${activeId} does not support message cancellation`,
      );
    }
  }

  /**
   * Creates a debug-friendly string representation.
   *
   * @returns Summary of session manager state
   */
  toString(): string {
    const activeId = this.getActiveSessionId();
    const totalSessions = this.getSessionCount();
    const stackDepth = this.getStackDepth();
    return `SessionManager(active=${activeId ?? 'none'}, total=${totalSessions}, depth=${stackDepth})`;
  }
}
