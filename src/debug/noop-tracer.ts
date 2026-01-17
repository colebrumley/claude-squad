import type { Phase } from '../types/index.js';
import type {
  AgentCallWriter,
  DebugTracer,
  LoopStatus,
  StateSnapshotEvent,
  TaskStatus,
} from './types.js';

class NoopAgentCallWriter implements AgentCallWriter {
  appendOutput(_text: string): void {}
  async complete(_costUsd: number, _durationMs: number): Promise<void> {}
  async markInterrupted(_error?: string): Promise<void> {}
}

class NoopTracer implements DebugTracer {
  async init(_runId: string, _specPath: string, _effort: string): Promise<void> {}
  async finalize(): Promise<void> {}
  logPhaseStart(_phase: Phase, _inputState: Record<string, unknown>): void {}
  logPhaseComplete(_phase: Phase, _success: boolean, _costUsd: number, _summary: string): void {}
  async logAgentCall(_opts: {
    phase: Phase;
    loopId?: string;
    iteration?: number;
    prompt: string;
    response: string;
    costUsd: number;
    durationMs: number;
  }): Promise<void> {}
  logMcpToolCall(
    _tool: string,
    _input: Record<string, unknown>,
    _result: Record<string, unknown>
  ): void {}
  logDecision(
    _category: string,
    _input: Record<string, unknown>,
    _outcome: string,
    _reason: string,
    _loopId?: string
  ): void {}

  startAgentCall(_opts: {
    phase: Phase;
    loopId?: string;
    iteration?: number;
    prompt: string;
  }): AgentCallWriter {
    return new NoopAgentCallWriter();
  }

  logLoopCreated(_loopId: string, _taskIds: string[], _worktreePath?: string | null): void {}
  logLoopIteration(_loopId: string, _iteration: number): void {}
  logLoopStatusChange(_loopId: string, _status: LoopStatus, _taskIds: string[]): void {}
  logTaskStatusChange(
    _taskId: string,
    _previousStatus: TaskStatus,
    _newStatus: TaskStatus,
    _loopId?: string
  ): void {}
  logStateSnapshot(
    _trigger: 'phase_transition' | 'error' | 'run_complete',
    _state: StateSnapshotEvent['state']
  ): void {}
  logError(
    _error: string,
    _phase: Phase,
    _loopId?: string,
    _context?: Record<string, unknown>
  ): void {}
}

export function createNoopTracer(): DebugTracer {
  return new NoopTracer();
}
