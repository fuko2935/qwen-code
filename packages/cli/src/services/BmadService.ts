/**
 * @license
 * Copyright 2025 Qwen + BMAD Method
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import type {
  BmadMode,
  AgentDefinition,
  SessionState,
  ArtifactRefs,
  ProjectType,
} from '../config/bmadConfig.js';
import {
  BmadPaths,
  BMAD_CONFIG,
  WorkflowPhase,
  AgentId,
} from '../config/bmadConfig.js';
import { BmadAgentLoader } from './BmadAgentLoader.js';
import { BmadSessionManager } from './BmadSessionManager.js';
import { BmadTaskRunner } from './BmadTaskRunner.js';
import { BmadWorkflowExecutor } from './BmadWorkflowExecutor.js';
import type { Config } from '@qwen-code/qwen-code-core';

/**
 * Core BMAD service coordinating all agent operations
 */
export class BmadService {
  private readonly paths: BmadPaths;
  private readonly agentLoader: BmadAgentLoader;
  private readonly sessionManager: BmadSessionManager;
  private readonly taskRunner: BmadTaskRunner;
  private readonly workflowExecutor: BmadWorkflowExecutor;
  private initialized = false;
  // Global toggle to keep only orchestrator persona without subagent prompt injection
  private static orchestratorOnly = true;
  private currentMode: BmadMode = BMAD_CONFIG.DEFAULT_MODE;
  private currentAgent: AgentDefinition | null = null;

  constructor(
    _cwd: string,
    private readonly _config: Config,
  ) {
    this.paths = new BmadPaths(_cwd);
    this.agentLoader = new BmadAgentLoader(_cwd);
    this.sessionManager = new BmadSessionManager(_cwd);
    this.taskRunner = new BmadTaskRunner(_cwd);
    this.workflowExecutor = new BmadWorkflowExecutor(this, _config);
  }

  /**
   * Initialize BMAD service with specified mode
   */
  async initialize(mode: BmadMode): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.currentMode = mode;

    if (mode === 'bmad-expert') {
      // BMAD Expert Mode is now fully integrated, no external .bmad-core required
      console.log(
        '\n⭐ BMAD Expert Mode initialized with built-in agents and workflows.\n',
      );

      // Check for existing session and offer to resume
      const sessionExists = await this.sessionManager.exists();
      if (sessionExists) {
        const session = await this.sessionManager.read();
        if (session && this.sessionManager.canResume(session)) {
          console.log(
            `🔄 Found existing BMAD workflow in progress (Phase: ${session.currentPhase})\n` +
              `Use /bmad resume to continue where you left off.\n`,
          );
        }
      }
    }

