/**
 * @license
 * Copyright 2025 Qwen + BMAD Method
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

/**
 * BMAD Mode types
 */
export type BmadMode = 'normal' | 'bmad-expert';

/**
 * Project types detected by BMAD
 */
export type ProjectType = 'greenfield' | 'brownfield';

/**
 * Workflow phases in BMAD method
 */
export enum WorkflowPhase {
  INIT = 'init',
  ANALYSIS = 'analysis',
  PRODUCT = 'product',
  UX = 'ux',
  ARCHITECTURE = 'architecture',
  PLANNING = 'planning',
  STORY_CREATION = 'story_creation',
  DEVELOPMENT = 'development',
  QA = 'qa',
  COMPLETE = 'complete',
}

/**
 * Agent IDs in BMAD system
 */
export enum AgentId {
  ORCHESTRATOR = 'bmad-orchestrator',
  ANALYST = 'analyst',
  PM = 'pm',
  UX = 'ux-expert',
  ARCHITECT = 'architect',
  PO = 'po',
  SM = 'sm',
  DEV = 'dev',
  QA = 'qa',
}

/**
 * Core configuration constants
 */
export const BMAD_CONFIG = {
  // Settings keys
  MODE_SETTING_KEY: 'bmad.mode',
  AUTO_RESUME_KEY: 'bmad.autoResume',
  MAX_RETRIES_KEY: 'bmad.maxRetries',
  TOKEN_BUDGET_KEY: 'bmad.tokenBudget',

  // File system paths (relative to project root)
  BMAD_CORE_DIR: '.bmad-core',
  SESSION_FILE: '.qwen/bmad-session.json',
  LOG_FILE: '.qwen/logs/bmad.log',

  // BMAD core subdirectories
  AGENTS_DIR: 'agents',
  TASKS_DIR: 'tasks',
  TEMPLATES_DIR: 'templates',
  CHECKLISTS_DIR: 'checklists',
  DATA_DIR: 'data',
  UTILS_DIR: 'utils',

  // Project structure
  DOCS_DIR: 'docs',
  EPICS_DIR: 'docs/epics',
  STORIES_DIR: 'docs/stories',
  QA_DIR: 'docs/qa',
  QA_ASSESSMENTS_DIR: 'docs/qa/assessments',
  QA_GATES_DIR: 'docs/qa/gates',

  // Key documents
  PRD_FILE: 'docs/prd.md',
  ARCHITECTURE_FILE: 'docs/architecture.md',
  FRONTEND_SPEC_FILE: 'docs/front-end-spec.md',

  // Default values
  DEFAULT_MODE: 'normal' as BmadMode,
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_TOKEN_BUDGET: 100000,

  // Workflow settings
  AUTO_PROCEED_DELAY_MS: 1000,
  RETRY_BACKOFF_MS: 2000,
} as const;

/**
 * Agent definition interface (parsed from .bmad-core/agents/*.md)
 */
export interface AgentDefinition {
  id: string;
  name: string;
  title: string;
  icon: string;
  role: string;
  style: string;
  identity: string;
  focus: string;
  whenToUse: string;
  corePrinciples: string[];
  commands: AgentCommand[];
  dependencies: AgentDependencies;
  systemPrompt: string; // Full persona text from MD body
  customization?: string;
}

/**
 * Agent command definition
 */
export interface AgentCommand {
  name: string;
  description: string;
  taskId?: string;
  templateId?: string;
  checklistId?: string;
  flags?: string[];
}

/**
 * Agent dependencies (tasks, templates, etc.)
 */
export interface AgentDependencies {
  tasks?: string[];
  templates?: string[];
  checklists?: string[];
  data?: string[];
  utils?: string[];
}

/**
 * Task definition
 */
export interface TaskDefinition {
  id: string;
  name: string;
  description: string;
  elicit?: boolean;
  instructions: string;
  outputPath?: string;
  templateId?: string;
}

/**
 * Session state for persistence
 */
export interface SessionState {
  mode: BmadMode;
  projectType: ProjectType;
  currentPhase: WorkflowPhase;
  currentAgent: AgentId | null;
  completedSteps: StepRecord[];
  artifacts: ArtifactRefs;
  context: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

/**
 * Record of a completed workflow step
 */
export interface StepRecord {
  phase: WorkflowPhase;
  agent: AgentId;
  taskId?: string;
  status: 'success' | 'skipped' | 'failed';
  timestamp: number;
  artifacts: string[];
  notes?: string;
}

/**
 * References to generated artifacts
 */
export interface ArtifactRefs {
  prd?: string;
  architecture?: string;
  frontendSpec?: string;
  epics: string[];
  stories: string[];
  qaReports: string[];
  qaGates: string[];
  shards: string[];
  [key: string]: string | string[] | undefined;
}

/**
 * Task execution context
 */
export interface TaskContext {
  agent: AgentDefinition;
  session: SessionState;
  projectType: ProjectType;
  cwd: string;
  artifacts: ArtifactRefs;
  inputText?: string;
  history?: unknown[];
  knowledgeShards?: string[];
}

/**
 * Task execution result
 */
export interface TaskResult {
  success: boolean;
  outputs: string[];
  artifacts: Partial<ArtifactRefs>;
  error?: Error;
  logs: string[];
}

/**
 * Helper functions for BMAD paths
 */
export class BmadPaths {
  constructor(private readonly cwd: string) {}

  get bmadCore(): string {
    return path.join(this.cwd, BMAD_CONFIG.BMAD_CORE_DIR);
  }

  get sessionFile(): string {
    return path.join(this.cwd, BMAD_CONFIG.SESSION_FILE);
  }

  get logFile(): string {
    return path.join(this.cwd, BMAD_CONFIG.LOG_FILE);
  }

  agent(agentId: string): string {
    return path.join(
      this.bmadCore,
      BMAD_CONFIG.AGENTS_DIR,
      `${agentId}.md`,
    );
  }

  task(taskId: string): string {
    return path.join(this.bmadCore, BMAD_CONFIG.TASKS_DIR, `${taskId}.md`);
  }

  template(templateId: string): string {
    return path.join(
      this.bmadCore,
      BMAD_CONFIG.TEMPLATES_DIR,
      `${templateId}.yaml`,
    );
  }

  checklist(checklistId: string): string {
    return path.join(
      this.bmadCore,
      BMAD_CONFIG.CHECKLISTS_DIR,
      `${checklistId}.md`,
    );
  }

  data(dataId: string): string {
    return path.join(this.bmadCore, BMAD_CONFIG.DATA_DIR, `${dataId}.md`);
  }

  prd(): string {
    return path.join(this.cwd, BMAD_CONFIG.PRD_FILE);
  }

  architecture(): string {
    return path.join(this.cwd, BMAD_CONFIG.ARCHITECTURE_FILE);
  }

  frontendSpec(): string {
    return path.join(this.cwd, BMAD_CONFIG.FRONTEND_SPEC_FILE);
  }

  docs(): string {
    return path.join(this.cwd, BMAD_CONFIG.DOCS_DIR);
  }

  epics(): string {
    return path.join(this.cwd, BMAD_CONFIG.EPICS_DIR);
  }

  stories(): string {
    return path.join(this.cwd, BMAD_CONFIG.STORIES_DIR);
  }

  qaAssessments(): string {
    return path.join(this.cwd, BMAD_CONFIG.QA_ASSESSMENTS_DIR);
  }

  qaGates(): string {
    return path.join(this.cwd, BMAD_CONFIG.QA_GATES_DIR);
  }
}