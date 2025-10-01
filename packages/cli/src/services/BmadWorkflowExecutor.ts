/**
 * @license
 * Copyright 2025 Qwen + BMAD Method
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionState, ProjectType } from '../config/bmadConfig.js';
import { WorkflowPhase, AgentId } from '../config/bmadConfig.js';
import type { BmadService } from './BmadService.js';
import { SubagentManager } from '@qwen-code/qwen-code-core';
import type { Config } from '@qwen-code/qwen-code-core';

/**
 * Executes BMAD workflow phases autonomously using real subagent delegation
 */
export class BmadWorkflowExecutor {
  private _subagentManager: SubagentManager;
  private readonly coreConfig: Config;

  constructor(
    private readonly bmadService: BmadService,
    config: Config,
  ) {
    this.coreConfig = config;
    this._subagentManager = new SubagentManager(config);
  }

  /**
   * Execute full workflow based on user input and session state
   */
  async execute(userInput: string, session: SessionState): Promise<void> {
    console.log(`\n🎭 BMAD Workflow Executor\n`);
    console.log(`Project Type: ${session.projectType}`);
    console.log(`Current Phase: ${session.currentPhase}\n`);

    // Detect if we need to start from beginning or resume
    if (session.currentPhase === WorkflowPhase.INIT) {
      await this.startNewWorkflow(userInput, session);
    } else {
      await this.continueWorkflow(session);
    }
  }

  /**
   * Start a new workflow from scratch
   */
  private async startNewWorkflow(
    userInput: string,
    session: SessionState,
  ): Promise<void> {
    console.log(`📝 Planning workflow for ${session.projectType} project...\n`);

    // Store user input in context
    await this.bmadService.persistStep({
      context: {
        ...session.context,
        initialRequest: userInput,
        projectDescription: userInput,
      },
    });

    // Plan phases based on project type
    const phases = this.planWorkflowPhases(session.projectType, userInput);

    console.log(`📋 Workflow Plan (${phases.length} phases):`);
    phases.forEach((phase, index) => {
      const agent = this.getPhaseAgent(phase);
      console.log(`  ${index + 1}. ${phase} (${agent})`);
    });
    console.log();

    // Execute phases sequentially
    for (const phase of phases) {
      await this.executePhase(phase, session);
    }

    // Mark complete
    await this.bmadService.persistStep({
      currentPhase: WorkflowPhase.COMPLETE,
      currentAgent: null,
    });

    console.log(`\n✅ Workflow Complete!\n`);
    this.printWorkflowSummary(session);
  }

  /**
   * Continue an existing workflow
   */
  private async continueWorkflow(session: SessionState): Promise<void> {
    console.log(`🔄 Continuing from phase: ${session.currentPhase}\n`);

    // Get remaining phases
    const allPhases = this.planWorkflowPhases(session.projectType, '');
    const currentIndex = allPhases.indexOf(session.currentPhase);
    const remainingPhases = allPhases.slice(currentIndex + 1);

    if (remainingPhases.length === 0) {
      console.log(`✅ No remaining phases. Workflow already complete!\n`);
      return;
    }

    // Execute remaining phases
    for (const phase of remainingPhases) {
      await this.executePhase(phase, session);
    }

    // Mark complete
    await this.bmadService.persistStep({
      currentPhase: WorkflowPhase.COMPLETE,
      currentAgent: null,
    });

    console.log(`\n✅ Workflow Complete!\n`);
  }

  /**
   * Plan workflow phases based on project type
   */
  private planWorkflowPhases(
    projectType: ProjectType,
    userInput: string,
  ): WorkflowPhase[] {
    const phases: WorkflowPhase[] = [];

    if (projectType === 'greenfield') {
      // Full greenfield workflow

      // Analysis (optional, can be skipped)
      if (this.needsAnalysis(userInput)) {
        phases.push(WorkflowPhase.ANALYSIS);
      }

      // Core planning phases
      phases.push(WorkflowPhase.PRODUCT); // PRD

      // UX (if frontend detected)
      if (this.needsUX(userInput)) {
        phases.push(WorkflowPhase.UX);
      }

      phases.push(WorkflowPhase.ARCHITECTURE); // Architecture
      phases.push(WorkflowPhase.PLANNING); // PO shard
      phases.push(WorkflowPhase.STORY_CREATION); // SM draft
      phases.push(WorkflowPhase.DEVELOPMENT); // Dev implement
      phases.push(WorkflowPhase.QA); // QA review
    } else {
      // Brownfield workflow (resume existing project)
      phases.push(WorkflowPhase.STORY_CREATION); // Start with stories
      phases.push(WorkflowPhase.DEVELOPMENT);
      phases.push(WorkflowPhase.QA);
    }

    return phases;
  }

