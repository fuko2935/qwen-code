# Hierarchical Interactive Session System - Implementation Summary

## 🎯 Project Goal

Transform Qwen Code's non-interactive "subagent" system into a **Roo Code-style hierarchical, interactive session system** with:

- ✅ Automatic UI session switching
- ✅ Bidirectional user-agent messaging
- ✅ Hierarchical task delegation (nested sessions)
- ✅ Parent-child context inheritance
- ✅ Return to parent on completion

---

## ✅ Completed Work (Steps 1-4)

### **Step 1: Core Session Type System** ✅

**Status:** COMPLETE & BUILD PASSING

**Files Created:**

```
packages/core/src/session/
├── types.ts                # Session types, events, interfaces
├── SessionContext.ts       # Per-session context with inheritance
├── SessionStack.ts         # Stack management & tree structure
├── SessionManager.ts       # Main orchestrator
└── index.ts               # Exports
```

**Key Features Implemented:**

- `SessionId`, `SessionStatus`, `SessionNode` types
- `SubagentSessionConfig` with all required flags
- Event types: `SESSION_STARTED`, `SESSION_SWITCHED`, `SESSION_COMPLETED`, etc.
- Context inheritance (copy-on-write semantics)
- Stack-based session switching
- maxDepth protection (default: 3)

**Code Highlights:**

```typescript
// Session Configuration
interface SubagentSessionConfig {
  interactive: boolean;         // Enable bidirectional messaging
  maxDepth: number;            // Prevent infinite recursion
  autoSwitch: boolean;         // Auto-switch UI on creation
  inheritContext: boolean;     // Inherit parent context
  allowUserInteraction: boolean; // Allow user messages
}

// Session Node (Tree Structure)
interface SessionNode {
  id: SessionId;
  name: string;
  depth: number;               // 0 = root, 1 = child, etc.
  status: SessionStatus;       // active | paused | completed | aborted
  parentId?: SessionId;
  children: SessionId[];
  subagentName?: string;
  config: SubagentSessionConfig;
}

// Event-Driven Architecture
type SessionEvent =
  | SessionStartedEvent
  | SessionSwitchedEvent
  | SessionCompletedEvent
  | UserMessageToSessionEvent
  | SubagentMessageToUserEvent
  | ...
```

---

### **Step 2: SessionManager Implementation** ✅

**Status:** COMPLETE & BUILD PASSING

**Core APIs:**

```typescript
class SessionManager {
  // Create hierarchical sessions
  async createSession(options: CreateSessionOptions): Promise<SessionId>;

  // Navigation
  switchActiveSession(sessionId: SessionId): void;
  backToParent(): SessionId | undefined;

  // Lifecycle
  pause(sessionId: SessionId): void;
  resume(sessionId: SessionId): void;
  complete(sessionId: SessionId, result?: unknown): void;
  abort(sessionId: SessionId, reason?: string): void;

  // Interactive messaging
  async sendUserMessage(sessionId: SessionId, text: string): Promise<void>;
  bindScope(sessionId: SessionId, scope: SubAgentScope): void;

  // Event subscription
  on(listener: SessionEventListener): void;
  off(listener: SessionEventListener): void;
}
```

**Features:**

- Event-driven architecture (EventEmitter-based)
- Automatic parent return on completion
- Depth tracking and validation
- Context inheritance management
- Scope binding for interactive sessions

---

### **Step 3: Config Integration** ✅

**Status:** COMPLETE & BUILD PASSING

**Changes to `packages/core/src/config/config.ts`:**

```typescript
class Config {
  private sessionManager?: SessionManager;

  // Lazy singleton
  getSessionManager(): SessionManager {
    if (!this.sessionManager) {
      this.sessionManager = new SessionManager();
    }
    return this.sessionManager;
  }

  // Default configuration (backward compatible)
  getDefaultSubagentSessionConfig(): SubagentSessionConfig {
    return {
      interactive: false, // Non-interactive by default
      maxDepth: 3,
      autoSwitch: true,
      inheritContext: true,
      allowUserInteraction: true,
    };
  }
}
```

**Backward Compatibility:**

- ✅ Existing code unaffected
- ✅ SessionManager only used when explicitly accessed
- ✅ Default `interactive: false` maintains current behavior

---

### **Step 4: Event System Extension** ✅

**Status:** COMPLETE & BUILD PASSING

**Changes to `packages/core/src/subagents/subagent-events.ts`:**

**New Event Types:**

