/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  Config,
  SessionEvent,
  SessionId,
  SessionNode,
  SessionStatus,
} from '@qwen-code/qwen-code-core';
import type { HistoryItemWithoutId } from '../types.js';

import type { Content } from '@google/genai';

interface UseSessionManagementReturn {
  // State
  activeSessionId?: SessionId;
  nodes: Map<SessionId, SessionNode>;
  histories: Map<SessionId, Content[]>;
  pendingSubagentMessage: { sessionId: SessionId; text: string } | null;

  // Actions
  sendToActiveSession: (text: string) => Promise<void>;
  backToParent: () => SessionId | undefined;
  switchToSession: (sessionId: SessionId) => void;

  // Queries
  getBreadcrumb: (sessionId?: SessionId) => string[];
  getActiveNode: () => SessionNode | undefined;
  getActiveStatus: () => SessionStatus | undefined;
  isInSession: () => boolean;
}

/**
 * React hook for managing session state and interactions.
 * Subscribes to SessionManager events and provides UI-friendly APIs.
 * Also bridges subagent messages to main UI for display.
 */
export function useSessionManagement(
  config: Config,
  addItem?: (item: HistoryItemWithoutId, timestamp: number) => void,
): UseSessionManagementReturn {
  const sessionManager = useMemo(() => config.getSessionManager(), [config]);

  const [activeSessionId, setActiveSessionId] = useState<SessionId | undefined>(
    sessionManager.getActiveSessionId(),
  );

  const [nodes, setNodes] = useState<Map<SessionId, SessionNode>>(() => {
    const tree = sessionManager.getTree();
    return new Map(tree.map((node) => [node.id, node]));
  });

  const [histories, setHistories] = useState<Map<SessionId, Content[]>>(
    new Map(),
  );

  // Pending subagent message being streamed
  const [pendingSubagentMessage, setPendingSubagentMessage] = useState<{
    sessionId: SessionId;
    text: string;
  } | null>(null);

  // Subscribe to session events
  useEffect(() => {
    const handleEvent = (event: SessionEvent) => {
      switch (event.type) {
        case 'SESSION_STARTED':
          setNodes((prev) => {
            const next = new Map(prev);
            next.set(event.sessionId, event.node);
            return next;
          });
          setHistories((prev) => {
            const next = new Map(prev);
            next.set(event.sessionId, []);
            return next;
          });
          if (event.node.config.autoSwitch) {
            setActiveSessionId(event.sessionId);
          }
          break;

        case 'SESSION_SWITCHED':
          setActiveSessionId(event.sessionId);
          break;

        case 'SESSION_PAUSED':
        case 'SESSION_RESUMED':
        case 'SESSION_COMPLETED':
        case 'SESSION_ABORTED':
          // Update node status
          setNodes((prev) => {
            const next = new Map(prev);
            const node = next.get(event.sessionId);
            if (node) {
              next.set(event.sessionId, {
                ...node,
                status:
                  event.type === 'SESSION_COMPLETED'
                    ? 'completed'
                    : event.type === 'SESSION_ABORTED'
                      ? 'aborted'
                      : event.type === 'SESSION_PAUSED'
                        ? 'paused'
                        : 'active',
              });
            }
            return next;
          });
          break;

        case 'USER_MESSAGE_TO_SESSION':
          // Add user message to history
          setHistories((prev) => {
            const next = new Map(prev);
            const history = next.get(event.sessionId) || [];
            next.set(event.sessionId, [
              ...history,
              {
                role: 'user',
                parts: [{ text: event.text }],
              } as Content,
            ]);
            return next;
          });
          break;

        case 'SUBAGENT_MESSAGE_TO_USER':
          // Handle subagent message streaming and completion
          if (event.textChunk) {
            const chunk = event.textChunk;
            // Update pending message for streaming display
            setPendingSubagentMessage((prev) => ({
              sessionId: event.sessionId,
              text:
                prev && prev.sessionId === event.sessionId
                  ? prev.text + chunk
                  : chunk,
            }));
            console.log(
              `[useSessionManagement] Streaming subagent text chunk: "${chunk.substring(0, 50)}..."`,
            );
          }

          // If we have finalText, commit to history and clear pending
          if (event.finalText) {
            console.log(
              `[useSessionManagement] Finalizing subagent message: "${event.finalText.substring(0, 50)}..."`,
            );
            setHistories((prev) => {
              const next = new Map(prev);
              const history = next.get(event.sessionId) || [];
              history.push({
                role: 'model',
                parts: [{ text: event.finalText }],
              });
              next.set(event.sessionId, [...history]);
              return next;
            });

            // Also add to main UI history
            if (addItem) {
              console.log(
                `[useSessionManagement] Adding finalized subagent message to UI history`,
              );
              addItem(
                {
                  type: 'gemini',
                  text: event.finalText,
                },
                Date.now(),
              );
            }

            // Clear pending message
            setPendingSubagentMessage(null);
          }
          break;

        default:
          // Exhaustive check: all SessionEvent types should be handled
          console.warn(
            `[useSessionManagement] Unhandled session event type:`,
            (event as SessionEvent).type,
          );
          break;
      }
    };

    sessionManager.on(handleEvent);
    return () => sessionManager.off(handleEvent);
  }, [sessionManager, addItem]);

  // Actions
  const sendToActiveSession = useCallback(
    async (text: string) => {
      if (!activeSessionId) {
        throw new Error('No active session');
      }
      await sessionManager.sendUserMessage(activeSessionId, text);
    },
    [sessionManager, activeSessionId],
  );

  const backToParent = useCallback(
    () => sessionManager.backToParent(),
    [sessionManager],
  );

  const switchToSession = useCallback(
    (sessionId: SessionId) => {
      sessionManager.switchActiveSession(sessionId);
    },
    [sessionManager],
  );

  // Queries
  const getBreadcrumb = useCallback(
    (sessionId?: SessionId) => {
      const targetId = sessionId || activeSessionId;
      if (!targetId) {
        return [];
      }
      return sessionManager.getBreadcrumb(targetId);
    },
    [sessionManager, activeSessionId],
  );

  const getActiveNode = useCallback(() => {
    if (!activeSessionId) return undefined;
    return nodes.get(activeSessionId);
  }, [activeSessionId, nodes]);

  const getActiveStatus = useCallback(
    () => getActiveNode()?.status,
    [getActiveNode],
  );

  const isInSession = useCallback(
    () => activeSessionId !== undefined,
    [activeSessionId],
  );

  return {
    activeSessionId,
    nodes,
    histories,
    sendToActiveSession,
    backToParent,
    switchToSession,
    getBreadcrumb,
    getActiveNode,
    getActiveStatus,
    isInSession,
    pendingSubagentMessage,
  };
}
