/**
 * @license
 * Copyright 2025 Qwen + BMAD Method
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentId, BMAD_CONFIG } from '../../../config/bmadConfig.js';
import type { BmadMode } from '../../../config/bmadConfig.js';
import {
  createBmadAgentCommand,
  createOrchestratorCommand,
  createResumeCommand,
  createStatusCommand,
  createAgentsCommand,
  initializeBmadService,
  getBmadService,
} from './bmadCommandFactory.js';
import type { SlashCommand } from '../types.js';
import type { Config } from '@qwen-code/qwen-code-core';

/**
 * Initialize BMAD commands
 */
export async function initializeBmadCommands(
  cwd: string,
  config: Config,
  mode: BmadMode = BMAD_CONFIG.DEFAULT_MODE,
): Promise<void> {
  const service = initializeBmadService(cwd, config);
  await service.initialize(mode);
}

/**
 * Get BMAD service singleton
 */
export { getBmadService };

/**
 * All BMAD commands
 */
export const bmadCommands: SlashCommand[] = [
  // Orchestrator
  createOrchestratorCommand(),

  // Agent commands
  createBmadAgentCommand(AgentId.ANALYST, 'Business Analyst', 'Activate Business Analyst for market research and project briefing'),
  createBmadAgentCommand(AgentId.PM, 'Product Manager', 'Activate Product Manager for creating PRDs and product strategy'),
  createBmadAgentCommand(AgentId.ARCHITECT, 'Architect', 'Activate Architect for system design and architecture'),
  createBmadAgentCommand(AgentId.UX, 'UX Expert', 'Activate UX Expert for UI/UX design and front-end specifications'),
  createBmadAgentCommand(AgentId.PO, 'Product Owner', 'Activate Product Owner for backlog management and story refinement'),
  createBmadAgentCommand(AgentId.SM, 'Scrum Master', 'Activate Scrum Master for story creation and sprint management'),
  createBmadAgentCommand(AgentId.DEV, 'Developer', 'Activate Developer for code implementation and testing'),
  createBmadAgentCommand(AgentId.QA, 'QA Engineer', 'Activate QA Engineer for test architecture and quality assurance'),

  // Utility commands
  createResumeCommand(),
  createStatusCommand(),
  createAgentsCommand(),
];