    this.initialized = true;
  }

  /**
   * Verify .bmad-core directory exists
   */
  async ensureCoreReady(): Promise<boolean> {
    try {
      await fs.access(this.paths.bmadCore);

      // Check for required subdirectories
      const requiredDirs = ['agents', 'tasks', 'templates'];

      for (const dir of requiredDirs) {
        try {
          await fs.access(`${this.paths.bmadCore}/${dir}`);
        } catch {
          console.warn(`Warning: Missing ${dir} directory in .bmad-core`);
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load and inject orchestrator persona into system prompt
   */
  async injectOrchestratorPersona(): Promise<string> {
    // Use loadAgent wrapper to benefit from built-in fallback when .bmad-core is missing
    const orchestrator = await this.loadAgent(AgentId.ORCHESTRATOR);
    this.currentAgent = orchestrator;

    // Build system prompt from agent definition
    const systemPrompt = this.buildSystemPrompt(orchestrator);
    return systemPrompt;
  }

  /**
   * Load a specific agent
   */
  async loadAgent(agentId: AgentId | string): Promise<AgentDefinition> {
    try {
      const agent = await this.agentLoader.loadAgent(agentId as string);
      this.currentAgent = agent;
      return agent;
    } catch (error) {
      // Fallback: use built-in agent definitions when .bmad-core is not present
      const fallback = this.buildBuiltInAgent(agentId as string);
      if (!fallback) {
        throw error;
      }
      this.currentAgent = fallback;
      return fallback;
    }
  }

  /**
   * Build system prompt from agent definition
   */
  private buildSystemPrompt(agent: AgentDefinition): string {
    const parts: string[] = [];

    // Role and identity
    parts.push(`# ${agent.icon} ${agent.title}`);
    parts.push('');
    parts.push(`**Role:** ${agent.role}`);
    parts.push(`**Style:** ${agent.style}`);
    parts.push(`**Identity:** ${agent.identity}`);
    parts.push(`**Focus:** ${agent.focus}`);
    parts.push('');

    // Core principles
    if (agent.corePrinciples.length > 0) {
      parts.push('## Core Principles:');
      agent.corePrinciples.forEach((principle) => {
        parts.push(`- ${principle}`);
      });
      parts.push('');
    }

    // Available commands
    if (agent.commands.length > 0) {
      parts.push('## Available Commands:');
      parts.push('All BMAD commands start with `/bmad-` prefix.');
      parts.push('');
      agent.commands.forEach((cmd) => {
        parts.push(`**/${cmd.name}** - ${cmd.description}`);
      });
      parts.push('');
    }

    // Full persona instructions
    parts.push('## Operating Instructions:');
    parts.push(agent.systemPrompt);
    parts.push('');

    // When to use
    if (agent.whenToUse) {
      parts.push('## When to Use This Agent:');
      parts.push(agent.whenToUse);
      parts.push('');
    }

    // Customization
    if (agent.customization) {
      parts.push('## Additional Customization:');
      parts.push(agent.customization);
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Detect project type (greenfield vs brownfield)
   */
  async detectProjectType(): Promise<ProjectType> {
    try {
      // Check for existing BMAD artifacts
      const prdExists = await fs
        .access(this.paths.prd())
        .then(() => true)
        .catch(() => false);
      const archExists = await fs
        .access(this.paths.architecture())
        .then(() => true)
        .catch(() => false);

      if (prdExists || archExists) {
        return 'brownfield';
      }

      // Check if docs directory has content
      const docsPath = this.paths.docs();
      try {
        const files = await fs.readdir(docsPath);
        if (files.length > 0) {
          return 'brownfield';
        }
      } catch {
        // Docs doesn't exist or is empty
      }

      return 'greenfield';
    } catch {
      return 'greenfield';
    }
  }

  /**
   * Run orchestrator with user input
   */
  async runOrchestrator(userInput: string): Promise<void> {
    // Load orchestrator if not already loaded
    if (!this.currentAgent || this.currentAgent.id !== AgentId.ORCHESTRATOR) {
      await this.loadAgent(AgentId.ORCHESTRATOR);
    }

    // Get or create session
    let session = await this.sessionManager.read();
    if (!session) {
      const projectType = await this.detectProjectType();
      session = await this.sessionManager.update({
        mode: 'bmad-expert',
        projectType,
        currentPhase: WorkflowPhase.INIT,
        currentAgent: AgentId.ORCHESTRATOR,
      });
    }

    // Update session with user input
    session = await this.sessionManager.update({
      context: {
        ...session.context,
        lastUserInput: userInput,
        timestamp: Date.now(),
      },
    });

    // Execute full workflow autonomously
    console.log(
      `\n${this.currentAgent?.icon || '🤖'} ${this.currentAgent?.name || 'Agent'}: Analyzing your request...\n`,
    );

    await this.workflowExecutor.execute(userInput, session);
  }

  /**
   * Run a specific agent with options
   * If subagentConfig is provided in context, use that instead of loading from .bmad-core
   */
  async runAgent(
    agentId: AgentId | string,
    options?: {
      taskId?: string;
      context?: Record<string, unknown>;
    },
  ): Promise<Partial<ArtifactRefs>> {
    // Check if subagent config is provided in context (from real delegation)
    const subagentConfig = options?.context?.['subagentConfig'] as
      | {
          name: string;
          systemPrompt: string;
          icon?: string;
        }
      | undefined;

    let agentInfo: { icon: string; name: string; systemPrompt: string };

    if (subagentConfig) {
      // Use built-in subagent configuration
      console.log(`\n🎯 Using built-in subagent: ${subagentConfig.name}`);
      agentInfo = {
        icon: '🤖',
        name: subagentConfig.name,
        systemPrompt: subagentConfig.systemPrompt,
      };
    } else {
      // Fallback to old loader for backward compatibility
      const agent = await this.loadAgent(agentId);
      agentInfo = {
        icon: agent.icon,
        name: agent.name,
        systemPrompt: agent.systemPrompt,
      };
    }

    // Get current session
    let session = await this.sessionManager.read();
    if (!session) {
      const projectType = await this.detectProjectType();
      session = await this.sessionManager.update({
        mode: 'bmad-expert',
        projectType,
        currentPhase: WorkflowPhase.INIT,
        currentAgent: agentId as AgentId,
      });
    }

    // Update session
    await this.sessionManager.update({
      currentAgent: agentId as AgentId,
      context: {
        ...session.context,
        ...options?.context,
      },
    });

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎯 SUBAGENT DELEGATION ACTIVE`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Agent Name: ${agentInfo.name}`);
    console.log(`System Prompt: ${agentInfo.systemPrompt.length} characters`);
    console.log(
      `Delegated By: ${options?.context?.['delegatedBy'] || 'direct'}`,
    );
    console.log(`Task ID: ${options?.taskId || 'none'}`);
    console.log(`${'='.repeat(70)}\n`);

    console.log(`📝 Agent Instructions Preview:`);
    const preview = agentInfo.systemPrompt
      .substring(0, 200)
      .replace(/\n/g, ' ');
    console.log(`   ${preview}...\n`);

    // Inject subagent's system prompt into conversation history
    await this.injectAgentPromptToConversation(
      agentInfo.systemPrompt,
      agentInfo.name,
    );

    // Return empty artifacts for now (task runner will populate)
    return {};
  }

  /**
   * Inject subagent system prompt into the active conversation
   * This allows the agent's specialized instructions to guide the conversation
   */
  private async injectAgentPromptToConversation(
    systemPrompt: string,
    agentName: string,
  ): Promise<void> {
    // Respect orchestrator-only mode: avoid injecting subagent prompts into history
    if (BmadService.orchestratorOnly) {
      console.log(
        '⚙️  Orchestrator-only mode: skipping subagent prompt injection',
      );
      return;
    }
    try {
      // Get the client from config
      const client = this._config.getGeminiClient();

      if (!client || !client.isInitialized()) {
        console.warn('⚠️  Client not initialized, skipping prompt injection');
        return;
      }

      // Add a user message that activates the agent role
      await client.addHistory({
        role: 'user',
        parts: [
          {
            text: `[SYSTEM: Agent Role Activation]\n\nYou are now operating as "${agentName}".\n\nYour specialized instructions:\n${systemPrompt}\n\n---\nPlease acknowledge your role and proceed with the assigned task using your specialized knowledge and approach.`,
          },
        ],
      });

      // Add a model response acknowledging the role
      await client.addHistory({
        role: 'model',
        parts: [
          {
            text: `Understood. I am now operating as ${agentName}. I will follow my specialized instructions and approach to complete the assigned task with expertise in my domain.`,
          },
        ],
      });

      console.log(`✅ Agent prompt injected into conversation`);
      console.log(
        `   The model is now operating with specialized ${agentName} instructions\n`,
      );
    } catch (error) {
      console.error(`❌ Failed to inject agent prompt: ${error}`);
    }
  }

  /**
   * Build a minimal built-in agent definition when no files exist
   */
  private buildBuiltInAgent(agentId: string): AgentDefinition | null {
    const map: Record<
      string,
      {
        name: string;
        title: string;
        role: string;
        focus: string;
        icon: string;
        principles: string[];
        system: string;
        whenToUse: string;
      }
    > = {
      [AgentId.ORCHESTRATOR]: {
        name: 'BMAD Orchestrator',
        title: 'BMAD Orchestrator',
        role: 'Autonomous project orchestrator coordinating BMAD workflow end-to-end.',
        focus:
          'Analyze requirements, plan, and coordinate specialized agents to deliver software.',
        icon: '🎭',
        principles: [
          'Plan before act',
          'Delegate to specialists',
          'Persist progress',
          'Ensure quality',
        ],
        system:
          'You are the BMAD Orchestrator. Coordinate the BMAD workflow (Analysis → Product → UX → Architecture → Planning → Story Creation → Development → QA). Decide which specialized agent to delegate to next. Keep concise logs and persist session state.',
        whenToUse:
          'Use when initiating or coordinating an end-to-end project workflow, delegating to specialist agents as needed.',
      },
      [AgentId.ANALYST]: {
        name: 'Business Analyst',
        title: 'Business Analyst',
        role: 'Elicit and clarify business requirements.',
        focus:
          'Market analysis, user personas, problem framing, success metrics.',
        icon: '📊',
        principles: [
          'Clarify assumptions',
          'Quantify impact',
          'Document rationale',
        ],
        system:
          'You are a Business Analyst. Elicit clear requirements, produce concise findings and acceptance criteria. Maintain traceability to goals and risks.',
        whenToUse:
          'Use to clarify requirements, analyze markets, and define user needs before product specification.',
      },
      [AgentId.PM]: {
        name: 'Product Manager',
        title: 'Product Manager',
        role: 'Define product requirements and roadmap.',
        focus: 'PRD creation, prioritization, success metrics.',
        icon: '🧭',
        principles: [
          'Value first',
          'Prioritize ruthlessly',
          'Communicate clearly',
        ],
        system:
          'You are a Product Manager. Produce PRD sections with scope, personas, requirements, and success metrics.',
        whenToUse:
          'Use to draft or refine PRDs, prioritize features, and define measurable success criteria.',
      },
      [AgentId.UX]: {
        name: 'UX Expert',
        title: 'UX Expert',
        role: 'Design user experience and UI specifications.',
        focus: 'User flows, wireframes, accessibility.',
        icon: '🎨',
        principles: ['Clarity', 'Consistency', 'Accessibility'],
        system:
          'You are a UX Expert. Provide user flows and component-level specs with accessibility guidelines.',
        whenToUse:
          'Use for UX design tasks, user flows, wireframes, and accessibility guidance.',
      },
      [AgentId.ARCHITECT]: {
        name: 'Architect',
        title: 'Architect',
        role: 'Design system architecture and interfaces.',
        focus: 'High-level design, data model, integration contracts.',
        icon: '🏗️',
        principles: ['Simplicity', 'Scalability', 'Observability'],
        system:
          'You are a Software Architect. Propose a pragmatic architecture, data model, and interface contracts with trade-offs.',
        whenToUse:
          'Use to design system architecture, data models, and integration contracts.',
      },
      [AgentId.PO]: {
        name: 'Product Owner',
        title: 'Product Owner',
        role: 'Backlog refinement and planning.',
        focus: 'Epics, user stories, acceptance criteria.',
        icon: '📋',
        principles: [
          'Vertical slices',
          'INVEST stories',
          'Definition of Ready/Done',
        ],
        system:
          'You are a Product Owner. Break scope into epics and stories with clear acceptance criteria.',
        whenToUse:
          'Use to manage backlog, define epics and user stories, and prepare work for delivery.',
      },
      [AgentId.SM]: {
        name: 'Scrum Master',
        title: 'Scrum Master',
        role: 'Facilitate delivery process.',
        focus: 'Planning, impediment removal, continuous improvement.',
        icon: '🧩',
        principles: ['Transparency', 'Inspection', 'Adaptation'],
        system:
          'You are a Scrum Master. Propose an execution plan, identify risks, and suggest process improvements.',
        whenToUse:
          'Use to facilitate delivery planning, remove impediments, and improve processes.',
      },
      [AgentId.DEV]: {
        name: 'Developer',
        title: 'Developer',
        role: 'Implement features with tests.',
        focus: 'Clean code, tests, incremental delivery.',
        icon: '💻',
        principles: ['Testability', 'Readability', 'Small increments'],
        system:
          'You are a Developer. Produce code-level plans, implementation steps, and test strategy.',
        whenToUse:
          'Use to implement features, write tests, and produce code-level plans.',
      },
      [AgentId.QA]: {
        name: 'QA Engineer',
        title: 'QA Engineer',
        role: 'Assure quality through tests and gates.',
        focus: 'Test plan, automation, quality gates.',
        icon: '✅',
        principles: ['Prevent defects', 'Automate tests', 'Measure quality'],
        system:
          'You are a QA Engineer. Create a test plan with automated checks and quality gates.',
        whenToUse:
          'Use to design and execute test plans, automation, and quality gates.',
      },
    };

    const meta = map[agentId];
    if (!meta) return null;

    const def: AgentDefinition = {
      id: agentId,
      name: meta.name,
      title: meta.title,
      icon: meta.icon,
      role: meta.role,
      style: '',
      identity: '',
      focus: meta.focus,
      whenToUse: meta.whenToUse,
      corePrinciples: meta.principles,
      commands: [],
      dependencies: {},
      systemPrompt: meta.system,
      customization: undefined,
    };
    return def;
  }

  /**
   * Persist a workflow step
   */
  async persistStep(update: Partial<SessionState>): Promise<void> {
    await this.sessionManager.update(update);
  }

  /**
   * Get current mode
   */
  getMode(): BmadMode {
    return this.currentMode;
  }

  /**
   * Get current agent
   */
  getCurrentAgent(): AgentDefinition | null {
    return this.currentAgent;
  }

  /**
   * Get session manager
   */
  getSessionManager(): BmadSessionManager {
    return this.sessionManager;
  }

  /**
   * Get agent loader
   */
  getAgentLoader(): BmadAgentLoader {
    return this.agentLoader;
  }

  /**
   * Get task runner
   */
  getTaskRunner(): BmadTaskRunner {
    return this.taskRunner;
  }

  /**
   * Get workflow executor
   */
  getWorkflowExecutor(): BmadWorkflowExecutor {
    return this.workflowExecutor;
  }

  /**
   * Toggle orchestrator-only mode (no subagent prompt injection)
   */
  static setOrchestratorOnly(value: boolean) {
    BmadService.orchestratorOnly = value;
  }

  static getOrchestratorOnly(): boolean {
    return BmadService.orchestratorOnly;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * List all available agents
   */
  async listAgents(): Promise<string[]> {
    const fromDisk = await this.agentLoader.listAgents();
    if (fromDisk.length > 0) return fromDisk;
    // Fallback to built-in list when no .bmad-core exists
    return [
      AgentId.ANALYST,
      AgentId.PM,
      AgentId.ARCHITECT,
      AgentId.UX,
      AgentId.PO,
      AgentId.SM,
      AgentId.DEV,
      AgentId.QA,
      AgentId.ORCHESTRATOR,
    ];
  }

  /**
   * Resume workflow from session
   */
  async resumeWorkflow(): Promise<SessionState | null> {
    const session = await this.sessionManager.read();
    if (!session) {
      return null;
    }

    if (!this.sessionManager.canResume(session)) {
      console.log('No workflow to resume.');
      return null;
    }

    console.log(
      `\n🔄 Resuming BMAD workflow from Phase: ${session.currentPhase}\n` +
        `Current Agent: ${session.currentAgent || 'None'}\n` +
        `Completed Steps: ${session.completedSteps.length}\n`,
    );

    // Load the current agent
    if (session.currentAgent) {
      await this.loadAgent(session.currentAgent);
    }

    return session;
  }

  /**
   * Start a new workflow (clear existing session)
   */
  async startNewWorkflow(): Promise<void> {
    await this.sessionManager.clear();
    console.log('\n✨ Starting fresh BMAD workflow...\n');
  }
}