  /**
   * Execute a single workflow phase using real subagent delegation
   */
  private async executePhase(
    phase: WorkflowPhase,
    session: SessionState,
  ): Promise<void> {
    const agentId = this.getPhaseAgent(phase);
    const subagentName = this._getSubagentName(agentId);
    const taskId = this.getPhaseTask(phase);

    console.log(`\n▶️  Phase: ${phase}`);
    console.log(`🤖 Delegating to: ${subagentName}`);
    if (taskId) {
      console.log(`📋 Task: ${taskId}`);
    }
    console.log();

    // Update session
    await this.bmadService.persistStep({
      currentPhase: phase,
      currentAgent: agentId,
    });

    try {
      // Load subagent configuration
      const subagent = await this._subagentManager.loadSubagent(
        subagentName,
        'builtin',
      );

      if (!subagent) {
        throw new Error(`Subagent ${subagentName} not found`);
      }

      console.log(`📝 ${subagent.description}`);
      console.log(
        `🎯 Executing with specialized agent (orchestrator-only mode respected)...\n`,
      );

      // Create a real subagent scope and run non-interactively (no persona injection into main convo)
      const scope = await this._subagentManager.createSubagentScope(
        subagent,
        this.coreConfig,
      );
      // Create a minimal context object compatible with SubAgentScope expectations
      const state: Record<string, unknown> = {};
      const ctx = {
        get: (key: string) => state[key],
        set: (key: string, value: unknown) => {
          state[key] = value;
        },
        get_keys: () => Object.keys(state),
      } as unknown as object;

      const initialRequest = String(
        (session.context as Record<string, unknown>)?.['initialRequest'] || '',
      );
      const prompt = taskId
        ? `Task: ${taskId}\n\nProject description:\n${initialRequest}`
        : `Project description:\n${initialRequest}`;
      (ctx as any).set('task_prompt', prompt);

      // Pass the minimal context object to the subagent
      await scope.runNonInteractive(ctx as any);

      // For now, artifacts are managed by tools; we persist a summary entry
      await this.bmadService.persistStep({
        completedSteps: [
          ...session.completedSteps,
          {
            phase,
            agent: agentId,
            taskId,
            status: 'success',
            timestamp: Date.now(),
            artifacts: [],
          },
        ],
      });

      console.log(`✅ Phase complete: ${phase}`);
      console.log(`📦 ${subagentName} finished with summary below.`);
      const summaryText = scope.getFinalText();
      if (summaryText) {
        console.log(`\n—— Subagent Summary ——\n${summaryText}\n`);
      }
    } catch (error) {
      console.error(`❌ Phase failed: ${phase}`);
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}\n`,
      );

      // Record failure
      await this.bmadService.persistStep({
        completedSteps: [
          ...session.completedSteps,
          {
            phase,
            agent: agentId,
            taskId,
            status: 'failed',
            timestamp: Date.now(),
            artifacts: [],
            notes: error instanceof Error ? error.message : String(error),
          },
        ],
      });

      throw error;
    }
  }

  /**
   * Get BMAD subagent name for a phase
   */
  private getPhaseAgent(phase: WorkflowPhase): AgentId {
    const phaseAgentMap: Record<WorkflowPhase, AgentId> = {
      [WorkflowPhase.INIT]: AgentId.ORCHESTRATOR,
      [WorkflowPhase.ANALYSIS]: AgentId.ANALYST,
      [WorkflowPhase.PRODUCT]: AgentId.PM,
      [WorkflowPhase.UX]: AgentId.UX,
      [WorkflowPhase.ARCHITECTURE]: AgentId.ARCHITECT,
      [WorkflowPhase.PLANNING]: AgentId.PO,
      [WorkflowPhase.STORY_CREATION]: AgentId.SM,
      [WorkflowPhase.DEVELOPMENT]: AgentId.DEV,
      [WorkflowPhase.QA]: AgentId.QA,
      [WorkflowPhase.COMPLETE]: AgentId.ORCHESTRATOR,
    };

    return phaseAgentMap[phase];
  }

  /**
   * Map AgentId to built-in BMAD subagent name
   */
  private _getSubagentName(agentId: AgentId): string {
    const agentMap: Record<AgentId, string> = {
      [AgentId.ORCHESTRATOR]: 'bmad-orchestrator',
      [AgentId.ANALYST]: 'bmad-analyst',
      [AgentId.PM]: 'bmad-pm',
      [AgentId.UX]: 'bmad-ux',
      [AgentId.ARCHITECT]: 'bmad-architect',
      [AgentId.PO]: 'bmad-po',
      [AgentId.SM]: 'bmad-sm',
      [AgentId.DEV]: 'bmad-dev',
      [AgentId.QA]: 'bmad-qa',
    };

    return agentMap[agentId];
  }

  /**
   * Get default task for a phase
   */
  private getPhaseTask(phase: WorkflowPhase): string | undefined {
    const phaseTaskMap: Partial<Record<WorkflowPhase, string>> = {
      [WorkflowPhase.ANALYSIS]: 'create-project-brief',
      [WorkflowPhase.PRODUCT]: 'create-prd',
      [WorkflowPhase.UX]: 'create-front-end-spec',
      [WorkflowPhase.ARCHITECTURE]: 'create-architecture',
      [WorkflowPhase.PLANNING]: 'shard-doc',
      [WorkflowPhase.STORY_CREATION]: 'create-next-story',
      [WorkflowPhase.DEVELOPMENT]: 'develop-story',
      [WorkflowPhase.QA]: 'review-story',
    };

    return phaseTaskMap[phase];
  }

  /**
   * Check if project needs analysis phase
   */
  private needsAnalysis(userInput: string): boolean {
    // Skip analysis for simple, well-defined projects
    const skipKeywords = ['simple', 'basic', 'quick', 'small'];
    const lowerInput = userInput.toLowerCase();

    return !skipKeywords.some((keyword) => lowerInput.includes(keyword));
  }

  /**
   * Check if project needs UX phase
   */
  private needsUX(userInput: string): boolean {
    // Include UX if frontend keywords detected
    const frontendKeywords = [
      'ui',
      'ux',
      'interface',
      'frontend',
      'front-end',
      'web app',
      'react',
      'vue',
      'angular',
      'svelte',
      'next.js',
      'nuxt',
      'website',
      'dashboard',
      'app',
      'mobile',
    ];

    const lowerInput = userInput.toLowerCase();
    return frontendKeywords.some((keyword) => lowerInput.includes(keyword));
  }

  /**
   * Print workflow summary
   */
  private printWorkflowSummary(session: SessionState): void {
    console.log(`📊 Workflow Summary:`);
    console.log(`   Project Type: ${session.projectType}`);
    console.log(`   Phases Completed: ${session.completedSteps.length}`);
    console.log(`   Total Duration: ${this.formatDuration(session.timestamp)}`);
    console.log();

    if (session.artifacts.prd) {
      console.log(`   📄 PRD: ${session.artifacts.prd}`);
    }
    if (session.artifacts.architecture) {
      console.log(`   🏗️  Architecture: ${session.artifacts.architecture}`);
    }
    if (session.artifacts.stories.length > 0) {
      console.log(`   📝 Stories: ${session.artifacts.stories.length}`);
    }
    if (session.artifacts.qaReports.length > 0) {
      console.log(`   🧪 QA Reports: ${session.artifacts.qaReports.length}`);
    }
    console.log();
  }

  /**
   * Format duration from timestamp
   */
  private formatDuration(startTime: number): string {
    const duration = Date.now() - startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }
}
