# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Introduction

Qwen Code is a command-line AI workflow tool adapted from Google Gemini CLI, optimized for Qwen-Coder models. It's a monorepo providing a terminal-first AI coding assistant with rich interactive TUI, safe tool execution, and orchestration of conversations with Qwen-Coder and OpenAI-compatible APIs.

## Commonly Used Commands

### Build
- `npm run build` - Build main project
- `npm run build:all` - Build project and sandbox container
- `npm run build --workspaces` - Build all workspace packages
- `npm run bundle` - Bundle CLI for distribution

### Test
- `npm run test` - Run unit tests across all packages
- `npm run test:e2e` - Run integration tests (no sandbox)
- `npm run test:ci` - Run CI test suite with coverage
- `npm run test:integration:sandbox:none` - Integration tests without sandbox
- `npm run test:integration:sandbox:docker` - Integration tests with Docker sandbox
- `npm run test:integration:sandbox:podman` - Integration tests with Podman sandbox
- `npm run test:e2e -- --test-name-pattern "test name"` - Run specific integration test
- `npm run test:terminal-bench` - Run terminal benchmark tests
- `VERBOSE=true npm run test:e2e` - Integration tests with verbose output
- `KEEP_OUTPUT=true npm run test:e2e` - Keep test artifacts for inspection

### Lint & Format
- `npm run lint` - Check code style and quality
- `npm run lint:fix` - Auto-fix linting issues
- `npm run format` - Format code with Prettier

### Development
- `npm start` - Start Qwen Code CLI from source
- `npm run debug` - Start CLI in debug mode (attach debugger)
- `npm run clean` - Remove generated files and artifacts
- `DEV=true npm start` - Start with React DevTools support

### Preflight
- `npm run preflight` - Full check: clean, install, format, lint, build, typecheck, test

## High-Level Architecture

### Package Structure
**Monorepo using npm workspaces:**
- `packages/cli/` - User-facing interface
  - Ink/React-based TUI for rich terminal interactions
  - Input processing, history management, display rendering
  - Theme and UI customization
  - CLI configuration and settings management
  
- `packages/core/` - Backend orchestration engine
  - API clients for Gemini, OpenAI-compatible, and Qwen OAuth2
  - Prompt construction and conversation state management
  - Tool registry and execution logic with approval workflows
  - Server-side configuration and telemetry

- `packages/test-utils/` - Shared testing utilities
- `packages/vscode-ide-companion/` - VS Code integration

### Tools System
Located in `packages/core/src/tools/`:
- **File operations**: `read-file`, `write-file`, `edit`, `read-many-files`, `ls`, `glob`
- **Search**: `grep`, `ripGrep`
- **Execution**: `shell` (sandboxed command execution)
- **Web**: `web-fetch`, `web-search`
- **Memory**: `memoryTool` (persistent context across sessions)
- **MCP**: `mcp-client`, `mcp-tool` (Model Context Protocol integration)
- **Planning**: `task`, `exitPlanMode`
- **Subagents**: Specialized AI assistants with isolated context

### Interaction Flow
1. **User input** → CLI package handles prompt
2. **Request to core** → CLI sends input to core backend
3. **Prompt construction** → Core builds request with context, history, tools
4. **API request** → Sent to configured model (Qwen OAuth, OpenAI-compatible)
5. **Tool execution** → If model requests tools:
   - Read-only operations may auto-execute
   - Modifying operations require user approval
   - Results sent back to model for final response
6. **Response display** → CLI formats and renders output

### Authentication & Model Support
- **Qwen OAuth2** (recommended): 2,000 requests/day, automatic credential refresh
- **OpenAI-compatible APIs**: Alibaba Cloud (Bailian, ModelScope, ModelStudio), OpenRouter
- **Vision models**: Automatic detection and switching when images are in input
- **Model adapters**: Parser optimized for Qwen-Coder response formats

## Key Design Patterns

### Modularity
CLI frontend completely decoupled from core backend, enabling independent development and potential alternate frontends.

### Extensibility
Tool system designed for easy addition of new capabilities. Each tool is a module implementing a standard interface.

### User Experience
- Approval gates before file modifications or risky operations
- Rich terminal UI with syntax highlighting and formatted output
- History management and conversation compression
- Progress indicators and real-time feedback

### Subagents
Specialized AI assistants configured with:
- Task-specific system prompts
- Controlled tool access
- Isolated conversation context
- Stored as Markdown with YAML frontmatter in `.qwen/agents/` or `~/.qwen/agents/`

### Checkpointing
Automatic snapshots before file modifications:
- Shadow Git repository in `~/.qwen/history/<project_hash>`
- Conversation history and tool calls saved
- Restore with `/restore` command

### Sandboxing
Multiple isolation methods:
- **macOS Seatbelt**: Built-in `sandbox-exec` with configurable profiles
- **Container-based**: Docker or Podman for cross-platform isolation
- Network proxying support for restricted outbound traffic
- Profiles: permissive/restrictive × open/closed/proxied

### Telemetry
OpenTelemetry-based observability:
- Traces for operation flow
- Metrics for performance monitoring
- Structured logs for debugging
- Exporters for local inspection or Google Cloud

