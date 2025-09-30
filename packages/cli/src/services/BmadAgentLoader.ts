/**
 * @license
 * Copyright 2025 Qwen + BMAD Method
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
// @ts-ignore - js-yaml types
import yaml from 'js-yaml';
import type { AgentDefinition } from '../config/bmadConfig.js';
import { BmadPaths } from '../config/bmadConfig.js';

interface ParsedYamlFrontMatter {
  agent?: {
    id?: string;
    name?: string;
    title?: string;
    icon?: string;
    whenToUse?: string;
    customization?: string;
  };
  persona?: {
    role?: string;
    style?: string;
    identity?: string;
    focus?: string;
    core_principles?: string[];
  };
  commands?: Array<string | Record<string, unknown>>;
  dependencies?: {
    tasks?: string[];
    templates?: string[];
    checklists?: string[];
    data?: string[];
    utils?: string[];
  };
}

/**
 * Loads and parses BMAD agent definitions from .bmad-core/agents/*.md files
 */
export class BmadAgentLoader {
  private cache = new Map<string, { agent: AgentDefinition; mtime: number }>();
  private readonly paths: BmadPaths;

  constructor(_cwd: string) {
    this.paths = new BmadPaths(_cwd);
  }

  /**
   * Load an agent definition by ID
   */
  async loadAgent(agentId: string): Promise<AgentDefinition> {
    const filePath = this.paths.agent(agentId);

    // Check cache and file modification time
    const cached = this.cache.get(agentId);
    if (cached) {
      try {
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs === cached.mtime) {
          return cached.agent;
        }
      } catch {
        // File doesn't exist anymore, clear cache
        this.cache.delete(agentId);
      }
    }

    // Load and parse agent file
    const agent = await this.parseAgentFile(filePath);
    
    // Update cache
    try {
      const stats = await fs.stat(filePath);
      this.cache.set(agentId, { agent, mtime: stats.mtimeMs });
    } catch {
      // File might have been deleted, skip caching
    }

    return agent;
  }

  /**
   * Parse an agent markdown file with YAML front matter
   */
  private async parseAgentFile(filePath: string): Promise<AgentDefinition> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to read agent file at ${filePath}: ${error instanceof Error ? error.message : String(error)}\n\n` +
        `Make sure the .bmad-core directory exists and contains the required agent files.\n` +
        `Expected path: ${filePath}`
      );
    }

    // Extract YAML front matter (between ```yaml and ```)
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlMatch) {
      throw new Error(
        `No YAML front matter found in agent file: ${filePath}\n\n` +
        `Agent files must contain a YAML block with the agent definition.\n` +
        `Format:\n` +
        `\`\`\`yaml\n` +
        `agent:\n` +
        `  id: agent-id\n` +
        `  name: Agent Name\n` +
        `  ...\n` +
        `\`\`\``
      );
    }

    let parsed: ParsedYamlFrontMatter;
    try {
      parsed = yaml.load(yamlMatch[1]) as ParsedYamlFrontMatter;
    } catch (error) {
      throw new Error(
        `Failed to parse YAML in agent file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Validate required fields
    if (!parsed.agent?.id) {
      throw new Error(`Missing required field 'agent.id' in ${filePath}`);
    }
    if (!parsed.agent?.name) {
      throw new Error(`Missing required field 'agent.name' in ${filePath}`);
    }
    if (!parsed.persona?.role) {
      throw new Error(`Missing required field 'persona.role' in ${filePath}`);
    }

    // Extract system prompt (everything after the YAML block)
    const yamlEndIndex = content.indexOf('```', yamlMatch.index! + 7) + 3;
    const systemPrompt = content.slice(yamlEndIndex).trim();

    // Parse commands
    const commands = this.parseCommands(parsed.commands || []);

    // Build agent definition
    const agent: AgentDefinition = {
      id: parsed.agent.id,
      name: parsed.agent.name,
      title: parsed.agent.title || parsed.agent.name,
      icon: parsed.agent.icon || '🤖',
      role: parsed.persona.role,
      style: parsed.persona.style || '',
      identity: parsed.persona.identity || '',
      focus: parsed.persona.focus || '',
      whenToUse: parsed.agent.whenToUse || '',
      corePrinciples: parsed.persona.core_principles || [],
      commands,
      dependencies: parsed.dependencies || {},
      systemPrompt,
      customization: parsed.agent.customization,
    };

    return agent;
  }

  /**
   * Parse command definitions from YAML
   */
  private parseCommands(
    commandsRaw: Array<string | Record<string, unknown>>
  ): AgentDefinition['commands'] {
    const commands: AgentDefinition['commands'] = [];

    for (const cmd of commandsRaw) {
      if (typeof cmd === 'string') {
        // Simple format: "help: Show help"
        const [name, description] = cmd.split(':').map(s => s.trim());
        commands.push({
          name: name || '',
          description: description || '',
        });
      } else if (typeof cmd === 'object') {
        // Complex format with taskId, templateId, etc.
        const [name, details] = Object.entries(cmd)[0];
        const description = typeof details === 'string' ? details : '';
        const taskId = typeof details === 'object' && details !== null ? 
          (details as Record<string, unknown>)['taskId'] as string | undefined : undefined;
      const templateId = details ?
          (details as Record<string, unknown>)['templateId'] as string | undefined : undefined;
        
        commands.push({
          name,
          description,
          taskId,
          templateId,
        });
      }
    }

    return commands;
  }

  /**
   * Clear agent cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * List all available agent IDs
   */
  async listAgents(): Promise<string[]> {
    const agentsDir = path.join(this.paths.bmadCore, 'agents');
    try {
      const files = await fs.readdir(agentsDir);
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => path.basename(f, '.md'));
    } catch {
      return [];
    }
  }
}