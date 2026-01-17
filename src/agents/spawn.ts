import type { Phase } from '../types/index.js';

export interface AgentConfig {
  cwd: string;
  allowedTools: string[];
  permissionMode: 'bypassPermissions' | 'acceptEdits';
  maxTurns: number;
  systemPrompt?: string;
}

const PHASE_TOOLS: Record<Phase, string[]> = {
  enumerate: ['Read', 'Glob', 'Grep'],
  plan: ['Read', 'Glob', 'Grep'],
  build: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
  review: ['Read', 'Glob', 'Grep', 'Bash'],
  revise: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
  complete: [],
};

const PHASE_MAX_TURNS: Record<Phase, number> = {
  enumerate: 50,
  plan: 30,
  build: 100,
  review: 50,
  revise: 100,
  complete: 1,
};

export function createAgentConfig(phase: Phase, cwd: string): AgentConfig {
  return {
    cwd,
    allowedTools: PHASE_TOOLS[phase],
    permissionMode: 'bypassPermissions',
    maxTurns: PHASE_MAX_TURNS[phase],
  };
}

export interface AgentMessage {
  type: 'assistant' | 'result' | 'tool';
  content?: string;
  toolName?: string;
}

export type AgentOutputHandler = (message: AgentMessage) => void;
