# Interactive Sessions - Hierarchical Task Management

## Overview

The Qwen Code interactive session system enables hierarchical, bidirectional communication with subagents. This Roo Code-style system allows agents to delegate tasks to specialized subagents while maintaining context and user interactivity.

## Key Features

- **Hierarchical Sessions**: Parent-child session tree structure
- **Bidirectional Messaging**: Real-time communication between user and subagent
- **Automatic UI Switching**: Seamless transitions between sessions
- **Context Inheritance**: Variables flow down the session tree
- **Nested Tasks**: Subagents can delegate to other subagents
- **Event-Driven Architecture**: Real-time updates and notifications

## Starting an Interactive Session

### Via Natural Language

Simply ask the main agent to use a subagent interactively:

```
> Let's use bmad-analyst interactively to analyze this codebase
```

### Via Task Tool

When using the Task tool programmatically:

```typescript
{
  subagent_type: "bmad-analyst",
  prompt: "Analyze the requirements document",
  description: "Requirements analysis",
  interactive: true,      // Enable interactive mode
  autoSwitch: true,       // Auto-switch UI to new session
  maxDepth: 3,           // Maximum nesting depth
  inheritContext: true,   // Inherit parent context
  allowUserInteraction: true  // Allow user messages
}
```

## Session Configuration Parameters

| Parameter              | Type    | Default | Description                                         |
| ---------------------- | ------- | ------- | --------------------------------------------------- |
| `interactive`          | boolean | false   | Enable bidirectional messaging                      |
| `autoSwitch`           | boolean | true    | Automatically switch UI to new session              |
| `maxDepth`             | number  | 3       | Maximum nesting depth (prevents infinite recursion) |
| `inheritContext`       | boolean | true    | Inherit context variables from parent               |
| `allowUserInteraction` | boolean | true    | Allow user to send messages to this session         |

## Session Navigation

### Automatic Navigation

- **Auto-Switch**: When a new interactive session starts, the UI automatically switches to it
- **Auto-Return**: When a child session completes, the UI returns to the parent session

### Manual Navigation

- **Alt+← (Option+Left Arrow)**: Return to parent session
- **Slash Commands**:
  - `/session ls` - List all active sessions
  - `/session back` - Return to parent session
  - `/session abort` - Abort current session

## Session Tree Structure

Sessions form a hierarchical tree:

```
Root (Main Agent)
├── Session-1 (bmad-analyst) [active]
│   ├── Session-1.1 (bmad-researcher) [paused]
│   └── Session-1.2 (bmad-validator) [completed]
└── Session-2 (bmad-dev) [completed]
```

### Session Status

- **active**: Currently processing or ready for input
- **paused**: Temporarily suspended
- **completed**: Successfully finished
- **aborted**: Terminated due to error or user request

## Context Inheritance

Child sessions can inherit context variables from their parent:

```typescript
// Parent session sets context
contextState.set('project_name', 'Qwen Code');
contextState.set('tech_stack', 'TypeScript, React');
contextState.set('main_goal', 'Add interactive sessions');

// Child session automatically has access to these variables
// if inheritContext: true (default)
```

### Copy-on-Write Semantics

- Child sessions receive a **copy** of parent context
- Changes in child sessions don't affect parent
- Each session maintains its own isolated state

## Nested Task Delegation

Interactive sessions can create child sessions up to the configured `maxDepth`:

```
Root (depth 0)
└── Analyst (depth 1)
    └── Researcher (depth 2)
        └── Validator (depth 3) ← maxDepth reached
```

### Controlling Nested Tasks

```typescript
// In RunConfig
{
  allow_nested_tasks: true,  // Enable nested delegation
  interactive: true,         // Interactive mode
  maxDepth: 3               // Max 3 levels deep
}
```

- **Non-interactive mode**: `allow_nested_tasks` defaults to `false`
- **Interactive mode**: Can be enabled based on use case

## Session Events

The system emits events that can be subscribed to:

```typescript
type SessionEvent =
  | 'SESSION_STARTED' // New session created
  | 'SESSION_SWITCHED' // Active session changed
  | 'SESSION_PAUSED' // Session paused
  | 'SESSION_RESUMED' // Session resumed
  | 'SESSION_COMPLETED' // Session finished successfully
  | 'SESSION_ABORTED' // Session terminated
  | 'USER_MESSAGE_TO_SESSION' // User sent message
  | 'SUBAGENT_MESSAGE_TO_USER'; // Subagent responded
```

### Subscribing to Events

```typescript
const sessionManager = config.getSessionManager();

sessionManager.on((event) => {
  switch (event.type) {
    case 'SESSION_STARTED':
      console.log(`New session: ${event.sessionId}`);
      break;
    case 'SUBAGENT_MESSAGE_TO_USER':
      console.log(`Message: ${event.textChunk || event.finalText}`);
      break;
  }
});
```

## UI Integration

### Session Indicator

The UI displays the current session breadcrumb:

```
Session: ● bmad-analyst › researcher [active]
  ⌥← back to parent  •  /session ls  •  /session abort
```

### Input Routing

- **In session**: Input is routed to the active session's subagent
- **Outside session**: Input is processed by the main agent

## Best Practices

### When to Use Interactive Mode

✅ **Use Interactive Mode For:**

- Long-running analysis tasks requiring user feedback
- Complex multi-step workflows with decision points
- Tasks where you want to guide the subagent's approach
- Exploratory or research-oriented tasks

❌ **Use Non-Interactive Mode For:**

- Quick, autonomous tasks with clear objectives
- Background processing that doesn't need interaction
- Batch operations or bulk tasks
- Fire-and-forget delegation

### Context Management

