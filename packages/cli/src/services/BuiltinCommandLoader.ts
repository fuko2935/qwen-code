/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICommandLoader } from './types.js';
import type { SlashCommand } from '../ui/commands/types.js';
import type { Config } from '@qwen-code/qwen-code-core';
import type { LoadedSettings } from '../config/settings.js';
import { BMAD_CONFIG } from '../config/bmadConfig.js';
import type { BmadMode } from '../config/bmadConfig.js';
import { aboutCommand } from '../ui/commands/aboutCommand.js';
import { agentsCommand } from '../ui/commands/agentsCommand.js';
import { approvalModeCommand } from '../ui/commands/approvalModeCommand.js';
import { authCommand } from '../ui/commands/authCommand.js';
import { bugCommand } from '../ui/commands/bugCommand.js';
import { chatCommand } from '../ui/commands/chatCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { compressCommand } from '../ui/commands/compressCommand.js';
import { copyCommand } from '../ui/commands/copyCommand.js';
import { corgiCommand } from '../ui/commands/corgiCommand.js';
import { docsCommand } from '../ui/commands/docsCommand.js';
import { directoryCommand } from '../ui/commands/directoryCommand.js';
import { editorCommand } from '../ui/commands/editorCommand.js';
import { extensionsCommand } from '../ui/commands/extensionsCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { ideCommand } from '../ui/commands/ideCommand.js';
import { initCommand } from '../ui/commands/initCommand.js';
import { mcpCommand } from '../ui/commands/mcpCommand.js';
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { modelCommand } from '../ui/commands/modelCommand.js';
import { privacyCommand } from '../ui/commands/privacyCommand.js';
import { quitCommand, quitConfirmCommand } from '../ui/commands/quitCommand.js';
import { restoreCommand } from '../ui/commands/restoreCommand.js';
import { settingsCommand } from '../ui/commands/settingsCommand.js';
import { statsCommand } from '../ui/commands/statsCommand.js';
import { summaryCommand } from '../ui/commands/summaryCommand.js';
import { terminalSetupCommand } from '../ui/commands/terminalSetupCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { toolsCommand } from '../ui/commands/toolsCommand.js';
import { vimCommand } from '../ui/commands/vimCommand.js';
import { setupGithubCommand } from '../ui/commands/setupGithubCommand.js';
import { modeCommand } from '../ui/commands/modeCommand.js';
import { bmadCommands, initializeBmadCommands } from '../ui/commands/bmad/index.js';

/**
 * Loads the core, hard-coded slash commands that are an integral part
 * of the Gemini CLI application.
 */
export class BuiltinCommandLoader implements ICommandLoader {
  private bmadInitialization: Promise<void> | null = null;
  private lastInitializedMode: BmadMode | null = null;

  constructor(
    private config: Config | null,
    private settings?: LoadedSettings | null,
  ) {}

  private resolveBmadMode(): BmadMode {
    const mode = this.settings?.merged?.bmadMode;
    return mode === 'bmad-expert' ? 'bmad-expert' : BMAD_CONFIG.DEFAULT_MODE;
  }

  private async ensureBmadInitialized(): Promise<void> {
    if (!this.config) {
      return;
    }

    const resolveProjectRoot =
      typeof (this.config as { getProjectRoot?: () => string | undefined }).getProjectRoot ===
      'function'
        ? (this.config as { getProjectRoot: () => string | undefined }).getProjectRoot
        : undefined;

    const cwd = resolveProjectRoot?.();
    if (!cwd) {
      return;
    }

    const mode = this.resolveBmadMode();

    const shouldReinitialize =
      mode === 'bmad-expert' && this.lastInitializedMode !== 'bmad-expert';

    if (
      (!this.bmadInitialization || shouldReinitialize) &&
      mode === 'bmad-expert'
    ) {
      this.bmadInitialization = initializeBmadCommands(cwd, this.config, mode).catch(
        (error) => {
          this.bmadInitialization = null;
          throw error;
        },
      );
    } else if (!this.bmadInitialization) {
      this.bmadInitialization = Promise.resolve();
    }

    this.lastInitializedMode = mode;
    await this.bmadInitialization;
  }

  /**
   * Gathers all raw built-in command definitions, injects dependencies where
   * needed (e.g., config) and filters out any that are not available.
   *
   * @param _signal An AbortSignal (unused for this synchronous loader).
   * @returns A promise that resolves to an array of `SlashCommand` objects.
   */
  async loadCommands(_signal: AbortSignal): Promise<SlashCommand[]> {
    await this.ensureBmadInitialized();

    const allDefinitions: Array<SlashCommand | null> = [
      aboutCommand,
      agentsCommand,
      approvalModeCommand,
      authCommand,
      bugCommand,
      chatCommand,
      clearCommand,
      compressCommand,
      copyCommand,
      corgiCommand,
      docsCommand,
      directoryCommand,
      editorCommand,
      extensionsCommand,
      helpCommand,
      ideCommand(this.config),
      initCommand,
      mcpCommand,
      memoryCommand,
      modelCommand,
      modeCommand,
      privacyCommand,
      quitCommand,
      quitConfirmCommand,
      restoreCommand(this.config),
      statsCommand,
      summaryCommand,
      themeCommand,
      toolsCommand,
      settingsCommand,
      vimCommand,
      setupGithubCommand,
      terminalSetupCommand,
      // BMAD commands
      ...bmadCommands,
    ];

    return allDefinitions.filter((cmd): cmd is SlashCommand => cmd !== null);
  }
}
