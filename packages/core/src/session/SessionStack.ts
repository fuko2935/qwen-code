/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionId, SessionNode, SessionStatus } from './types.js';
import { SessionError } from './types.js';

/**
 * @fileoverview Manages the stack of active sessions and session node tree.
 *
 * SessionStack provides:
 * - Stack-based active session tracking
 * - Session node storage and retrieval
 * - Parent-child relationship management
 * - Status update operations
 */

/**
 * Manages the hierarchical stack of active sessions and their metadata.
 *
 * The stack represents the "path" of active sessions:
 * - Top of stack = currently active session
 * - Pushing = switching to a new session
 * - Popping = returning to parent session
 *
 * @example
 * ```ts
 * const stack = new SessionStack();
 *
 * // Add root session
 * stack.addNode(rootNode);
 * stack.push(rootNode.id);
 *
 * // Add child session
 * stack.addNode(childNode);
 * stack.linkChild(rootNode.id, childNode.id);
 * stack.push(childNode.id);
 *
 * console.log(stack.getActive()); // childNode.id
 * stack.pop();
 * console.log(stack.getActive()); // rootNode.id
 * ```
 */
export class SessionStack {
  /**
   * Stack of active session IDs (top = current).
   * Represents the "path" through the session tree.
   */
  private stack: SessionId[] = [];

  /**
   * Map of all session nodes by ID.
   * Contains the complete session tree metadata.
   */
  private nodes = new Map<SessionId, SessionNode>();

  /**
   * Adds a session node to the tree.
   *
   * @param node - Session node to add
   * @throws SessionError if a node with this ID already exists
   */
  addNode(node: SessionNode): void {
    if (this.nodes.has(node.id)) {
      throw new SessionError(
        `Session node with ID "${node.id}" already exists`,
        node.id,
        'DUPLICATE_SESSION',
      );
    }
    this.nodes.set(node.id, node);
  }

  /**
   * Retrieves a session node by ID.
   *
   * @param id - Session ID
   * @returns Session node, or undefined if not found
   */
  getNode(id: SessionId): SessionNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Gets the currently active session ID (top of stack).
   *
   * @returns Active session ID, or undefined if stack is empty
   */
  getActive(): SessionId | undefined {
    return this.stack[this.stack.length - 1];
  }

  /**
   * Pushes a session ID onto the stack (making it active).
   *
   * @param id - Session ID to activate
   * @throws SessionError if session node doesn't exist
   */
  push(id: SessionId): void {
    if (!this.nodes.has(id)) {
      throw new SessionError(
        `Cannot push non-existent session "${id}"`,
        id,
        'SESSION_NOT_FOUND',
      );
    }
    this.stack.push(id);
  }

  /**
   * Pops the current session from the stack (returning to parent).
   *
   * @returns The session ID that was popped, or undefined if stack was empty
   */
  pop(): SessionId | undefined {
    return this.stack.pop();
  }

  /**
   * Gets a copy of the current stack (bottom to top).
   *
   * @returns Array of session IDs representing the active path
   */
  list(): SessionId[] {
    return [...this.stack];
  }

  /**
   * Gets all session nodes in the tree.
   *
   * @returns Array of all session nodes
   */
  getTree(): SessionNode[] {
    return [...this.nodes.values()];
  }

  /**
   * Updates the status of a session.
   *
   * @param id - Session ID
   * @param status - New status
   * @throws SessionError if session not found
   */
  setStatus(id: SessionId, status: SessionStatus): void {
    const node = this.nodes.get(id);
    if (!node) {
      throw new SessionError(
        `Cannot set status for non-existent session "${id}"`,
        id,
        'SESSION_NOT_FOUND',
      );
    }
    node.status = status;
    node.updatedAt = Date.now();
  }

  /**
   * Links a child session to its parent in the tree.
   *
   * @param parentId - Parent session ID (undefined for root sessions)
   * @param childId - Child session ID
   * @throws SessionError if nodes don't exist
   */
  linkChild(parentId: SessionId | undefined, childId: SessionId): void {
    if (!parentId) {
      // Root session, no parent to link
      return;
    }

    const parent = this.nodes.get(parentId);
    if (!parent) {
      throw new SessionError(
        `Cannot link child: parent session "${parentId}" not found`,
        parentId,
        'PARENT_NOT_FOUND',
      );
    }

    if (!this.nodes.has(childId)) {
      throw new SessionError(
        `Cannot link child: child session "${childId}" not found`,
        childId,
        'CHILD_NOT_FOUND',
      );
    }

    // Add child if not already present
    if (!parent.children.includes(childId)) {
      parent.children.push(childId);
      parent.updatedAt = Date.now();
    }
  }

  /**
   * Gets the depth of a session in the tree.
   *
   * @param id - Session ID
   * @returns Depth (0 for root), or -1 if not found
   */
  getDepth(id: SessionId): number {
    const node = this.nodes.get(id);
    return node ? node.depth : -1;
  }

  /**
   * Gets all child session IDs for a given session.
   *
   * @param id - Session ID
   * @returns Array of child session IDs, or empty array if no children or session not found
   */
  getChildren(id: SessionId): SessionId[] {
    const node = this.nodes.get(id);
    return node ? [...node.children] : [];
  }

  /**
   * Gets the parent session ID.
   *
   * @param id - Session ID
   * @returns Parent session ID, or undefined if root or not found
   */
  getParent(id: SessionId): SessionId | undefined {
    const node = this.nodes.get(id);
    return node?.parentId;
  }

  /**
   * Builds a breadcrumb path from root to the specified session.
   *
   * @param id - Target session ID
   * @returns Array of session names from root to target
   */
  getBreadcrumb(id: SessionId): string[] {
    const breadcrumb: string[] = [];
    let currentId: SessionId | undefined = id;

    while (currentId) {
      const node = this.nodes.get(currentId);
      if (!node) break;

      breadcrumb.unshift(node.name);
      currentId = node.parentId;
    }

    return breadcrumb;
  }

  /**
   * Checks if a session exists in the tree.
   *
   * @param id - Session ID
   * @returns True if session exists
   */
  has(id: SessionId): boolean {
    return this.nodes.has(id);
  }

  /**
   * Gets the total number of sessions in the tree.
   *
   * @returns Total session count
   */
  size(): number {
    return this.nodes.size;
  }

  /**
   * Clears all sessions and resets the stack.
   * Use with caution - this removes all session history.
   */
  clear(): void {
    this.stack = [];
    this.nodes.clear();
  }

  /**
   * Creates a debug-friendly string representation.
   *
   * @returns Summary of stack and tree state
   */
  toString(): string {
    const activeId = this.getActive();
    return `SessionStack(active=${activeId ?? 'none'}, depth=${this.stack.length}, total=${this.nodes.size})`;
  }
}
