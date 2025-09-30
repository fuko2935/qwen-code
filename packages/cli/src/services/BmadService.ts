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
  AgentId 
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
        '\n⭐ BMAD Expert Mode initialized with built-in agents and workflows.\n'
      );

      // Check for existing session and offer to resume
      const sessionExists = await this.sessionManager.exists();
      if (sessionExists) {
        const session = await this.sessionManager.read();
        if (session && this.sessionManager.canResume(session)) {
          console.log(
            `🔄 Found existing BMAD workflow in progress (Phase: ${session.currentPhase})\n` +
            `Use /bmad resume to continue where you left off.\n`
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
      const requiredDirs = [
        'agents',
        'tasks',
        'templates',
      ];

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
    const orchestrator = await this.agentLoader.loadAgent(AgentId.ORCHESTRATOR);
    this.currentAgent = orchestrator;

    // Build system prompt from agent definition
    const systemPrompt = this.buildSystemPrompt(orchestrator);
    return systemPrompt;
  }

  /**
   * Load a specific agent
   */
  async loadAgent(agentId: AgentId | string): Promise<AgentDefinition> {
    const agent = await this.agentLoader.loadAgent(agentId);
    this.currentAgent = agent;
    return agent;
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
      agent.corePrinciples.forEach(principle => {
        parts.push(`- ${principle}`);
      });
      parts.push('');
    }

    // Available commands
    if (agent.commands.length > 0) {
      parts.push('## Available Commands:');
      parts.push('All BMAD commands start with `/bmad-` prefix.');
      parts.push('');
      agent.commands.forEach(cmd => {
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
      const prdExists = await fs.access(this.paths.prd()).then(() => true).catch(() => false);
      const archExists = await fs.access(this.paths.architecture()).then(() => true).catch(() => false);
      
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
      `\n${this.currentAgent?.icon || '🤖'} ${this.currentAgent?.name || 'Agent'}: Analyzing your request...\n`
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
    }
  ): Promise<Partial<ArtifactRefs>> {
    // Check if subagent config is provided in context (from real delegation)
    const subagentConfig = options?.context?.['subagentConfig'] as any;
    
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
    console.log(`Delegated By: ${options?.context?.['delegatedBy'] || 'direct'}`);
    console.log(`Task ID: ${options?.taskId || 'none'}`);
    console.log(`${'='.repeat(70)}\n`);
    
    console.log(`📝 Agent Instructions Preview:`);
    const preview = agentInfo.systemPrompt.substring(0, 200).replace(/\n/g, ' ');
    console.log(`   ${preview}...\n`);

    // Inject subagent's system prompt into conversation history
    await this.injectAgentPromptToConversation(agentInfo.systemPrompt, agentInfo.name);

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
      console.log(`   The model is now operating with specialized ${agentName} instructions\n`);
    } catch (error) {
      console.error(`❌ Failed to inject agent prompt: ${error}`);
    }
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
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * List all available agents
   */
  async listAgents(): Promise<string[]> {
    return this.agentLoader.listAgents();
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
      `Completed Steps: ${session.completedSteps.length}\n`
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