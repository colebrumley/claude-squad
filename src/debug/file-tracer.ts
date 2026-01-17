import { mkdirSync } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Phase } from '../types/index.js';
import type {
  AgentCallWriter,
  DebugEvent,
  DebugTracer,
  LoopStatus,
  StateSnapshotEvent,
  TaskStatus,
  TraceFile,
} from './types.js';

class FileAgentCallWriter implements AgentCallWriter {
  private tracer: FileTracer;
  private phase: Phase;
  private loopId?: string;
  private iteration?: number;
  private promptFile: string;
  private responseFile: string;
  private responsePath: string;
  private startTime: number;
  private outputBuffer: string[] = [];
  private writePromise: Promise<void> = Promise.resolve();

  constructor(
    tracer: FileTracer,
    opts: { phase: Phase; loopId?: string; iteration?: number; prompt: string },
    promptFile: string,
    responseFile: string,
    outputsDir: string
  ) {
    this.tracer = tracer;
    this.phase = opts.phase;
    this.loopId = opts.loopId;
    this.iteration = opts.iteration;
    this.promptFile = promptFile;
    this.responseFile = responseFile;
    this.responsePath = join(outputsDir, responseFile);
    this.startTime = Date.now();

    // Write prompt file immediately
    const promptPath = join(outputsDir, promptFile);
    writeFile(promptPath, opts.prompt).catch(() => {});

    // Create empty response file
    writeFile(this.responsePath, '').catch(() => {});
  }

  appendOutput(text: string): void {
    this.outputBuffer.push(text);
    // Serialize writes to prevent corruption
    this.writePromise = this.writePromise
      .then(() => appendFile(this.responsePath, text))
      .catch(() => {});
  }

  async complete(costUsd: number, durationMs: number): Promise<void> {
    await this.writePromise;
    this.tracer.addAgentCallEvent({
      phase: this.phase,
      loopId: this.loopId,
      iteration: this.iteration,
      promptFile: `outputs/${this.promptFile}`,
      responseFile: `outputs/${this.responseFile}`,
      costUsd,
      durationMs,
    });
  }

  async markInterrupted(error?: string): Promise<void> {
    await this.writePromise;
    await appendFile(this.responsePath, `\n\n[INTERRUPTED: ${error || 'unknown'}]`);
  }
}

class FileTracer implements DebugTracer {
  private stateDir: string;
  private debugDir = '';
  private outputsDir = '';
  private trace: TraceFile | null = null;
  private outputCounter = 0;
  private writePromise: Promise<void> = Promise.resolve();

  constructor(stateDir: string) {
    this.stateDir = stateDir;
  }

  async init(runId: string, specPath: string, effort: string): Promise<void> {
    this.debugDir = join(this.stateDir, 'debug', runId);
    this.outputsDir = join(this.debugDir, 'outputs');

    mkdirSync(this.debugDir, { recursive: true });
    mkdirSync(this.outputsDir, { recursive: true });

    this.trace = {
      runId,
      specPath,
      effort,
      startedAt: new Date().toISOString(),
      completedAt: null,
      events: [],
    };

    await this.saveTrace();
  }

  async finalize(): Promise<void> {
    if (this.trace) {
      // Merge MCP tool calls from JSONL file
      await this.mergeMcpCalls();

      this.trace.completedAt = new Date().toISOString();
      await this.saveTrace();
    }
  }

