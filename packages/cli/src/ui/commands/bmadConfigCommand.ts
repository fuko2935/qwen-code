/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  CommandContext,
  MessageActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { BmadService } from '../../services/BmadService.js';

/**
 * Toggle BMAD orchestrator-only mode to improve context window management.
 * Usage:
 *   /bmad-config orchestrator-only on
 *   /bmad-config orchestrator-only off
 *   /bmad-config                   (shows current)
 */
export const bmadConfigCommand: SlashCommand = {
  name: 'bmad-config',
  description: 'Configure BMAD behavior (e.g., orchestrator-only mode)',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const trimmed = (args || '').trim();
    if (!trimmed) {
      const status = BmadService.getOrchestratorOnly() ? 'on' : 'off';
      return {
        type: 'message',
        messageType: 'info',
        content: `BMAD settings:\n- orchestrator-only: ${status}`,
      };
    }

    const parts = trimmed.split(/\s+/);
    if (parts[0] === 'orchestrator-only') {
      if (parts[1] === 'on') {
        BmadService.setOrchestratorOnly(true);
        return {
          type: 'message',
          messageType: 'info',
          content:
            'BMAD orchestrator-only mode enabled. Subagent prompt injection will be skipped.',
        };
      } else if (parts[1] === 'off') {
        BmadService.setOrchestratorOnly(false);
        return {
          type: 'message',
          messageType: 'info',
          content:
            'BMAD orchestrator-only mode disabled. Subagent prompts may be injected when delegating.',
        };
      }
    }

    return {
      type: 'message',
      messageType: 'error',
      content: `Invalid usage. Examples:\n  /bmad-config orchestrator-only on\n  /bmad-config orchestrator-only off\n  /bmad-config`,
    };
  },
};
