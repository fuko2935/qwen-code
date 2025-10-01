/**
 * @license
 * Copyright 2025 Qwen + BMAD Method
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  CommandContext,
  OpenDialogActionReturn,
} from './types.js';
import { CommandKind } from './types.js';

/**
 * Command to switch between normal and BMAD expert modes
 */
export const modeCommand: SlashCommand = {
  name: 'mode',
  description: 'Switch between Normal and BMAD Expert modes',
  kind: CommandKind.BUILT_IN,
  action: async (_context: CommandContext): Promise<OpenDialogActionReturn> =>
    // Trigger mode selection dialog
    ({
      type: 'dialog',
      dialog: 'mode',
    }),
};