```typescript
export type SubAgentEvent =
  | 'start' | 'round_start' | 'tool_call' | ... // existing
  | 'session_started'                // NEW
  | 'session_switched'               // NEW
  | 'session_paused'                 // NEW
  | 'session_resumed'                // NEW
  | 'session_completed'              // NEW
  | 'session_aborted'                // NEW
  | 'user_message_to_session'        // NEW
  | 'subagent_message_to_user';      // NEW

export enum SubAgentEventType {
  // ... existing values
  SESSION_STARTED = 'session_started',
  SESSION_SWITCHED = 'session_switched',
  // ... etc
}
```

**New Interfaces:**

```typescript
export interface SubAgentSessionStartedEvent extends SessionEventPayload {
  node: SessionNode;
}

export interface SubAgentUserMessageEvent extends SessionEventPayload {
  text: string;
}

export interface SubAgentToUserMessageEvent extends SessionEventPayload {
  textChunk?: string; // For streaming
  finalText?: string; // For completion
}
```

---

## 🚧 Remaining Work (Steps 5-18)

### **Critical Path (Must Have)**

#### **Step 5: Interactive SubAgentScope** 🔴 REQUIRED

**File:** `packages/core/src/subagents/subagent.ts`

**What to Add:**

```typescript
class SubAgentScope {
  private messageQueue: string[] = [];
  private processing = false;
  private sessionId?: string;

  // NEW: Queue user messages
  async enqueueUserMessage(text: string): Promise<void> {
    this.messageQueue.push(text);
    if (!this.processing) {
      await this.processNextInteractive();
    }
  }

  // NEW: Interactive execution mode
  async runInteractive(
    context: ContextState,
    options: { sessionId: string; externalSignal?: AbortSignal },
  ): Promise<void> {
    this.sessionId = options.sessionId;
    const chat = await this.createChatObject(context);

    // Bind to SessionManager
    const config = this.runtimeContext;
    config.getSessionManager().bindScope(options.sessionId, this);

    // If task_prompt exists, auto-start
    const taskPrompt = context.get('task_prompt');
    if (taskPrompt) {
      await this.enqueueUserMessage(String(taskPrompt));
    }

    // Keep instance alive for bidirectional messaging
    // Don't return until session is completed
  }

  // NEW: Process queued messages
  private async processNextInteractive(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.messageQueue.length > 0) {
        const text = this.messageQueue.shift()!;
        const messages: Content[] = [{ role: 'user', parts: [{ text }] }];

        // Stream response (reuse existing logic from runNonInteractive)
        // Emit both STREAM_TEXT and SUBAGENT_MESSAGE_TO_USER events
        // Handle tool calls via processFunctionCalls
      }
    } finally {
      this.processing = false;
    }
  }
}
```

**Why Critical:** Without this, interactive sessions cannot function.

---

#### **Step 13: RunConfig Types** 🔴 REQUIRED

**File:** `packages/core/src/subagents/types.ts`

**What to Add:**

```typescript
export interface RunConfig {
  max_turns?: number;
  max_time_minutes?: number;
  allow_nested_tasks?: boolean; // NEW: Enable nested sessions
  interactive?: boolean; // NEW: Interactive mode flag
}
```

**Why Critical:** Types must exist for code to compile.

---

#### **Step 6: Nested Task Support** 🟡 IMPORTANT

**File:** `packages/core/src/subagents/subagent.ts`

**What to Change:**

```typescript
// In runNonInteractive and runInteractive, when building toolsList:

const allowNested = this.runConfig.allow_nested_tasks === true;
const toolRegistry = this.runtimeContext.getToolRegistry();

const decls = toolRegistry
  .getFunctionDeclarations()
  .filter((t) => allowNested || t.name !== TaskTool.Name);

toolsList.push(...decls);
```

**Default Behavior:**

- Non-interactive: `allow_nested_tasks = false` (current behavior)
- Interactive: `allow_nested_tasks = true` (new capability)

---

#### **Step 7: Enhanced TaskTool** 🟡 IMPORTANT

**File:** `packages/core/src/tools/task.ts`

**What to Add:**

