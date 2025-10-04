/**
 * @license
 * Copyright 2025 Qwen + BMAD Method
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
// @ts-ignore - js-yaml types
import yaml from 'js-yaml';
import type { TaskContext, TaskResult, TaskDefinition } from '../config/bmadConfig.js';
import { BmadPaths } from '../config/bmadConfig.js';

/**
 * Task runner for executing BMAD tasks and rendering templates
 */
export class BmadTaskRunner {
  private readonly paths: BmadPaths;
  private readonly isWindows: boolean;

  constructor(_cwd: string) {
    this.paths = new BmadPaths(_cwd);
    this.isWindows = os.platform() === 'win32';
  }

  /**
   * Run a task by ID
   */
  async run(taskId: string, ctx: TaskContext): Promise<TaskResult> {
    const result: TaskResult = {
      success: false,
      outputs: [],
      artifacts: {},
      logs: [],
    };

    try {
      result.logs.push(`Starting task: ${taskId}`);

      // Resolve task file
      const taskPath = this.paths.task(taskId);
      const task = await this.resolveTask(taskPath);

      result.logs.push(`Task resolved: ${task.name}`);

      // Execute task instructions
      if (task.templateId) {
        result.logs.push(`Rendering template: ${task.templateId}`);
        const rendered = await this.renderTemplate(task.templateId, ctx);
        
        // Write output if specified
        if (task.outputPath) {
          const outputPath = this.resolveOutputPath(task.outputPath, ctx);
          await this.writeOutputAtomic(outputPath, rendered);
          result.outputs.push(outputPath);
          result.logs.push(`Output written: ${outputPath}`);
        }
      }

      result.success = true;
      result.logs.push(`Task completed: ${taskId}`);
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error : new Error(String(error));
      result.logs.push(`Task failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Resolve task definition from file
   */
  private async resolveTask(taskPath: string): Promise<TaskDefinition> {
    let content: string;
    
    try {
      content = await fs.readFile(taskPath, 'utf-8');
    } catch (_error) {
      throw new Error(
        `Task file not found: ${taskPath}\n` +
        `Make sure the task exists in .bmad-core/tasks/`
      );
    }

    // Try to parse as YAML front matter
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)\n```/);
    if (yamlMatch) {
      try {
        const parsed = yaml.load(yamlMatch[1]) as Record<string, unknown>;
        
        return {
          id: path.basename(taskPath, '.md'),
          name: (parsed['name'] as string) || path.basename(taskPath, '.md'),
          description: (parsed['description'] as string) || '',
          instructions: content, // Use the full content as instructions
          elicit: parsed['elicit'] as boolean | undefined,
          // Other properties
          outputPath: parsed['outputPath'] as string | undefined,
          templateId: parsed['templateId'] as string | undefined,
        };
      } catch {
        // Fall through to simple task
      }
    }

    // Simple markdown task
    return {
      id: path.basename(taskPath, '.md'),
      name: path.basename(taskPath, '.md'),
      description: '',
      instructions: content,
    };
  }

  /**
   * Render a template with data
   */
  async renderTemplate(templateId: string, ctx: TaskContext): Promise<string> {
    const templatePath = this.paths.template(templateId);
    
    let content: string;
    try {
      content = await fs.readFile(templatePath, 'utf-8');
    } catch (_error) {
      throw new Error(
        `Template file not found: ${templatePath}\n` +
        `Make sure the template exists in .bmad-core/templates/`
      );
    }

    // Parse YAML template
    let templateData: Record<string, unknown>;
    try {
      templateData = yaml.load(content) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Failed to parse template YAML: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Simple variable substitution
    let rendered = JSON.stringify(templateData, null, 2);

    // Replace variables like {{projectName}}, {{description}}, etc.
    const variables: Record<string, string> = {
      projectName: ctx.session.context['projectName'] as string || 'New Project',
      projectType: ctx.projectType,
      currentPhase: ctx.session.currentPhase,
      timestamp: new Date().toISOString(),
      agent: ctx.agent.name,
      ...ctx.session.context,
    };

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      rendered = rendered.replace(regex, String(value));
    }

    return rendered;
  }

  /**
   * Write output atomically (temp file + rename)
   */
  private async writeOutputAtomic(outputPath: string, content: string): Promise<void> {
    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    // Normalize line endings for Windows
    let finalContent = content;
    if (this.isWindows) {
      finalContent = content.replace(/\r?\n/g, '\r\n');
    }

    // Atomic write: temp file + rename
    const tempFile = path.join(
      os.tmpdir(),
      `bmad-output-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
    );

    try {
      await fs.writeFile(tempFile, finalContent, 'utf-8');
      await fs.rename(tempFile, outputPath);
    } catch (error) {
      // Clean up temp file
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Resolve output path with variables
   */
  private resolveOutputPath(pathTemplate: string, ctx: TaskContext): string {
    let resolved = pathTemplate;

    // Replace variables
    const variables: Record<string, string> = {
      cwd: ctx.cwd,
      projectName: ctx.session.context['projectName'] as string || 'project',
      epic: ctx.session.context['currentEpic'] as string || 'epic',
      story: ctx.session.context['currentStory'] as string || 'story',
      timestamp: Date.now().toString(),
    };

    for (const [key, value] of Object.entries(variables)) {
      resolved = resolved.replace(`{${key}}`, value);
    }

    // Make absolute if not already
    if (!path.isAbsolute(resolved)) {
      resolved = path.join(ctx.cwd, resolved);
    }

    return resolved;
  }

  /**
   * List available tasks
   */
  async listTasks(): Promise<string[]> {
    const tasksDir = path.join(this.paths.bmadCore, 'tasks');
    try {
      const files = await fs.readdir(tasksDir);
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => path.basename(f, '.md'));
    } catch {
      return [];
    }
  }

  /**
   * List available templates
   */
  async listTemplates(): Promise<string[]> {
    const templatesDir = path.join(this.paths.bmadCore, 'templates');
    try {
      const files = await fs.readdir(templatesDir);
      return files
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
        .map(f => path.basename(f, path.extname(f)));
    } catch {
      return [];
    }
  }
}
