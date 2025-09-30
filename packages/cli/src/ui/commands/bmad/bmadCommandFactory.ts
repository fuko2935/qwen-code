/**
 * @license
 * Copyright 2025 Qwen + BMAD Method
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, CommandContext, MessageActionReturn } from '../types.js';
import { CommandKind } from '../types.js';
import { AgentId } from '../../../config/bmadConfig.js';
import { BmadService } from '../../../services/BmadService.js';
import type { Config } from '@qwen-code/qwen-code-core';

// Global BMAD service instance (initialized on startup if in BMAD mode)
let bmadServiceInstance: BmadService | null = null;

/**
 * Initialize BMAD service
 */
export function initializeBmadService(cwd: string, config: Config): BmadService {
  if (!bmadServiceInstance) {
    bmadServiceInstance = new BmadService(cwd, config);
  }
  return bmadServiceInstance;
}

/**
 * Get BMAD service instance
 */
export function getBmadService(): BmadService | null {
  return bmadServiceInstance;
}

/**
 * Factory to create BMAD agent commands
 */
export function createBmadAgentCommand(
  agentId: AgentId,
  agentName: string,
  description: string
): SlashCommand {
  return {
    name: `bmad-${agentId}`,
    description,
    kind: CommandKind.BUILT_IN,
    action: async (context: CommandContext): Promise<MessageActionReturn> => {
      const bmadService = getBmadService();

      if (!bmadService) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'BMAD service not initialized. Please enable BMAD Expert Mode first with /mode',
        };
      }

      if (!bmadService.isInitialized()) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'BMAD service not initialized. Please restart Qwen Code in BMAD Expert Mode.',
        };
      }

      try {
        // Load agent
        const agent = await bmadService.loadAgent(agentId);

        // Get args (optional task ID or other params)
        const args = context.invocation?.args.trim() || '';

        // Run agent
        await bmadService.runAgent(agentId, {
          taskId: args || undefined,
        });

        return {
          type: 'message',
          messageType: 'info',
          content: `${agent.icon} ${agent.name} activated.\n\n${agent.systemPrompt.slice(0, 200)}...\n\nAgent is ready to assist!`,
        };
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to activate ${agentName}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create orchestrator command (special handling)
 */
export function createOrchestratorCommand(): SlashCommand {
  return {
    name: 'bmad-orchestrator',
    altNames: ['bmad'],
    description: 'Activate BMAD Orchestrator for autonomous project development',
    kind: CommandKind.BUILT_IN,
    action: async (context: CommandContext): Promise<MessageActionReturn> => {
      const bmadService = getBmadService();

      if (!bmadService) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'BMAD service not initialized. Please enable BMAD Expert Mode first with /mode',
        };
      }

      if (!bmadService.isInitialized()) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'BMAD service not initialized. Please restart Qwen Code in BMAD Expert Mode.',
        };
      }

      try {
        // Inject orchestrator persona
        await bmadService.injectOrchestratorPersona();

        return {
          type: 'message',
          messageType: 'info',
          content: 
            `🎭 BMAD Orchestrator Activated!\n\n` +
            `I'm your autonomous development orchestrator. Tell me about your project and I'll:\n` +
            `  1. Analyze requirements\n` +
            `  2. Create comprehensive documentation (PRD, Architecture)\n` +
            `  3. Break down into implementable stories\n` +
            `  4. Develop features with full testing\n` +
            `  5. Ensure quality with automated QA\n\n` +
            `Simply describe what you want to build, and I'll handle the rest!\n\n` +
            `Available commands:\n` +
            `  /bmad-resume - Resume interrupted workflow\n` +
            `  /bmad-status - Check workflow progress\n` +
            `  /bmad-agents - List all available agents\n`,
        };
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to activate orchestrator: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create resume command
 */
export function createResumeCommand(): SlashCommand {
  return {
    name: 'bmad-resume',
    description: 'Resume interrupted BMAD workflow',
    kind: CommandKind.BUILT_IN,
    action: async (): Promise<MessageActionReturn> => {
      const bmadService = getBmadService();

      if (!bmadService) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'BMAD service not initialized.',
        };
      }

      try {
        const session = await bmadService.resumeWorkflow();

        if (!session) {
          return {
            type: 'message',
            messageType: 'info',
            content: 'No workflow to resume. Start a new project with /bmad-orchestrator',
          };
        }

        return {
          type: 'message',
          messageType: 'info',
          content: 
            `✅ Workflow resumed!\n\n` +
            `Phase: ${session.currentPhase}\n` +
            `Current Agent: ${session.currentAgent || 'None'}\n` +
            `Completed Steps: ${session.completedSteps.length}\n\n` +
            `Continuing from where we left off...`,
        };
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to resume workflow: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create status command
 */
export function createStatusCommand(): SlashCommand {
  return {
    name: 'bmad-status',
    description: 'Show current BMAD workflow status',
    kind: CommandKind.BUILT_IN,
    action: async (): Promise<MessageActionReturn> => {
      const bmadService = getBmadService();

      if (!bmadService) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'BMAD service not initialized.',
        };
      }

      try {
        const session = await bmadService.getSessionManager().read();

        if (!session) {
          return {
            type: 'message',
            messageType: 'info',
            content: 'No active BMAD workflow. Start one with /bmad-orchestrator',
          };
        }

        const artifacts = Object.entries(session.artifacts)
          .filter(([_, value]) => Array.isArray(value) ? value.length > 0 : value)
          .map(([key, value]) => `  - ${key}: ${Array.isArray(value) ? value.length : 1}`)
          .join('\n');

        return {
          type: 'message',
          messageType: 'info',
          content:
            `📊 BMAD Workflow Status\n\n` +
            `Mode: ${session.mode}\n` +
            `Project Type: ${session.projectType}\n` +
            `Current Phase: ${session.currentPhase}\n` +
            `Current Agent: ${session.currentAgent || 'None'}\n` +
            `Completed Steps: ${session.completedSteps.length}\n\n` +
            `Artifacts:\n${artifacts || '  None yet'}\n\n` +
            `Last Updated: ${new Date(session.timestamp).toLocaleString()}`,
        };
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create agents list command
 */
export function createAgentsCommand(): SlashCommand {
  return {
    name: 'bmad-agents',
    description: 'List all available BMAD agents',
    kind: CommandKind.BUILT_IN,
    action: async (): Promise<MessageActionReturn> => {
      const bmadService = getBmadService();

      if (!bmadService) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'BMAD service not initialized.',
        };
      }

      try {
        const agents = await bmadService.listAgents();

        if (agents.length === 0) {
          return {
            type: 'message',
            messageType: 'info',
            content: 'No agents found. Make sure .bmad-core/agents/ directory exists.',
          };
        }

        const agentList = agents.map(id => `  /bmad-${id}`).join('\n');

        return {
          type: 'message',
          messageType: 'info',
          content:
            `🤖 Available BMAD Agents:\n\n${agentList}\n\n` +
            `Use any command above to activate that agent directly.`,
        };
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to list agents: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}