```typescript
interface TaskParams {
  description: string;
  prompt: string;
  subagent_type: string;
  interactive?: boolean;        // NEW
  autoSwitch?: boolean;         // NEW
  maxDepth?: number;           // NEW
  inheritContext?: boolean;    // NEW
  allowUserInteraction?: boolean; // NEW
}

class TaskTool {
  async execute(...) {
    const sessionManager = this.config.getSessionManager();
    const defaults = this.config.getDefaultSubagentSessionConfig();

    // Create session
    const sessionId = await sessionManager.createSession({
      name: this.params.subagent_type,
      subagentName: this.params.subagent_type,
      parentId: sessionManager.getActiveSessionId(),
      sessionConfig: {
        interactive: this.params.interactive ?? defaults.interactive,
        maxDepth: this.params.maxDepth ?? defaults.maxDepth,
        autoSwitch: this.params.autoSwitch ?? defaults.autoSwitch,
        inheritContext: this.params.inheritContext ?? defaults.inheritContext,
        allowUserInteraction: this.params.allowUserInteraction ?? defaults.allowUserInteraction,
      },
      taskPrompt: this.params.prompt,
    });

    // Load subagent and create scope
    const subagentConfig = await this.subagentManager.loadSubagent(this.params.subagent_type);
    const scope = await this.subagentManager.createSubagentScope(subagentConfig, this.config);

    if (this.params.interactive) {
      // Interactive: bind and return immediately
      sessionManager.bindScope(sessionId, scope);
      await scope.runInteractive(contextState, { sessionId });
      return {
        llmContent: `Started interactive session: ${sessionId}`,
        returnDisplay: { type: 'task_execution', sessionId, status: 'running' }
      };
    } else {
      // Non-interactive: run and wait
      await scope.runNonInteractive(contextState, signal);
      const result = scope.getFinalText();
      sessionManager.complete(sessionId, result);
      return {
        llmContent: result,
        returnDisplay: { type: 'task_execution', sessionId, status: 'completed', result }
      };
    }
  }
}
```

---

### **UI Layer (Optional but Recommended)**

#### **Step 9: useSessionManagement Hook** 🟢 OPTIONAL

**File:** `packages/cli/src/ui/hooks/useSessionManagement.ts`

**Purpose:** React hook to manage session state in UI

**Key Responsibilities:**

- Subscribe to SessionManager events
- Maintain per-session histories
- Route messages to active session

**Sketch:**

```typescript
export const useSessionManagement = (config: Config) => {
  const sm = useMemo(() => config.getSessionManager(), [config]);
  const [activeId, setActiveId] = useState<string>();
  const [nodes, setNodes] = useState(new Map());
  const [histories, setHistories] = useState(new Map());

  useEffect(() => {
    const handler = (e: SessionEvent) => {
      switch (e.type) {
        case 'SESSION_STARTED':
          setNodes((m) => new Map(m).set(e.sessionId, e.node));
          if (e.node.config.autoSwitch) setActiveId(e.sessionId);
          break;
        case 'SESSION_SWITCHED':
          setActiveId(e.sessionId);
          break;
        // ... handle other events
      }
    };
    sm.on(handler);
    return () => sm.off(handler);
  }, [sm]);

  return {
    activeId,
    nodes,
    histories,
    sendToActiveSession: (text) => sm.sendUserMessage(activeId!, text),
    backToParent: () => sm.backToParent(),
    getBreadcrumb: (id) => sm.getBreadcrumb(id),
  };
};
```

---

#### **Step 10: SessionIndicator Component** 🟢 OPTIONAL

**File:** `packages/cli/src/ui/components/SessionIndicator.tsx`

**Purpose:** Display current session breadcrumb

```tsx
type Props = {
  activePath: string[];
  status: 'active' | 'paused' | 'completed';
  onBack: () => void;
};

export const SessionIndicator = ({ activePath, status, onBack }: Props) => {
  return (
    <Box>
      <Text>
        Session: {activePath.join(' › ')} [{status}]
      </Text>
      <Text dimColor> ⌥← back, /session ls</Text>
    </Box>
  );
};
```

---

#### **Step 11-12: App.tsx & InputPrompt Integration** 🟢 OPTIONAL

**Files:**

- `packages/cli/src/ui/App.tsx`
- `packages/cli/src/ui/components/InputPrompt.tsx`

**Changes:**

1. Import and use `useSessionManagement(config)`
2. Conditionally render `SessionIndicator` when session is active
3. Route input to `sendToActiveSession` when in subtask
4. Add keyboard shortcut: `Alt+Left` → back to parent

---

### **Documentation & Testing**

#### **Step 16: Documentation** 🟡 IMPORTANT

**File:** `docs/subagents.md`

**New Section to Add:**

````markdown
## Interactive Subagents and Sessions

### Overview

Interactive sessions enable hierarchical, bidirectional communication with subagents.

