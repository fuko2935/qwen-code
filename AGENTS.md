# Repository Guidelines

## Project Structure & Module Organization
This monorepo targets the Qwen Code agent tooling. Source lives under `packages/`, with `cli` (CLI entrypoint), `core` (shared runtime), `test-utils`, and `vscode-ide-companion`. Integration flows and regression suites sit in `integration-tests/`. Supporting docs live in `docs/`. Build artifacts land in `bundle/` and package-level `dist/` directories -- never edit generated output directly. Shared scripts are under `scripts/`, and repo-wide config (tsconfig, eslint, prettier) lives at the root.

## Build, Test, and Development Commands
Run `npm install` once per checkout; the repo assumes Node 20 (`nvm use`). Use `npm run build` for TypeScript compilation, or `npm run build:all` when you need the sandbox image as well. Start the CLI locally with `npm run start`. Run the full validation gate with `npm run preflight`. For faster loops, prefer `npm run lint`, `npm run typecheck`, and `npm run test`. Integration suites require opt-in: `npm run test:integration:sandbox:none` (local) or `npm run test:integration:all` before release.

## Coding Style & Naming Conventions
The project enforces LF endings, final newlines, and two-space indentation via `.editorconfig`. Prettier (`.prettierrc.json`) controls formatting: 80-character width, `semi: true`, `singleQuote: true`. Keep TypeScript modules ESM (`import`/`export`). Use `camelCase` for functions, `PascalCase` for classes, and kebab-case for files beyond entrypoints. Run `npm run format` before committing. Lint rules live in `eslint.config.js`; expect plugin coverage for React hooks, imports, and custom rules in `eslint-rules/`.

## Testing Guidelines
Vitest drives both unit (`packages/*/src/**`) and integration suites. Name files `*.test.ts` or `*.spec.ts`, and keep fixtures beside tests. `packages/cli/vitest.config.ts` enables V8 coverage; maintain meaningful coverage artifacts (`coverage/`, `coverage-summary.json`) and include rationale if coverage drops. Integration runs require `GEMINI_SANDBOX` variants and, for forks, a `GEMINI_API_KEY` secret; see `CONTRIBUTING.md`.

## Commit & Pull Request Guidelines
History shows Conventional Commit prefixes (`feat:`, `chore:`, `fix:`) alongside legacy free-form titles; default to the Conventional format with concise imperatives. Reference issues (`Fixes #123`) and describe the "why". Each PR should include: scope summary, verification steps (`npm run preflight` output), documentation updates for user-facing changes, and screenshots or logs for UI or CLI deltas. Squash commits on merge unless a maintainer requests otherwise.

## Security & Configuration Notes
Follow `SECURITY.md` for vulnerability reporting. Treat sandbox images and API keys as secrets; never commit values or share logs containing credentials. Document any new environment variables in `docs/` and the relevant package README.