## Development Setup Notes

### Requirements
- **Node.js**: >=20.0.0 (development recommends ~20.19.0 due to upstream dependency issue)
- **Git**: For version control and checkpointing

### TypeScript Configuration
- Monorepo with project references (`tsconfig.json` extends root)
- Strict mode enabled with all null/undefined checks
- Composite builds for incremental compilation
- ESM-only (`"type": "module"` in package.json)
- Verbatim module syntax for proper ESM output

### Build System
- **Bundler**: ESBuild for fast bundling
- **Entry point**: `packages/cli/index.ts`
- **Output**: `bundle/gemini.js` (note: legacy naming from Gemini CLI)
- **External dependencies**: node-pty variants for cross-platform PTY support

### Code Quality
- **Linter**: ESLint with TypeScript support
  - Import restrictions between packages
  - No default exports in CLI package
  - Consistent type assertions and imports
- **Formatter**: Prettier with experimental CLI
- **Testing**: Vitest with coverage support

### Project References
Each package has `tsconfig.json` extending root config:
```json
{
  "extends": "../../tsconfig.json",
  "references": [{ "path": "../core" }]
}
```

## Important File Patterns

### Configuration Files
- `.qwen/settings.json` - Project-specific settings (takes precedence)
- `~/.qwen/settings.json` - User global settings
- `.env` - Environment variables (project root)
- `.qwen/.env` - Qwen-specific environment variables

### Ignore Patterns
- `.qwenignore` - Exclude files/directories from tool operations (gitignore syntax)
- Automatically respected by file reading and search tools

### Context & Memory
- `~/.qwen/QWEN.md` - Persistent memory file (configurable via `contextFileName`)
- Context loaded at session start
- Use `save_memory` tool to append facts

### Subagent Configuration
**Format**: Markdown with YAML frontmatter
```markdown
---
name: agent-name
description: When to use this agent
tools: tool1, tool2  # Optional
---
System prompt content with ${variable} templating
```
**Locations** (precedence order):
1. `.qwen/agents/` - Project-specific
2. `~/.qwen/agents/` - User global

### Checkpointing Data
- Shadow repository: `~/.qwen/history/<project_hash>`
- Checkpoint files: `~/.qwen/tmp/<project_hash>/checkpoints`
- Format: `YYYY-MM-DDTHH-mm-ss_000Z-filename-toolname`

## Testing Notes

### Unit Tests
- Per-package test suites with Vitest
- Located alongside source: `*.test.ts`, `*.test.tsx`
- Coverage reporting with `@vitest/coverage-v8`

### Integration Tests
- Located in `integration-tests/` directory
- Output artifacts in `.integration-tests/<run-id>/<test-file>/<test-case>/`
- Sandboxing matrix: none, docker, podman
- Environment variables:
  - `VERBOSE=true` - Detailed logging
  - `KEEP_OUTPUT=true` - Preserve test artifacts
  - `GEMINI_SANDBOX=false|docker|podman` - Sandbox mode

### Terminal Benchmarks
- `npm run test:terminal-bench` - Run full benchmark suite
- `npm run test:terminal-bench:qwen` - Qwen-specific tests
- Tests CLI against standardized terminal tasks

### Debug Integration Tests
To run with maximum diagnostics:
```bash
VERBOSE=true KEEP_OUTPUT=true npm run test:e2e
```

Output location printed: `.integration-tests/<timestamp>/`

## Key Differences from Gemini CLI

### Parser Adaptations
Response parsing optimized for Qwen-Coder model output formats, particularly for:
- Tool call extraction and formatting
- Code block boundaries and language detection
- YAML frontmatter in responses

### Authentication
- Native Qwen OAuth2 integration with automatic token refresh
- Support for Alibaba Cloud services (Bailian, ModelScope, ModelStudio)
- Regional API endpoint configuration

### Vision Capabilities
- Automatic image detection in user input
- Configurable vision model switching modes: once, session, persist
- Dialog prompts for switching behavior (skippable via settings)

### Context Management
- Memory file named `QWEN.md` (not `GEMINI.md`)
- Enhanced memory tool for persistent facts across sessions
- Context file location configurable via settings

### Regional Support
- Specialized handling for mainland China vs international users
- Provider-specific optimizations (DashScope, ModelScope, OpenRouter)
- Documentation in multiple languages (DE, FR, JA, RU, ZH)

## Extension Points

### Adding New Tools
1. Create tool module in `packages/core/src/tools/`
2. Implement tool interface with schema definition
3. Register in `tool-registry.ts`
4. Add tests in `<toolname>.test.ts`

### MCP Server Integration
Model Context Protocol servers can be added via:
- `.qwen/mcp.json` configuration
- `/mcp add` command for interactive setup
- Supports stdio, SSE, and WebSocket transports

### Custom Subagents
Create specialized assistants for project workflows:
1. Define Markdown file with YAML frontmatter
2. Place in `.qwen/agents/` (project) or `~/.qwen/agents/` (global)
3. Use `/agents create` for guided wizard
4. Manage with `/agents manage`