### Starting an Interactive Session

```typescript
// Via TaskTool
taskTool.execute({
  subagent_type: 'bmad-analyst',
  prompt: 'Analyze requirements',
  interactive: true, // Enable interactivity
  autoSwitch: true, // Auto-switch UI
  maxDepth: 3, // Max nesting level
});
```
````

### Session Navigation

- **Automatic switching**: UI switches to new session on creation
- **Return to parent**: Session auto-returns on completion
- **Manual control**: `/session switch <id>`, `/session back`

### Session Tree Example

```
Root (Main Agent)
├── Session 1 (bmad-analyst) [active]
│   ├── Session 1.1 (bmad-researcher)
│   └── Session 1.2 (bmad-validator)
└── Session 2 (bmad-dev)
```

### Keyboard Shortcuts

- `Alt+←`: Return to parent session
- `/session ls`: List all sessions
- `/session abort`: Abort current session

````

---

#### **Step 17: Testing** 🟡 IMPORTANT
**Files to Create:**

1. `packages/core/src/session/__tests__/SessionManager.test.ts`
   - Test createSession, depth limits, autoSwitch
   - Test event emission ordering
   - Test pause/resume/complete

2. `packages/core/src/subagents/__tests__/SubAgentScope.interactive.test.ts`
   - Test enqueueUserMessage
   - Test streaming events
   - Test tool calls in interactive mode

3. **Manual Testing:**
   ```bash
   # Start interactive session
   > Let bmad-analyst analyze the requirements interactively

   # Session switches, user can message
   [Session: bmad-analyst]
   User: What are the key features?
   Analyst: Based on analysis...

   # Nested session
   Analyst calls researcher subagent
   [Session: bmad-analyst › researcher]

   # Auto-return on completion
   [Session: bmad-analyst]
````

---

## 🔧 Quick Implementation Guide

### **Phase 1: Core Functionality (2-4 hours)**

1. ✅ Done: Session type system
2. ✅ Done: SessionManager
3. ✅ Done: Config integration
4. ✅ Done: Event system
5. ⏳ **TODO:** Add RunConfig types (Step 13) - 10 minutes
6. ⏳ **TODO:** Implement runInteractive in SubAgentScope (Step 5) - 2 hours
7. ⏳ **TODO:** Enable nested tasks (Step 6) - 30 minutes
8. ⏳ **TODO:** Enhance TaskTool (Step 7) - 1 hour

### **Phase 2: UI Integration (2-3 hours)**

9. ⏳ **TODO:** useSessionManagement hook - 1 hour
10. ⏳ **TODO:** SessionIndicator component - 30 minutes
11. ⏳ **TODO:** App.tsx integration - 1 hour
12. ⏳ **TODO:** InputPrompt session-aware - 30 minutes

### **Phase 3: Polish (1-2 hours)**

13. ⏳ **TODO:** Documentation - 1 hour
14. ⏳ **TODO:** Basic tests - 1 hour

---

## 📁 File Structure Summary

```
qwen-code/
├── packages/core/src/
│   ├── session/                    ✅ NEW MODULE
│   │   ├── types.ts               ✅ COMPLETE
│   │   ├── SessionContext.ts      ✅ COMPLETE
│   │   ├── SessionStack.ts        ✅ COMPLETE
│   │   ├── SessionManager.ts      ✅ COMPLETE
│   │   └── index.ts               ✅ COMPLETE
│   ├── config/
│   │   └── config.ts              ✅ MODIFIED (SessionManager getter)
│   ├── subagents/
│   │   ├── subagent-events.ts     ✅ MODIFIED (new event types)
│   │   ├── subagent.ts            ⏳ TODO (runInteractive)
│   │   └── types.ts               ⏳ TODO (RunConfig update)
│   └── tools/
│       └── task.ts                ⏳ TODO (session support)
└── packages/cli/src/ui/
    ├── hooks/
    │   └── useSessionManagement.ts ⏳ TODO (new hook)
    ├── components/
    │   └── SessionIndicator.tsx    ⏳ TODO (new component)
    ├── App.tsx                     ⏳ TODO (integration)
    └── components/InputPrompt.tsx  ⏳ TODO (session-aware)
```

---

## 🎯 Testing the Implementation

### **Verify Core Functionality:**

```bash
cd C:\Users\mansi\new\qwen\qwen-code
npm run build --workspace=packages/core
# Should pass ✅
```

### **Test SessionManager API:**

```typescript
import { SessionManager } from '@qwen-code/qwen-code-core';