1. **Set Clear Context**: Establish important variables in the parent session
2. **Use Descriptive Names**: Make context variables self-documenting
3. **Avoid Pollution**: Don't set unnecessary context variables
4. **Document Dependencies**: Note which context variables a subagent needs

### Nesting Guidelines

1. **Limit Depth**: Default `maxDepth=3` is usually sufficient
2. **Clear Purpose**: Each nesting level should have a distinct purpose
3. **Avoid Cycles**: Don't create circular delegation patterns
4. **Monitor Complexity**: Deep nesting can be confusing

## Example Workflow

### 1. Start Interactive Session

```
User: Let's analyze the codebase interactively with bmad-analyst

[UI switches to: bmad-analyst]
Session: ● bmad-analyst [active]

Analyst: I'm ready to analyze. What would you like me to focus on?
```

### 2. User Interaction

```
User: Focus on the session management system we just built

Analyst: I'll analyze the session management system. Let me start by
examining the core files...

[Analyst uses Read tool, examines SessionManager.ts, types.ts, etc.]

Analyst: I've found the session system. It has:
- SessionManager for orchestration
- SessionContext for state management
- SessionStack for hierarchy tracking
Would you like me to delegate a detailed architecture review to bmad-researcher?
```

### 3. Nested Delegation

```
User: Yes, let's get a detailed review

[Analyst creates child session with bmad-researcher]
[UI switches to: bmad-analyst › bmad-researcher]
Session: ● bmad-analyst › bmad-researcher [active]

Researcher: Analyzing architecture...
[Researcher conducts analysis]

[Research complete, returns to analyst]
Session: ● bmad-analyst [active]

Analyst: Based on the research findings...
```

### 4. Return to Main

```
User: Great, thanks!

Analyst: Analysis complete. Returning to main agent.

[Session completes, returns to root]
Session: ● main [active]

User: [back to normal chat mode]
```

## Architecture Details

### Core Components

1. **SessionManager**: Central orchestrator
   - Manages session lifecycle
   - Maintains session tree
   - Routes messages
   - Emits events

2. **SessionContext**: Per-session state
   - Isolated state management
   - Parent context inheritance
   - Copy-on-write semantics

3. **SessionStack**: Active session tracking
   - Stack-based navigation
   - Parent-child relationships
   - Breadcrumb generation

4. **SubAgentScope**: Execution environment
   - `runInteractive()`: Interactive mode execution
   - `enqueueUserMessage()`: Message queueing
   - `processNextInteractive()`: Message processing

### Implementation Files

```
packages/core/src/session/
├── types.ts              # Type definitions and interfaces
├── SessionContext.ts     # Context management with inheritance
├── SessionStack.ts       # Stack and tree structure management
├── SessionManager.ts     # Main orchestration logic
└── index.ts             # Module exports

packages/core/src/subagents/
├── subagent.ts          # SubAgentScope with interactive support
└── types.ts             # RunConfig with interactive flags

packages/core/src/tools/
└── task.ts              # TaskTool with session creation

packages/cli/src/ui/
├── hooks/
│   └── useSessionManagement.ts  # React hook for session state
├── components/
│   └── SessionIndicator.tsx     # UI breadcrumb component
└── App.tsx                      # Main UI integration
```

## Troubleshooting

### Session Not Switching

**Problem**: UI doesn't switch to new session

**Solutions**:

- Check that `autoSwitch: true` in session config
- Verify `useSessionManagement` hook is properly integrated
- Check browser console for errors

### Messages Not Reaching Subagent

**Problem**: User messages not being processed

**Solutions**:

- Ensure session is in 'active' status
- Verify `allowUserInteraction: true`
- Check that scope is bound: `sessionManager.bindScope()`

### Nested Tasks Not Working

**Problem**: Subagent can't create child sessions

**Solutions**:

- Set `allow_nested_tasks: true` in RunConfig
- Check current depth against `maxDepth`
- Verify TaskTool is not filtered out

### Context Not Inherited

**Problem**: Child session can't access parent context

**Solutions**:

- Ensure `inheritContext: true` (default)
- Verify parent context has the required keys
- Check that context is set before child creation

## Advanced Topics

### Custom Session Configuration

Programmatically configure sessions:

```typescript
const sessionManager = config.getSessionManager();

await sessionManager.createSession({
  name: 'custom-session',
  parentId: currentSessionId,
  sessionConfig: {
    interactive: true,
    maxDepth: 5, // Allow deeper nesting
    autoSwitch: false, // Manual switching
    inheritContext: false, // Isolated context
    allowUserInteraction: true,
  },
  taskPrompt: 'Custom task',
});
```

### Event-Driven Workflows

Build reactive workflows with events:

```typescript
sessionManager.on((event) => {
  if (event.type === 'SESSION_COMPLETED') {
    // Trigger next action
    startNextSession();
  }
});
```

### Session Analytics

Track session metrics:

```typescript
const tree = sessionManager.getTree();
const activeSessions = Array.from(tree.values()).filter(
  (node) => node.status === 'active',
);

console.log(`Active sessions: ${activeSessions.length}`);
```

## Future Enhancements

Potential future improvements:

- **Session Persistence**: Save and restore session state
- **Session Sharing**: Collaborate on sessions across instances
- **Session Templates**: Predefined session configurations
- **Advanced Routing**: Route messages to multiple sessions
- **Session Metrics**: Detailed performance and usage statistics

## Conclusion

The interactive session system provides a powerful framework for hierarchical task delegation and user interaction. By following these guidelines and best practices, you can build sophisticated multi-agent workflows while maintaining clarity and control.

For more information, see:

- [Architecture Documentation](architecture.md)
- [Subagent Configuration](cli/configuration.md)
- [BMAD System Guide](BMAD_LOCAL_USAGE_GUIDE.md)
