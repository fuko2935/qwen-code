# 🎯 Tam ve Eksiksiz Interactive Session Sistemi Implementasyon Rehberi

> **Tüm kalan adımlar için EKSIKSIZ kod örnekleri**  
> **Her adım için TAM implementasyon detayları**  
> **Kopyala-yapıştır hazır kodlar**

---

## 📋 İçindekiler

1. [Hızlı Başlangıç](#hızlı-başlangıç)
2. [🔴 Kritik Adımlar (Zorunlu)](#kritik-adımlar)
   - [Adım 13: RunConfig Tipleri](#adım-13-runconfig-tipleri)
   - [Adım 5: Interactive SubAgentScope](#adım-5-interactive-subagentscope)
   - [Adım 6: Nested Task Desteği](#adım-6-nested-task-desteği)
   - [Adım 7: Enhanced TaskTool](#adım-7-enhanced-tasktool)
3. [🟢 UI Entegrasyonu (İsteğe Bağlı)](#ui-entegrasyonu)
   - [Adım 8: Event Bridging](#adım-8-event-bridging)
   - [Adım 9: useSessionManagement Hook](#adım-9-usesessionmanagement-hook)
   - [Adım 10: SessionIndicator Component](#adım-10-sessionindicator-component)
   - [Adım 11: App.tsx Entegrasyonu](#adım-11-apptsx-entegrasyonu)
   - [Adım 12: Session Slash Commands](#adım-12-session-slash-commands)
4. [🟡 Test ve Dokümantasyon](#test-ve-dokümantasyon)
   - [Adım 16: Dokümantasyon](#adım-16-dokümantasyon)
   - [Adım 17: Test Yazımı](#adım-17-test-yazımı)
5. [Tam Test Senaryosu](#tam-test-senaryosu)
6. [Sorun Giderme](#sorun-giderme)

---

## 🚀 Hızlı Başlangıç

### ✅ Tamamlananlar (Build Passing)

| Bileşen            | Dosya                                            | Durum |
| ------------------ | ------------------------------------------------ | ----- |
| Session Types      | `packages/core/src/session/types.ts`             | ✅    |
| SessionContext     | `packages/core/src/session/SessionContext.ts`    | ✅    |
| SessionStack       | `packages/core/src/session/SessionStack.ts`      | ✅    |
| SessionManager     | `packages/core/src/session/SessionManager.ts`    | ✅    |
| Config Integration | `packages/core/src/config/config.ts`             | ✅    |
| Event System       | `packages/core/src/subagents/subagent-events.ts` | ✅    |

### ⏳ Yapılacaklar Öncelik Sırası

**Kritik Yol (3-4 saat):**

```
1. Adım 13 (10 dk)  → RunConfig tipleri
2. Adım 5  (2 saat) → Interactive mode
3. Adım 7  (1 saat) → TaskTool enhancements
4. Adım 6  (30 dk)  → Nested tasks
```

**UI Katmanı (2-3 saat):**

```
5. Adım 9  (1 saat) → useSessionManagement hook
6. Adım 10 (30 dk)  → SessionIndicator component
7. Adım 11 (1 saat) → App.tsx integration
```

**Polish (1-2 saat):**

```
8. Adım 16 (1 saat) → Documentation
9. Adım 17 (1 saat) → Tests
```

---

## 🔴 Kritik Adımlar

---

## ADIM 13: RunConfig Tipleri 🔴

**Süre:** 10 dakika  
**Dosya:** `packages/core/src/subagents/types.ts`  
**Satırlar:** 252-260

### 📝 Yapılacak Değişiklik

**Mevcut Kod (satır 252-260):**

```typescript
export interface RunConfig {
  /** The maximum execution time for the subagent in minutes. */
  max_time_minutes?: number;
  /**
   * The maximum number of conversational turns (a user message + model response)
   * before the execution is terminated. Helps prevent infinite loops.
   */
  max_turns?: number;
}
```

**YENİ Kod:**

```typescript
export interface RunConfig {
  /** The maximum execution time for the subagent in minutes. */
  max_time_minutes?: number;
  /**
   * The maximum number of conversational turns (a user message + model response)
   * before the execution is terminated. Helps prevent infinite loops.
   */
  max_turns?: number;
  /**
   * Whether to allow nested task delegation via the Task tool.
   * When true, subagents can create their own child sessions.
   * @default false for non-interactive, true for interactive
   */
  allow_nested_tasks?: boolean;
  /**
   * Whether to run the subagent in interactive mode.
   * Interactive mode enables bidirectional messaging between user and subagent.
   * @default false
   */
  interactive?: boolean;
}
```

### 🔧 Adımlar

1. `packages/core/src/subagents/types.ts` dosyasını aç
2. Satır 252'deki `RunConfig` interface'ine iki yeni alan ekle:
   - `allow_nested_tasks?: boolean;`
   - `interactive?: boolean;`
3. Kaydet
4. Build kontrolü: `npm run build --workspace=packages/core`

✅ **Beklenen Sonuç:** Build hatasız geçmeli

---

## ADIM 5: Interactive SubAgentScope 🔴

**Süre:** 2 saat  
**Dosya:** `packages/core/src/subagents/subagent.ts`  
**Karmaşıklık:** Yüksek

### 📦 Yapılacaklar Özeti

1. **Message queue** ekleme (bidirectional messaging için)
2. **`runInteractive()` metodu** (interactive execution loop)
3. **`enqueueUserMessage()` metodu** (kullanıcı mesajlarını kuyruğa alma)
4. **`processNextInteractive()` metodu** (kuyruktan mesaj işleme)
5. **Session binding** (SessionManager'a bağlanma)

### 📝 Tam Kod İmplementasyonu

#### 1. Sınıf Değişkenleri Ekleme

**Lokasyon:** `SubAgentScope` sınıfının en başına (satır ~186 civarı)

**EKLE:**

```typescript
export class SubAgentScope {
  // ... mevcut değişkenler ...

  // NEW: Interactive mode support
  private messageQueue: string[] = [];
  private processing = false;
  private sessionId?: string;
  private interactiveAbortController?: AbortController;
  private interactiveChat?: GeminiChat;
```

#### 2. `runInteractive()` Metodu Ekleme

**Lokasyon:** `runNonInteractive()` metodundan sonra (satır ~500 sonrası)

**EKLE:**

```typescript
  /**
   * Runs the subagent in interactive mode.
   * This method enables bidirectional messaging between user and subagent.
   * The subagent stays alive and processes messages from a queue until the session is closed.
   *
   * @param context - The current context state containing variables for prompt templating.
   * @param options - Options including sessionId and optional abort signal.
   * @returns A promise that resolves when the session is terminated.
   */
  async runInteractive(
    context: ContextState,
    options: { sessionId: string; externalSignal?: AbortSignal },
  ): Promise<void> {
    this.sessionId = options.sessionId;
    this.interactiveAbortController = new AbortController();

    // Set up external abort handling
    const onAbort = () => this.interactiveAbortController?.abort();
    if (options.externalSignal) {
      if (options.externalSignal.aborted) {
        this.interactiveAbortController.abort();
        this.terminateMode = SubagentTerminateMode.CANCELLED;
        return;
      }
      options.externalSignal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      // Create chat object
      this.interactiveChat = await this.createChatObject(context);
      if (!this.interactiveChat) {
        this.terminateMode = SubagentTerminateMode.ERROR;
        return;
      }

      // Bind to SessionManager
      const sessionManager = this.runtimeContext.getSessionManager();
      sessionManager.bindScope(this.sessionId, this);

      // Initialize stats
      const startTime = Date.now();
      this.executionStats.startTimeMs = startTime;
      this.stats.start(startTime);

      // Emit start event
      this.eventEmitter?.emit(SubAgentEventType.START, {
        subagentId: this.subagentId,
        name: this.name,
        model: this.modelConfig.model,
        tools: (this.toolConfig?.tools || ['*']).map((t) =>
          typeof t === 'string' ? t : t.name,
        ),
        timestamp: Date.now(),
      } as SubAgentStartEvent);

      // If task_prompt exists, auto-enqueue first message
      const taskPrompt = context.get('task_prompt');
      if (taskPrompt) {
        await this.enqueueUserMessage(String(taskPrompt));
      }

      // Wait until aborted (interactive sessions stay alive)
      await new Promise<void>((resolve) => {
        this.interactiveAbortController!.signal.addEventListener(
          'abort',
          () => resolve(),
          { once: true },
        );
      });

      this.terminateMode = SubagentTerminateMode.CANCELLED;
    } catch (error) {
      console.error('Error during interactive subagent execution:', error);
      this.terminateMode = SubagentTerminateMode.ERROR;
      this.eventEmitter?.emit(SubAgentEventType.ERROR, {
        subagentId: this.subagentId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      } as SubAgentErrorEvent);
      throw error;
    } finally {
      if (options.externalSignal) {
        options.externalSignal.removeEventListener('abort', onAbort);
      }
      this.executionStats.totalDurationMs = Date.now() - this.executionStats.startTimeMs;

      const summary = this.stats.getSummary(Date.now());
      this.eventEmitter?.emit(SubAgentEventType.FINISH, {
        subagentId: this.subagentId,
        finalText: this.finalText,
        terminateReason: this.terminateMode,
        stats: summary,
        timestamp: Date.now(),
      } as SubAgentFinishEvent);

      // Log telemetry
      const endEvent = new SubagentExecutionEvent(this.name, 'completed');
      endEvent.terminateReason = this.terminateMode;
      endEvent.durationMs = this.executionStats.totalDurationMs;
      logSubagentExecution(this.runtimeContext, endEvent);
    }
  }
```

#### 3. `enqueueUserMessage()` Metodu Ekleme

**Lokasyon:** `runInteractive()` metodundan sonra

**EKLE:**

```typescript
  /**
   * Enqueues a user message for processing in interactive mode.
   * If not currently processing, starts processing immediately.
   *
   * @param text - The user message text to enqueue.
   */
  async enqueueUserMessage(text: string): Promise<void> {
    if (!this.sessionId) {
      console.warn('enqueueUserMessage called but no sessionId set (not in interactive mode)');
      return;
    }

    this.messageQueue.push(text);

    // Emit user message event
    this.eventEmitter?.emit('user_message_to_session' as SubAgentEventType, {
      sessionId: this.sessionId,
      text,
      timestamp: Date.now(),
    });

    // Start processing if not already processing
    if (!this.processing) {
      void this.processNextInteractive();
    }
  }
```

#### 4. `processNextInteractive()` Metodu Ekleme

**Lokasyon:** `enqueueUserMessage()` metodundan sonra

**EKLE:**

```typescript
  /**
   * Processes queued messages one at a time in interactive mode.
   * This method runs in a loop until the queue is empty.
   */
  private async processNextInteractive(): Promise<void> {
    if (this.processing || !this.interactiveChat) {
      return;
    }

    this.processing = true;

    try {
      while (this.messageQueue.length > 0) {
        // Check abort signal
        if (this.interactiveAbortController?.signal.aborted) {
          break;
        }

        const text = this.messageQueue.shift()!;
        const toolRegistry = this.runtimeContext.getToolRegistry();

        // Prepare tools (same logic as runNonInteractive)
        const toolsList: FunctionDeclaration[] = [];
        if (this.toolConfig) {
          const asStrings = this.toolConfig.tools.filter(
            (t): t is string => typeof t === 'string',
          );
          const hasWildcard = asStrings.includes('*');
          const onlyInlineDecls = this.toolConfig.tools.filter(
            (t): t is FunctionDeclaration => typeof t !== 'string',
          );

          if (hasWildcard || asStrings.length === 0) {
            // Check if nested tasks are allowed
            const allowNested = this.runConfig.allow_nested_tasks === true;
            toolsList.push(
              ...toolRegistry
                .getFunctionDeclarations()
                .filter((t) => allowNested || t.name !== TaskTool.Name),
            );
          } else {
            toolsList.push(
              ...toolRegistry.getFunctionDeclarationsFiltered(asStrings),
            );
          }
          toolsList.push(...onlyInlineDecls);
        } else {
          // Default: all tools except Task
          const allowNested = this.runConfig.allow_nested_tasks === true;
          toolsList.push(
            ...toolRegistry
              .getFunctionDeclarations()
              .filter((t) => allowNested || t.name !== TaskTool.Name),
          );
        }

        // Send message
        const currentMessages: Content[] = [
          { role: 'user', parts: [{ text }] },
        ];

        const turnCounter = ++this.executionStats.rounds;
        const promptId = `${this.runtimeContext.getSessionId()}#${this.subagentId}#${turnCounter}`;

        this.eventEmitter?.emit(SubAgentEventType.ROUND_START, {
          subagentId: this.subagentId,
          round: turnCounter,
          promptId,
          timestamp: Date.now(),
        } as SubAgentRoundEvent);

        const messageParams = {
          message: currentMessages[0]?.parts || [],
          config: {
            abortSignal: this.interactiveAbortController!.signal,
            tools: [{ functionDeclarations: toolsList }],
          },
        };

        const responseStream = await this.interactiveChat.sendMessageStream(
          messageParams,
          promptId,
        );

        // Process stream
        const functionCalls: FunctionCall[] = [];
        let roundText = '';
        let lastUsage: GenerateContentResponseUsageMetadata | undefined = undefined;

        for await (const streamEvent of responseStream) {
          if (this.interactiveAbortController?.signal.aborted) {
            break;
          }

          if (streamEvent.type === 'retry') {
            continue;
          }

          if (streamEvent.type === 'chunk') {
            const resp = streamEvent.value;
            if (resp.functionCalls) functionCalls.push(...resp.functionCalls);

            const content = resp.candidates?.[0]?.content;
            const parts = content?.parts || [];

            for (const p of parts) {
              const txt = (p as Part & { text?: string }).text;
              if (txt) {
                roundText += txt;

                // Emit both stream text event and subagent-to-user message event
                this.eventEmitter?.emit(SubAgentEventType.STREAM_TEXT, {
                  subagentId: this.subagentId,
                  round: turnCounter,
                  text: txt,
                  timestamp: Date.now(),
                } as SubAgentStreamTextEvent);

                this.eventEmitter?.emit('subagent_message_to_user' as SubAgentEventType, {
                  sessionId: this.sessionId,
                  textChunk: txt,
                  timestamp: Date.now(),
                });
              }
            }

            if (resp.usageMetadata) lastUsage = resp.usageMetadata;
          }
        }

        // Update token usage
        if (lastUsage) {
          const inTok = Number(lastUsage.promptTokenCount || 0);
          const outTok = Number(lastUsage.candidatesTokenCount || 0);
          if (isFinite(inTok) || isFinite(outTok)) {
            this.stats.recordTokens(
              isFinite(inTok) ? inTok : 0,
              isFinite(outTok) ? outTok : 0,
            );
            this.executionStats.inputTokens =
              (this.executionStats.inputTokens || 0) + (isFinite(inTok) ? inTok : 0);
            this.executionStats.outputTokens =
              (this.executionStats.outputTokens || 0) + (isFinite(outTok) ? outTok : 0);
            this.executionStats.totalTokens =
              (this.executionStats.inputTokens || 0) +
              (this.executionStats.outputTokens || 0);
            this.executionStats.estimatedCost =
              (this.executionStats.inputTokens || 0) * 3e-5 +
              (this.executionStats.outputTokens || 0) * 6e-5;
          }
        }

        // Handle function calls if any
        if (functionCalls.length > 0) {
          await this.processFunctionCalls(
            functionCalls,
            this.interactiveAbortController!,
            promptId,
            turnCounter,
          );
          // Note: In interactive mode, we don't auto-send results back to chat.
          // Results are handled by processFunctionCalls and may trigger new messages.
        }

        // Emit subagent final message for this turn if text was generated
        if (roundText && roundText.trim().length > 0) {
          this.finalText = roundText.trim();
          this.eventEmitter?.emit('subagent_message_to_user' as SubAgentEventType, {
            sessionId: this.sessionId,
            finalText: this.finalText,
            timestamp: Date.now(),
          });
        }

        this.eventEmitter?.emit(SubAgentEventType.ROUND_END, {
          subagentId: this.subagentId,
          round: turnCounter,
          promptId,
          timestamp: Date.now(),
        } as SubAgentRoundEvent);
      }
    } catch (error) {
      console.error('Error during interactive message processing:', error);
      this.eventEmitter?.emit(SubAgentEventType.ERROR, {
        subagentId: this.subagentId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      } as SubAgentErrorEvent);
    } finally {
      this.processing = false;
    }
  }
```

### ✅ Doğrulama

1. **Tip kontrolü:**
   ```bash
   npm run build --workspace=packages/core
   ```
2. **Beklenen çıktı:** Hatasız build

---

## ADIM 6: Nested Task Desteği 🔴

**Süre:** 30 dakika  
**Dosya:** `packages/core/src/subagents/subagent.ts`  
**Satırlar:** ~282-314 (runNonInteractive) ve ~processNextInteractive

### 📝 Yapılacak Değişiklik

Hem `runNonInteractive()` hem de `processNextInteractive()` metodlarında tool listesi oluştururken TaskTool'u filtreleme mantığını ekle.

#### Değişiklik 1: `runNonInteractive()` içinde

**Lokasyon:** Satır ~295-314

**MEVCUT KOD:**

```typescript
      if (hasWildcard || asStrings.length === 0) {
        toolsList.push(
          ...toolRegistry
            .getFunctionDeclarations()
            .filter((t) => t.name !== TaskTool.Name),
        );
      } else {
```

**YENİ KOD:**

```typescript
      if (hasWildcard || asStrings.length === 0) {
        // Check if nested tasks are allowed
        const allowNested = this.runConfig.allow_nested_tasks === true;
        toolsList.push(
          ...toolRegistry
            .getFunctionDeclarations()
            .filter((t) => allowNested || t.name !== TaskTool.Name),
        );
      } else {
```

**VE AYRICA:**

**Lokasyon:** Satır ~307-314 (else bloğunda)

**MEVCUT KOD:**

```typescript
    } else {
      // Inherit all available tools by default when not specified.
      toolsList.push(
        ...toolRegistry
          .getFunctionDeclarations()
          .filter((t) => t.name !== TaskTool.Name),
      );
    }
```

**YENİ KOD:**

```typescript
    } else {
      // Inherit all available tools by default when not specified.
      const allowNested = this.runConfig.allow_nested_tasks === true;
      toolsList.push(
        ...toolRegistry
          .getFunctionDeclarations()
          .filter((t) => allowNested || t.name !== TaskTool.Name),
      );
    }
```

#### Değişiklik 2: `processNextInteractive()` içinde

**Lokasyon:** Yukarıda eklediğimiz `processNextInteractive()` metodunda zaten bu mantık var (satır içinde `allowNested` kontrolü yapıyoruz), ekstra değişiklik gerekmez.

### ✅ Doğrulama

```bash
npm run build --workspace=packages/core
```

---

## ADIM 7: Enhanced TaskTool 🔴

**Süre:** 1 saat  
**Dosya:** `packages/core/src/tools/task.ts`  
**Karmaşıklık:** Orta

### 📦 Yapılacaklar

1. `TaskParams` interface'ine yeni alanlar ekle
2. `TaskTool` schema'sını güncelle
3. `TaskToolInvocation.execute()` metodunu session-aware yap
4. Interactive ve non-interactive mode ayırımı yap

### 📝 Tam Kod İmplementasyonu

#### 1. TaskParams Interface Güncelleme

**Lokasyon:** Satır 38-42

**MEVCUT KOD:**

```typescript
export interface TaskParams {
  description: string;
  prompt: string;
  subagent_type: string;
}
```

**YENİ KOD:**

```typescript
export interface TaskParams {
  description: string;
  prompt: string;
  subagent_type: string;
  // NEW: Session configuration parameters
  interactive?: boolean;
  autoSwitch?: boolean;
  maxDepth?: number;
  inheritContext?: boolean;
  allowUserInteraction?: boolean;
}
```

#### 2. Schema Güncelleme

**Lokasyon:** `TaskTool` constructor içinde, satır ~56-76

**MEVCUT properties (satır ~59-72):**

```typescript
      properties: {
        description: {
          type: 'string',
          description: 'A short (3-5 word) description of the task',
        },
        prompt: {
          type: 'string',
          description: 'The task for the agent to perform',
        },
        subagent_type: {
          type: 'string',
          description: 'The type of specialized agent to use for this task',
        },
      },
```

**YENİ properties:**

```typescript
      properties: {
        description: {
          type: 'string',
          description: 'A short (3-5 word) description of the task',
        },
        prompt: {
          type: 'string',
          description: 'The task for the agent to perform',
        },
        subagent_type: {
          type: 'string',
          description: 'The type of specialized agent to use for this task',
        },
        interactive: {
          type: 'boolean',
          description: 'Run in interactive mode with bidirectional messaging. Default: false',
        },
        autoSwitch: {
          type: 'boolean',
          description: 'Automatically switch UI to new session. Default: true',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum nesting depth for this session. Default: 3',
        },
        inheritContext: {
          type: 'boolean',
          description: 'Inherit context from parent session. Default: true',
        },
        allowUserInteraction: {
          type: 'boolean',
          description: 'Allow user to send messages to this session. Default: true',
        },
      },
```

#### 3. Execute Metodunu Session-Aware Yapma

**Lokasyon:** `TaskToolInvocation` sınıfında, `execute()` metodu

**NOT:** Mevcut execute metodunu bulup değiştirmek yerine, yeni bir implementasyon yazıyoruz.

**Tam `execute()` metodu (satır ~420 civarından itibaren mevcut execute metodunu BUL ve DEĞİŞTİR):**

```typescript
  override async execute(
    updateOutput?: (output: ToolResultDisplay) => void,
    confirm?: (details: ToolCallConfirmationDetails) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    // Initialize display state
    this.currentDisplay = {
      type: 'task_execution',
      name: this.params.subagent_type,
      description: this.params.description,
      status: 'pending',
      toolCalls: [],
    };
    this.currentToolCalls = this.currentDisplay.toolCalls!;

    // Setup event listeners for real-time updates
    this.setupEventListeners(updateOutput);

    try {
      // Get SessionManager and defaults from config
      const sessionManager = this.config.getSessionManager();
      const defaults = this.config.getDefaultSubagentSessionConfig();

      // Determine parent session (if any)
      const parentSessionId = sessionManager.getActiveSessionId();

      // Create session configuration
      const sessionConfig: SubagentSessionConfig = {
        interactive: this.params.interactive ?? defaults.interactive,
        maxDepth: this.params.maxDepth ?? defaults.maxDepth,
        autoSwitch: this.params.autoSwitch ?? defaults.autoSwitch,
        inheritContext: this.params.inheritContext ?? defaults.inheritContext,
        allowUserInteraction: this.params.allowUserInteraction ?? defaults.allowUserInteraction,
      };

      // Create new session
      const sessionId = await sessionManager.createSession({
        name: this.params.subagent_type,
        subagentName: this.params.subagent_type,
        parentId: parentSessionId,
        sessionConfig,
        taskPrompt: this.params.prompt,
      });

      // Update display with session info
      this.updateDisplay(
        {
          sessionId,
          status: 'initializing',
        },
        updateOutput,
      );

      // Load subagent configuration
      const subagentConfig = await this.subagentManager.loadSubagent(
        this.params.subagent_type,
      );

      // Create subagent scope
      const scope = await this.subagentManager.createSubagentScope(
        subagentConfig,
        this.config,
        this.eventEmitter,
      );

      // Prepare context
      const contextState = new ContextState();
      contextState.set('task_prompt', this.params.prompt);
      contextState.set('task_description', this.params.description);

      // Copy parent context if inheritance is enabled
      if (sessionConfig.inheritContext && parentSessionId) {
        const parentContext = sessionManager.getContext(parentSessionId);
        if (parentContext) {
          for (const key of parentContext.get_keys()) {
            if (!contextState.get(key)) {
              contextState.set(key, parentContext.get(key));
            }
          }
        }
      }

      // Execute based on mode
      if (sessionConfig.interactive) {
        // INTERACTIVE MODE

        // Bind scope to session
        sessionManager.bindScope(sessionId, scope);

        // Start interactive execution (non-blocking)
        void scope.runInteractive(contextState, {
          sessionId,
          externalSignal: signal,
        });

        // Update display
        this.updateDisplay(
          {
            status: 'running',
          },
          updateOutput,
        );

        // Return immediately with session info
        return {
          llmContent: `Started interactive session '${this.params.subagent_type}' (ID: ${sessionId})`,
          returnDisplay: {
            ...this.currentDisplay,
            sessionId,
            status: 'running',
          },
        };
      } else {
        // NON-INTERACTIVE MODE

        this.updateDisplay(
          {
            status: 'running',
          },
          updateOutput,
        );

        // Run and wait for completion
        await scope.runNonInteractive(contextState, signal);

        // Get result
        const result = scope.getFinalText();
        const stats = scope.getStatsSummary();

        // Complete session
        sessionManager.complete(sessionId, result);

        // Update display
        this.updateDisplay(
          {
            status: 'completed',
            terminateReason: scope.getTerminateMode(),
          },
          updateOutput,
        );

        // Return result
        return {
          llmContent: result || 'Task completed with no output',
          returnDisplay: {
            ...this.currentDisplay,
            sessionId,
            status: 'completed',
            result,
            stats,
          },
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.updateDisplay(
        {
          status: 'failed',
          terminateReason: errorMessage,
        },
        updateOutput,
      );

      return {
        error: errorMessage,
        llmContent: `Task execution failed: ${errorMessage}`,
        returnDisplay: this.currentDisplay!,
      };
    }
  }
```

### ✅ Doğrulama

```bash
npm run build --workspace=packages/core
```

---

## 🟢 UI Entegrasyonu

---

## ADIM 8: Event Bridging 🟢

**Süre:** 30 dakika  
**Dosya:** `packages/core/src/config/config.ts`

### 📝 Yapılacak

SessionManager olaylarını mevcut UI event emitter'a yönlendirme mekanizması ekle.

**Lokasyon:** `Config` sınıfında `getSessionManager()` metodu

**MEVCUT KOD (satır ~1100 civarı):**

```typescript
  getSessionManager(): SessionManager {
    if (!this.sessionManager) {
      this.sessionManager = new SessionManager();
    }
    return this.sessionManager;
  }
```

**YENİ KOD:**

```typescript
  getSessionManager(): SessionManager {
    if (!this.sessionManager) {
      this.sessionManager = new SessionManager();

      // Bridge session events to UI event emitter
      const uiEmitter = this.getEventEmitter();
      if (uiEmitter) {
        this.sessionManager.on((event) => {
          // Forward all session events to UI
          uiEmitter.emit(event.type, event);
        });
      }
    }
    return this.sessionManager;
  }
```

---

## ADIM 9: useSessionManagement Hook 🟢

**Süre:** 1 saat  
**Dosya:** `packages/cli/src/ui/hooks/useSessionManagement.ts` (YENİ)

### 📝 Tam Kod

**YENİ DOSYA OLUŞTUR:** `packages/cli/src/ui/hooks/useSessionManagement.ts`

```typescript
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Config } from '@qwen-code/qwen-code-core';
import type {
  SessionEvent,
  SessionId,
  SessionNode,
  SessionStatus,
} from '@qwen-code/qwen-code-core/session';
import type { Content } from '@google/genai';

interface SessionHistory {
  sessionId: SessionId;
  messages: Content[];
}

interface UseSessionManagementReturn {
  // State
  activeSessionId?: SessionId;
  nodes: Map<SessionId, SessionNode>;
  histories: Map<SessionId, Content[]>;

  // Actions
  sendToActiveSession: (text: string) => Promise<void>;
  backToParent: () => SessionId | undefined;
  switchToSession: (sessionId: SessionId) => void;

  // Queries
  getBreadcrumb: (sessionId?: SessionId) => string[];
  getActiveNode: () => SessionNode | undefined;
  getActiveStatus: () => SessionStatus | undefined;
  isInSession: () => boolean;
}

/**
 * React hook for managing session state and interactions.
 * Subscribes to SessionManager events and provides UI-friendly APIs.
 */
export function useSessionManagement(
  config: Config,
): UseSessionManagementReturn {
  const sessionManager = useMemo(() => config.getSessionManager(), [config]);

  const [activeSessionId, setActiveSessionId] = useState<SessionId | undefined>(
    sessionManager.getActiveSessionId(),
  );

  const [nodes, setNodes] = useState<Map<SessionId, SessionNode>>(
    new Map(sessionManager.getTree()),
  );

  const [histories, setHistories] = useState<Map<SessionId, Content[]>>(
    new Map(),
  );

  // Subscribe to session events
  useEffect(() => {
    const handleEvent = (event: SessionEvent) => {
      switch (event.type) {
        case 'SESSION_STARTED':
          setNodes((prev) => {
            const next = new Map(prev);
            next.set(event.sessionId, event.node);
            return next;
          });
          setHistories((prev) => {
            const next = new Map(prev);
            next.set(event.sessionId, []);
            return next;
          });
          if (event.node.config.autoSwitch) {
            setActiveSessionId(event.sessionId);
          }
          break;

        case 'SESSION_SWITCHED':
          setActiveSessionId(event.sessionId);
          break;

        case 'SESSION_PAUSED':
        case 'SESSION_RESUMED':
        case 'SESSION_COMPLETED':
        case 'SESSION_ABORTED':
          // Update node status
          setNodes((prev) => {
            const next = new Map(prev);
            const node = next.get(event.sessionId);
            if (node) {
              next.set(event.sessionId, {
                ...node,
                status:
                  event.type === 'SESSION_COMPLETED'
                    ? 'completed'
                    : event.type === 'SESSION_ABORTED'
                      ? 'aborted'
                      : event.type === 'SESSION_PAUSED'
                        ? 'paused'
                        : 'active',
              });
            }
            return next;
          });
          break;

        case 'USER_MESSAGE_TO_SESSION':
          // Add user message to history
          setHistories((prev) => {
            const next = new Map(prev);
            const history = next.get(event.sessionId) || [];
            next.set(event.sessionId, [
              ...history,
              {
                role: 'user',
                parts: [{ text: event.text }],
              } as Content,
            ]);
            return next;
          });
          break;

        case 'SUBAGENT_MESSAGE_TO_USER':
          // Add or update subagent message in history
          setHistories((prev) => {
            const next = new Map(prev);
            const history = next.get(event.sessionId) || [];

            // If we have a textChunk, append to last model message or create new one
            if (event.textChunk) {
              const lastMsg = history[history.length - 1];
              if (lastMsg && lastMsg.role === 'model') {
                // Append to existing
                const parts = lastMsg.parts || [];
                const lastPart = parts[parts.length - 1];
                if (lastPart && 'text' in lastPart) {
                  (lastPart as { text: string }).text += event.textChunk;
                } else {
                  parts.push({ text: event.textChunk });
                }
              } else {
                // Create new model message
                history.push({
                  role: 'model',
                  parts: [{ text: event.textChunk }],
                });
              }
            }

            // If we have finalText, ensure it's set
            if (event.finalText) {
              const lastMsg = history[history.length - 1];
              if (lastMsg && lastMsg.role === 'model') {
                lastMsg.parts = [{ text: event.finalText }];
              } else {
                history.push({
                  role: 'model',
                  parts: [{ text: event.finalText }],
                });
              }
            }

            next.set(event.sessionId, [...history]);
            return next;
          });
          break;
      }
    };

    sessionManager.on(handleEvent);
    return () => sessionManager.off(handleEvent);
  }, [sessionManager]);

  // Actions
  const sendToActiveSession = useCallback(
    async (text: string) => {
      if (!activeSessionId) {
        throw new Error('No active session');
      }
      await sessionManager.sendUserMessage(activeSessionId, text);
    },
    [sessionManager, activeSessionId],
  );

  const backToParent = useCallback(() => {
    return sessionManager.backToParent();
  }, [sessionManager]);

  const switchToSession = useCallback(
    (sessionId: SessionId) => {
      sessionManager.switchActiveSession(sessionId);
    },
    [sessionManager],
  );

  // Queries
  const getBreadcrumb = useCallback(
    (sessionId?: SessionId) => {
      return sessionManager.getBreadcrumb(sessionId || activeSessionId);
    },
    [sessionManager, activeSessionId],
  );

  const getActiveNode = useCallback(() => {
    if (!activeSessionId) return undefined;
    return nodes.get(activeSessionId);
  }, [activeSessionId, nodes]);

  const getActiveStatus = useCallback(() => {
    return getActiveNode()?.status;
  }, [getActiveNode]);

  const isInSession = useCallback(() => {
    return activeSessionId !== undefined;
  }, [activeSessionId]);

  return {
    activeSessionId,
    nodes,
    histories,
    sendToActiveSession,
    backToParent,
    switchToSession,
    getBreadcrumb,
    getActiveNode,
    getActiveStatus,
    isInSession,
  };
}
```

---

## ADIM 10: SessionIndicator Component 🟢

**Süre:** 30 dakika  
**Dosya:** `packages/cli/src/ui/components/SessionIndicator.tsx` (YENİ)

### 📝 Tam Kod

**YENİ DOSYA OLUŞTUR:** `packages/cli/src/ui/components/SessionIndicator.tsx`

```typescript
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SessionStatus } from '@qwen-code/qwen-code-core/session';

interface SessionIndicatorProps {
  /** Session breadcrumb path (e.g., ['root', 'analyzer', 'researcher']) */
  activePath: string[];

  /** Current session status */
  status: SessionStatus;

  /** Callback when user wants to go back to parent */
  onBack: () => void;

  /** Optional: show keyboard shortcuts */
  showShortcuts?: boolean;
}

/**
 * Displays current session breadcrumb and status in the UI.
 * Shows user their position in the session hierarchy.
 */
export const SessionIndicator: React.FC<SessionIndicatorProps> = ({
  activePath,
  status,
  onBack,
  showShortcuts = true,
}) => {
  const getStatusColor = (status: SessionStatus): string => {
    switch (status) {
      case 'active':
        return 'green';
      case 'paused':
        return 'yellow';
      case 'completed':
        return 'blue';
      case 'aborted':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusSymbol = (status: SessionStatus): string => {
    switch (status) {
      case 'active':
        return '●';
      case 'paused':
        return '⏸';
      case 'completed':
        return '✓';
      case 'aborted':
        return '✗';
      default:
        return '○';
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">
          Session:{' '}
        </Text>
        <Text color={getStatusColor(status)}>
          {getStatusSymbol(status)}{' '}
        </Text>
        <Text>
          {activePath.join(' › ')}
        </Text>
        <Text dimColor> [{status}]</Text>
      </Box>

      {showShortcuts && activePath.length > 1 && (
        <Box marginLeft={2}>
          <Text dimColor>
            ⌥← back to parent  •  /session ls  •  /session abort
          </Text>
        </Box>
      )}
    </Box>
  );
};
```

---

## ADIM 11: App.tsx Entegrasyonu 🟢

**Süre:** 1 saat  
**Dosya:** `packages/cli/src/ui/App.tsx`

### 📝 Yapılacaklar

1. `useSessionManagement` hook'unu import et ve kullan
2. `SessionIndicator` component'ini koşullu olarak render et
3. Keyboard shortcut ekle (Alt+Left arrow)
4. Input'u session-aware yap

### Adımlar

#### 1. Import Eklemeleri

**Dosya başına ekle:**

```typescript
import { useSessionManagement } from './hooks/useSessionManagement.js';
import { SessionIndicator } from './components/SessionIndicator.js';
```

#### 2. Hook Kullanımı

**App component içinde, mevcut state tanımlarından sonra ekle:**

```typescript
export const App = ({ config }: { config: Config }) => {
  // ... mevcut state tanımları ...

  // NEW: Session management
  const {
    isInSession,
    getBreadcrumb,
    getActiveStatus,
    backToParent,
    sendToActiveSession,
  } = useSessionManagement(config);
```

#### 3. Keyboard Shortcut

**useInput hook'una ekle:**

```typescript
useInput((input, key) => {
  // NEW: Session navigation - Alt+Left to go back
  if (key.leftArrow && key.alt) {
    if (isInSession()) {
      backToParent();
    }
    return;
  }

  // ... mevcut input handling ...
});
```

#### 4. Render'da SessionIndicator Ekleme

**Return statement'ında, InputPrompt'tan önce ekle:**

```typescript
  return (
    <Box flexDirection="column" padding={1}>
      {/* ... mevcut başlık ve içerik ... */}

      {/* NEW: Session indicator */}
      {isInSession() && (
        <SessionIndicator
          activePath={getBreadcrumb()}
          status={getActiveStatus() || 'active'}
          onBack={backToParent}
          showShortcuts={true}
        />
      )}

      {/* Mevcut InputPrompt */}
      <InputPrompt
        onSubmit={(text) => {
          if (isInSession()) {
            // Send to active session
            void sendToActiveSession(text);
          } else {
            // Normal prompt handling
            handleUserPrompt(text);
          }
        }}
        // ... diğer props ...
      />
    </Box>
  );
```

---

## ADIM 12: Session Slash Commands 🟢

**Süre:** 30 dakika  
**Dosya:** `packages/cli/src/ui/commands/` (slash command handler)

### 📝 Yeni Komutlar

1. `/session ls` - List all sessions
2. `/session switch <id>` - Switch to session
3. `/session back` - Go to parent session
4. `/session abort` - Abort current session

**İmplementasyon detayları projenizin mevcut slash command yapısına bağlı.**

---

## 🟡 Test ve Dokümantasyon

---

## ADIM 16: Dokümantasyon 🟡

**Süre:** 1 saat  
**Dosya:** `docs/subagents.md` veya yeni `docs/sessions.md`

### 📝 Eklenecek Bölümler

**YENİ BÖLÜM EKLE:**

````markdown
## Interactive Sessions

### Overview

Interactive sessions enable hierarchical, bidirectional communication between you and subagents.

### Starting an Interactive Session

You can start an interactive session by instructing the main agent:

\`\`\`

> Let's use the bmad-analyst agent interactively to analyze these requirements
> \`\`\`

Or by directly using the Task tool with parameters:

\`\`\`typescript
{
subagent_type: "bmad-analyst",
prompt: "Analyze the requirements document",
description: "Requirements analysis",
interactive: true,
autoSwitch: true
}
\`\`\`

### Session Parameters

| Parameter              | Type    | Default | Description                      |
| ---------------------- | ------- | ------- | -------------------------------- |
| `interactive`          | boolean | false   | Enable bidirectional messaging   |
| `autoSwitch`           | boolean | true    | Auto-switch UI to new session    |
| `maxDepth`             | number  | 3       | Maximum nesting depth            |
| `inheritContext`       | boolean | true    | Inherit parent context variables |
| `allowUserInteraction` | boolean | true    | Allow user messages to session   |

### Session Navigation

**Automatic Switching:**
When a new interactive session starts, the UI automatically switches to it.

**Manual Navigation:**

- `Alt+←` - Return to parent session
- `/session ls` - List all sessions
- `/session switch <id>` - Switch to specific session
- `/session back` - Go to parent
- `/session abort` - Terminate current session

### Session Tree Example

\`\`\`
Root (Main Agent)
├── Session-1 (bmad-analyst) [active]
│ ├── Session-1.1 (bmad-researcher) [paused]
│ └── Session-1.2 (bmad-validator) [completed]
└── Session-2 (bmad-dev) [completed]
\`\`\`

### Context Inheritance

Child sessions can inherit context variables from their parent:

\`\`\`typescript
// Parent session
contextState.set('project_name', 'Qwen Code');
contextState.set('tech_stack', 'TypeScript, React');

// Child session (if inheritContext: true)
// automatically has access to 'project_name' and 'tech_stack'
\`\`\`

### Nested Tasks

Interactive sessions can create child sessions up to `maxDepth`:

\`\`\`
Root
└── Analyst (depth 1)
└── Researcher (depth 2)
└── Validator (depth 3) ← maxDepth reached
\`\`\`

### Best Practices

1. **Use interactive mode for:**
   - Long-running analysis tasks
   - Tasks requiring user feedback
   - Complex multi-step workflows

2. **Use non-interactive mode for:**
   - Quick, autonomous tasks
   - Background processing
   - Batch operations

3. **Limit nesting depth:**
   - Default maxDepth=3 is usually sufficient
   - Deep nesting can be confusing

4. **Context management:**
   - Set clear context variables in parent
   - Child sessions inherit automatically
   - Use descriptive variable names
     \`\`\`

---

## ADIM 17: Test Yazımı 🟡

**Süre:** 1-2 saat

### Test Dosyaları

#### 1. SessionManager Unit Tests

**DOSYA:** `packages/core/src/session/__tests__/SessionManager.test.ts`

```typescript
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SessionManager } from '../SessionManager.js';
import type { SessionEvent } from '../types.js';

describe('SessionManager', () => {
  let manager: SessionManager;
  let events: SessionEvent[];

  beforeEach(() => {
    manager = new SessionManager();
    events = [];
    manager.on((event) => events.push(event));
  });

  describe('createSession', () => {
    it('should create root session', async () => {
      const sessionId = await manager.createSession({
        name: 'test-root',
        sessionConfig: {
          interactive: true,
          maxDepth: 3,
          autoSwitch: true,
          inheritContext: false,
          allowUserInteraction: true,
        },
      });

      expect(sessionId).toBeDefined();
      expect(manager.hasSession(sessionId)).toBe(true);

      const node = manager.getTree().get(sessionId);
      expect(node).toBeDefined();
      expect(node?.name).toBe('test-root');
      expect(node?.depth).toBe(0);
    });

    it('should create child session', async () => {
      const parentId = await manager.createSession({
        name: 'parent',
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      const childId = await manager.createSession({
        name: 'child',
        parentId,
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      const childNode = manager.getTree().get(childId);
      expect(childNode?.parentId).toBe(parentId);
      expect(childNode?.depth).toBe(1);
    });

    it('should respect maxDepth limit', async () => {
      const root = await manager.createSession({
        name: 'root',
        sessionConfig: {
          interactive: false,
          maxDepth: 2,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      const child1 = await manager.createSession({
        name: 'child1',
        parentId: root,
        sessionConfig: {
          interactive: false,
          maxDepth: 2,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      const child2 = await manager.createSession({
        name: 'child2',
        parentId: child1,
        sessionConfig: {
          interactive: false,
          maxDepth: 2,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      // This should throw because maxDepth=2 and we're at depth 2
      await expect(
        manager.createSession({
          name: 'child3',
          parentId: child2,
          sessionConfig: {
            interactive: false,
            maxDepth: 2,
            autoSwitch: false,
            inheritContext: false,
            allowUserInteraction: false,
          },
        }),
      ).rejects.toThrow();
    });

    it('should emit SESSION_STARTED event', async () => {
      await manager.createSession({
        name: 'test',
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('SESSION_STARTED');
    });
  });

  describe('switchActiveSession', () => {
    it('should switch active session', async () => {
      const id1 = await manager.createSession({
        name: 'session1',
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });
      const id2 = await manager.createSession({
        name: 'session2',
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      manager.switchActiveSession(id2);
      expect(manager.getActiveSessionId()).toBe(id2);

      manager.switchActiveSession(id1);
      expect(manager.getActiveSessionId()).toBe(id1);
    });

    it('should emit SESSION_SWITCHED event', async () => {
      const id1 = await manager.createSession({
        name: 'session1',
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });
      events = []; // Clear events

      manager.switchActiveSession(id1);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('SESSION_SWITCHED');
    });
  });

  describe('backToParent', () => {
    it('should return to parent session', async () => {
      const parentId = await manager.createSession({
        name: 'parent',
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      const childId = await manager.createSession({
        name: 'child',
        parentId,
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: true,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      // Child is now active (autoSwitch: true)
      expect(manager.getActiveSessionId()).toBe(childId);

      const returnedId = manager.backToParent();
      expect(returnedId).toBe(parentId);
      expect(manager.getActiveSessionId()).toBe(parentId);
    });
  });

  describe('getBreadcrumb', () => {
    it('should return correct breadcrumb path', async () => {
      const root = await manager.createSession({
        name: 'root',
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      const child = await manager.createSession({
        name: 'child',
        parentId: root,
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      const grandchild = await manager.createSession({
        name: 'grandchild',
        parentId: child,
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      const breadcrumb = manager.getBreadcrumb(grandchild);
      expect(breadcrumb).toEqual(['root', 'child', 'grandchild']);
    });
  });

  describe('complete', () => {
    it('should mark session as completed', async () => {
      const sessionId = await manager.createSession({
        name: 'test',
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });

      manager.complete(sessionId, 'test result');

      const node = manager.getTree().get(sessionId);
      expect(node?.status).toBe('completed');
    });

    it('should emit SESSION_COMPLETED event', async () => {
      const sessionId = await manager.createSession({
        name: 'test',
        sessionConfig: {
          interactive: false,
          maxDepth: 3,
          autoSwitch: false,
          inheritContext: false,
          allowUserInteraction: false,
        },
      });
      events = [];

      manager.complete(sessionId, 'test result');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('SESSION_COMPLETED');
    });
  });
});
```
````

---

## 🎯 Tam Test Senaryosu

### Manuel Test Adımları

#### 1. Temel Interactive Session Testi

```bash
# Terminal'de Qwen Code'u çalıştır
npm start

# Ana agent'a komut ver
> Let's use bmad-analyst interactively to analyze the codebase

# Beklenen: UI otomatik olarak yeni session'a geçmeli
[Session: bmad-analyst] [active]
⌥← back, /session ls

# Subagent'a mesaj gönder
> What are the main architectural patterns you see?

# Beklenen: Subagent cevap vermeli, UI'da görünmeli

# Geri dön
Alt+← veya /session back

# Beklenen: Ana session'a dönülmeli
[Session: main] [active]
```

#### 2. Nested Session Testi

```bash
> Start an interactive session with bmad-analyst

[Session: bmad-analyst] [active]

> Can you delegate a research task to bmad-researcher?

# Beklenen: bmad-analyst, bmad-researcher'ı çağırmalı
[Session: bmad-analyst › bmad-researcher] [active]

# Researcher tamamlandıktan sonra
[Session: bmad-analyst] [active]
```

#### 3. Context Inheritance Testi

```bash
# Ana session'da context ayarla
> Set the project name to "Qwen Code" and tech stack to "TypeScript"

# Interactive session başlat
> Use bmad-analyst interactively

[Session: bmad-analyst] [active]

> What's the project name we're working on?

# Beklenen: "Qwen Code" cevabı vermeli (context'ten geldi)
```

---

## 🆘 Sorun Giderme

### Build Hataları

#### Tip Hatası: "Property 'interactive' does not exist"

**Sebep:** RunConfig güncellemesi yapılmamış  
**Çözüm:** Adım 13'ü tamamla

#### Import Hatası: "Cannot find module 'session'"

**Sebep:** Session modülü export edilmemiş  
**Çözüm:** `packages/core/src/session/index.ts` var olduğundan emin ol

### Runtime Hataları

#### "SessionManager is undefined"

**Sebep:** Config'de lazy init çalışmıyor  
**Çözüm:** `config.getSessionManager()` çağrısını kontrol et

#### "enqueueUserMessage called but no sessionId set"

**Sebep:** Interactive mode başlatılmadan mesaj gönderilmeye çalışıldı  
**Çözüm:** Session önce `runInteractive()` ile başlatılmalı

### UI Sorunları

#### SessionIndicator görünmüyor

**Sebep:** `isInSession()` false dönüyor  
**Debug:**

```typescript
console.log('Active session:', sessionManager.getActiveSessionId());
console.log('Tree:', sessionManager.getTree());
```

#### Mesajlar subagent'a gitmiyor

**Sebep:** Scope bind edilmemiş  
**Çözüm:** `sessionManager.bindScope()` çağrısını kontrol et

---

## ✅ Implementasyon Checklist

### Kritik (Zorunlu)

- [ ] Adım 13: RunConfig tip güncellemesi
- [ ] Adım 5: Interactive SubAgentScope implementasyonu
  - [ ] messageQueue eklendi
  - [ ] runInteractive() metodu
  - [ ] enqueueUserMessage() metodu
  - [ ] processNextInteractive() metodu
- [ ] Adım 6: Nested task desteği
  - [ ] runNonInteractive içinde allow_nested_tasks kontrolü
  - [ ] processNextInteractive içinde allow_nested_tasks kontrolü
- [ ] Adım 7: Enhanced TaskTool
  - [ ] TaskParams interface güncellendi
  - [ ] Schema güncellendi
  - [ ] execute() metodu session-aware yapıldı
- [ ] Build başarılı

### UI (İsteğe Bağlı)

- [ ] Adım 8: Event bridging
- [ ] Adım 9: useSessionManagement hook
- [ ] Adım 10: SessionIndicator component
- [ ] Adım 11: App.tsx entegrasyonu
  - [ ] Hook kullanımı
  - [ ] Keyboard shortcut (Alt+Left)
  - [ ] SessionIndicator render
  - [ ] Input routing
- [ ] Adım 12: Slash commands

### Test & Docs (Önerilen)

- [ ] Adım 16: Dokümantasyon güncellendi
- [ ] Adım 17: Testler yazıldı
  - [ ] SessionManager unit tests
  - [ ] Interactive mode tests
  - [ ] Manuel test senaryoları çalıştırıldı

---

## 📊 İlerleme Tahmini

| Fase                         | Süre         | Zorluk | Öncelik         |
| ---------------------------- | ------------ | ------ | --------------- |
| Kritik Adımlar (13, 5, 6, 7) | 3-4 saat     | Yüksek | 🔴 Zorunlu      |
| UI Entegrasyonu (8-12)       | 2-3 saat     | Orta   | 🟢 İsteğe Bağlı |
| Test & Docs (16-17)          | 1-2 saat     | Düşük  | 🟡 Önerilen     |
| **TOPLAM**                   | **6-9 saat** | -      | -               |

---

## 🎉 Tamamlandığında

Sisteminiz şu özelliklere sahip olacak:

✅ **Hierarchical Sessions** - Parent-child session tree  
✅ **Bidirectional Messaging** - User ↔ Subagent communication  
✅ **Auto UI Switching** - Seamless session transitions  
✅ **Context Inheritance** - Variables flow down the tree  
✅ **Nested Tasks** - Subagents can delegate to other subagents  
✅ **Event-Driven UI** - Real-time updates  
✅ **Keyboard Navigation** - Alt+← to go back  
✅ **Session Management** - Pause, resume, complete, abort

**Roo Code tarzı gelişmiş interactive agent sistemi tamam! 🚀**

---

## 📞 Yardım

Herhangi bir adımda takılırsanız:

1. İlgili dosyayı ve satır numarasını kontrol edin
2. Build çıktısını inceleyin
3. Console log'ları ekleyin
4. Belirli hatayı paylaşın

**Başarılar! 💪**
