import { query } from '@anthropic-ai/claude-agent-sdk';
import type { OrchestratorState, Task, TaskGraph, LoopState } from '../../types/index.js';
import { createAgentConfig } from '../../agents/spawn.js';
import { BUILD_PROMPT } from '../../agents/prompts.js';
import { LoopManager } from '../../loops/manager.js';
import { detectStuck, updateStuckIndicators } from '../../loops/stuck-detection.js';
import { getEffortConfig } from '../../config/effort.js';

export function getNextParallelGroup(
  graph: TaskGraph,
  completedTasks: string[]
): string[] | null {
  for (const group of graph.parallelGroups) {
    const allComplete = group.every(id => completedTasks.includes(id));
    if (!allComplete) {
      // Return tasks from this group that aren't complete
      return group.filter(id => !completedTasks.includes(id));
    }
  }
  return null;
}

export function canStartGroup(
  taskIds: string[],
  completedTasks: string[],
  allTasks: Task[]
): boolean {
  for (const taskId of taskIds) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) continue;

    const depsComplete = task.dependencies.every(dep => completedTasks.includes(dep));
    if (!depsComplete) return false;
  }
  return true;
}

export interface BuildResult {
  completedTasks: string[];
  activeLoops: LoopState[];
  needsReview: boolean;
  stuck: boolean;
}

export async function executeBuildIteration(
  state: OrchestratorState,
  loopManager: LoopManager,
  onLoopOutput?: (loopId: string, text: string) => void
): Promise<BuildResult> {
  const graph = state.taskGraph!;
  const config = createAgentConfig('build', process.cwd());
  const effortConfig = getEffortConfig(state.effort);

  // Check for stuck loops
  for (const loop of loopManager.getActiveLoops()) {
    const stuckResult = detectStuck(loop, { stuckThreshold: effortConfig.stuckThreshold });
    if (stuckResult) {
      loopManager.updateLoopStatus(loop.loopId, 'stuck');
      return {
        completedTasks: state.completedTasks,
        activeLoops: loopManager.getAllLoops(),
        needsReview: true,
        stuck: true,
      };
    }
  }

  // Spawn new loops for available tasks
  const nextGroup = getNextParallelGroup(graph, state.completedTasks);
  if (nextGroup && canStartGroup(nextGroup, state.completedTasks, state.tasks)) {
    while (loopManager.canSpawnMore() && nextGroup.length > 0) {
      const taskId = nextGroup.shift()!;
      const loop = loopManager.createLoop([taskId], state.tasks);
      loopManager.updateLoopStatus(loop.loopId, 'running');
    }
  }

  // Execute one iteration for each active loop
  const loopPromises = loopManager.getActiveLoops().map(async (loop) => {
    const task = state.tasks.find(t => t.id === loop.taskIds[0])!;
    const prompt = `${BUILD_PROMPT}

## Current Task:
ID: ${task.id}
Title: ${task.title}
Description: ${task.description}

## Iteration: ${loop.iteration + 1}/${loop.maxIterations}`;

    let output = '';
    let hasError = false;
    let errorMessage: string | null = null;

    try {
      for await (const message of query({
        prompt,
        options: {
          allowedTools: config.allowedTools,
          maxTurns: 10, // Single iteration limit
        },
      })) {
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if ('text' in block) {
              output += block.text;
              onLoopOutput?.(loop.loopId, block.text);
              loopManager.appendOutput(loop.loopId, block.text);
            }
          }
        }
      }

      // Check for completion signal
      if (output.includes('TASK_COMPLETE')) {
        loopManager.updateLoopStatus(loop.loopId, 'completed');
        return { loopId: loop.loopId, taskId: task.id, completed: true };
      }

      // Check for stuck signal
      if (output.includes('TASK_STUCK:')) {
        const stuckMatch = output.match(/TASK_STUCK:\s*(.+)/);
        errorMessage = stuckMatch?.[1] || 'Unknown reason';
        hasError = true;
      }
    } catch (e) {
      hasError = true;
      errorMessage = String(e);
    }

    loopManager.incrementIteration(loop.loopId);
    updateStuckIndicators(loop, errorMessage, !hasError);

    return { loopId: loop.loopId, taskId: task.id, completed: false };
  });

  const results = await Promise.all(loopPromises);
  const newlyCompleted = results.filter(r => r.completed).map(r => r.taskId);

  // Check if any loop needs review
  const needsReview = loopManager.getActiveLoops().some(loop =>
    loopManager.needsReview(loop.loopId)
  );

  return {
    completedTasks: [...state.completedTasks, ...newlyCompleted],
    activeLoops: loopManager.getAllLoops(),
    needsReview,
    stuck: false,
  };
}