  private async mergeMcpCalls(): Promise<void> {
    const mcpLogPath = join(this.debugDir, 'mcp-calls.jsonl');
    try {
      const content = await readFile(mcpLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          // Insert MCP events into the events array, sorted by timestamp
          this.trace?.events.push({
            type: 'mcp_tool_call',
            timestamp: event.timestamp,
            tool: event.tool,
            input: event.input,
            result: event.result,
          });
        } catch {
          // Skip malformed lines
        }
      }

      // Sort all events by timestamp
      this.trace?.events.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } catch {
      // No MCP log file, that's fine
    }
  }

  logPhaseStart(phase: Phase, inputState: Record<string, unknown>): void {
    this.addEvent({
      type: 'phase_start',
      timestamp: new Date().toISOString(),
      phase,
      inputState,
    });
  }

  logPhaseComplete(phase: Phase, success: boolean, costUsd: number, summary: string): void {
    this.addEvent({
      type: 'phase_complete',
      timestamp: new Date().toISOString(),
      phase,
      success,
      costUsd,
      summary,
    });
  }

  async logAgentCall(opts: {
    phase: Phase;
    loopId?: string;
    iteration?: number;
    prompt: string;
    response: string;
    costUsd: number;
    durationMs: number;
  }): Promise<void> {
    this.outputCounter++;
    const prefix = opts.loopId
      ? `${opts.phase}-${opts.loopId.slice(0, 8)}-iter-${opts.iteration}`
      : opts.phase;

    const promptFile = `${prefix}-${this.outputCounter}-prompt.txt`;
    const responseFile = `${prefix}-${this.outputCounter}-response.txt`;

    await writeFile(join(this.outputsDir, promptFile), opts.prompt);
    await writeFile(join(this.outputsDir, responseFile), opts.response);

    this.addEvent({
      type: 'agent_call',
      timestamp: new Date().toISOString(),
      phase: opts.phase,
      loopId: opts.loopId,
      iteration: opts.iteration,
      promptFile: `outputs/${promptFile}`,
      responseFile: `outputs/${responseFile}`,
      costUsd: opts.costUsd,
      durationMs: opts.durationMs,
    });
  }

  logMcpToolCall(
    tool: string,
    input: Record<string, unknown>,
    result: Record<string, unknown>
  ): void {
    this.addEvent({
      type: 'mcp_tool_call',
      timestamp: new Date().toISOString(),
      tool,
      input,
      result,
    });
  }

  logDecision(
    category: string,
    input: Record<string, unknown>,
    outcome: string,
    reason: string,
    loopId?: string
  ): void {
    this.addEvent({
      type: 'decision',
      timestamp: new Date().toISOString(),
      category,
      loopId,
      input,
      outcome,
      reason,
    });
  }

  addAgentCallEvent(opts: {
    phase: Phase;
    loopId?: string;
    iteration?: number;
    promptFile: string;
    responseFile: string;
    costUsd: number;
    durationMs: number;
  }): void {
    this.addEvent({
      type: 'agent_call',
      timestamp: new Date().toISOString(),
      phase: opts.phase,
      loopId: opts.loopId,
      iteration: opts.iteration,
      promptFile: opts.promptFile,
      responseFile: opts.responseFile,
      costUsd: opts.costUsd,
      durationMs: opts.durationMs,
    });
  }

  startAgentCall(opts: {
    phase: Phase;
    loopId?: string;
    iteration?: number;
    prompt: string;
  }): AgentCallWriter {
    this.outputCounter++;
    const prefix = opts.loopId
      ? `${opts.phase}-${opts.loopId.slice(0, 8)}-iter-${opts.iteration}`
      : opts.phase;

    const promptFile = `${prefix}-${this.outputCounter}-prompt.txt`;
    const responseFile = `${prefix}-${this.outputCounter}-response.txt`;

    return new FileAgentCallWriter(this, opts, promptFile, responseFile, this.outputsDir);
  }

  logLoopCreated(loopId: string, taskIds: string[], worktreePath?: string | null): void {
    this.addEvent({
      type: 'loop_created',
      timestamp: new Date().toISOString(),
      loopId,
      taskIds,
      worktreePath,
    });
  }

  logLoopIteration(loopId: string, iteration: number): void {
    this.addEvent({
      type: 'loop_iteration',
      timestamp: new Date().toISOString(),
      loopId,
      taskIds: [],
      iteration,
    });
  }

  logLoopStatusChange(loopId: string, status: LoopStatus, taskIds: string[]): void {
    this.addEvent({
      type: 'loop_status_change',
      timestamp: new Date().toISOString(),
      loopId,
      taskIds,
      status,
    });
  }

  logTaskStatusChange(
    taskId: string,
    previousStatus: TaskStatus,
    newStatus: TaskStatus,
    loopId?: string
  ): void {
    this.addEvent({
      type: 'task_status_change',
      timestamp: new Date().toISOString(),
      taskId,
      previousStatus,
      newStatus,
      loopId,
    });
  }

  logStateSnapshot(
    trigger: 'phase_transition' | 'error' | 'run_complete',
    state: StateSnapshotEvent['state']
  ): void {
    this.addEvent({
      type: 'state_snapshot',
      timestamp: new Date().toISOString(),
      trigger,
      state,
    });
  }

  logError(error: string, phase: Phase, loopId?: string, context?: Record<string, unknown>): void {
    this.addEvent({
      type: 'error',
      timestamp: new Date().toISOString(),
      error,
      phase,
      loopId,
      context,
    });
  }

  private addEvent(event: DebugEvent): void {
    if (this.trace) {
      this.trace.events.push(event);
      // Fire and forget - save after each event for crash recovery
      // Use serialized writes to prevent file corruption
      this.writePromise = this.writePromise.then(() => this.doSaveTrace()).catch(() => {});
    }
  }

  private async saveTrace(): Promise<void> {
    // Wait for any pending writes then do a final write
    await this.writePromise;
    await this.doSaveTrace();
  }

  private async doSaveTrace(): Promise<void> {
    if (this.trace) {
      await writeFile(join(this.debugDir, 'trace.json'), JSON.stringify(this.trace, null, 2));
    }
  }
}

export function createFileTracer(stateDir: string): DebugTracer {
  return new FileTracer(stateDir);
}