const sm = new SessionManager();

// Create root session
const rootId = await sm.createSession({
  name: 'root',
  sessionConfig: {
    interactive: true,
    maxDepth: 3,
    autoSwitch: true,
    inheritContext: false,
    allowUserInteraction: true,
  },
});

// Create child session
const childId = await sm.createSession({
  name: 'child',
  parentId: rootId,
  sessionConfig: {
    /* ... */
  },
});

// Verify tree structure
const tree = sm.getTree();
console.log(tree); // Should show parent-child relationship

// Verify breadcrumb
const breadcrumb = sm.getBreadcrumb(childId);
console.log(breadcrumb); // ['root', 'child']
```

---

## 🚀 Next Steps

### **For You (Developer):**

1. **Implement Critical Path** (Steps 5, 6, 7, 13)
   - Start with Step 13 (types) - quickest
   - Then Step 5 (runInteractive) - most complex
   - Then Steps 6-7 (TaskTool & nested tasks)

2. **Test Core Functionality**
   - Create a simple test script
   - Verify session creation, switching, completion
   - Verify event emission

3. **Optional: UI Integration**
   - If time permits, implement Steps 9-12
   - Provides visual feedback for testing

4. **Documentation**
   - Update docs/subagents.md with examples
   - Add inline code comments

### **Code Templates Provided:**

- ✅ All type definitions
- ✅ SessionManager complete implementation
- ✅ Config integration example
- ✅ Event system extension
- ⏳ Partial implementations for remaining steps

---

## 📚 References

### **Key Concepts:**

- **Session Tree:** Hierarchical structure with parent-child relationships
- **Context Inheritance:** Child sessions can inherit parent variables
- **Event-Driven:** UI reacts to session lifecycle events
- **Stack-Based Navigation:** Active session tracked via stack (push/pop)

### **Design Principles:**

1. **Backward Compatibility:** Existing code unaffected (interactive=false by default)
2. **Event-Driven UI:** Core emits events, UI listens and renders
3. **Lazy Initialization:** SessionManager only created when needed
4. **Fail-Safe:** Graceful degradation if UI not subscribed

---

## 🆘 Troubleshooting

### **Build Errors:**

```bash
# If types are missing:
npm run build --workspace=packages/core

# If circular dependencies:
# Check imports in session/types.ts (use dynamic imports)
```

### **Runtime Errors:**

```typescript
// If SessionManager not initialized:
const sm = config.getSessionManager(); // Will auto-initialize

// If session not found:
if (!sm.hasSession(sessionId)) {
  console.error('Session not found');
}
```

---

## 📊 Progress Tracking

- [x] Step 1: Core session type system ✅
- [x] Step 2: SessionManager implementation ✅
- [x] Step 3: Config integration ✅
- [x] Step 4: Event system extension ✅
- [ ] Step 5: Interactive SubAgentScope 🔴 CRITICAL
- [ ] Step 6: Nested task support 🟡
- [ ] Step 7: Enhanced TaskTool 🟡
- [ ] Step 8: Event bridging 🟢
- [ ] Step 9: useSessionManagement hook 🟢
- [ ] Step 10: SessionIndicator component 🟢
- [ ] Step 11: App.tsx integration 🟢
- [ ] Step 12: Session slash commands 🟢
- [ ] Step 13: RunConfig types 🔴 CRITICAL
- [ ] Step 14: Event propagation 🟢
- [ ] Step 15: Telemetry updates 🟢
- [ ] Step 16: Documentation 🟡
- [ ] Step 17: Testing 🟡
- [ ] Step 18: Rollout & guards 🟢

**Legend:**

- 🔴 CRITICAL: Must have for basic functionality
- 🟡 IMPORTANT: Highly recommended
- 🟢 OPTIONAL: Nice to have

---

## 🎉 Conclusion

**What's Working:**

- ✅ Complete session type system
- ✅ Full-featured SessionManager
- ✅ Event-driven architecture
- ✅ Config integration
- ✅ Build passing

**What's Needed:**

- 🔴 Interactive mode implementation (SubAgentScope)
- 🔴 Type updates (RunConfig)
- 🟡 TaskTool enhancements
- 🟡 UI integration (optional but recommended)

**Estimated Time to Complete:**

- Critical path: 3-4 hours
- With UI: 6-8 hours
- With tests & docs: 8-10 hours

The foundation is solid and ready for the next phase! 🚀
