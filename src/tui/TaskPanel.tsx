import { Box, Text } from 'ink';
import type { LoopState, Task } from '../types/index.js';

interface TaskPanelProps {
  tasks: Task[];
  completedTasks: string[];
  activeLoops: LoopState[];
}

function isBlocked(task: Task, completedIds: Set<string>): boolean {
  return task.status === 'pending' && task.dependencies.some((depId) => !completedIds.has(depId));
}

function getBlockerName(task: Task, tasks: Task[], completedIds: Set<string>): string | null {
  const blockerId = task.dependencies.find((depId) => !completedIds.has(depId));
  return blockerId ? (tasks.find((t) => t.id === blockerId)?.title ?? null) : null;
}

function getLoopLabel(task: Task, loops: LoopState[]): string | null {
  const loop = loops.find(
    (l) => l.taskIds.includes(task.id) && (l.status === 'running' || l.status === 'pending')
  );
  return loop ? loop.loopId : null;
}

function getStatusPriority(task: Task, completedIds: Set<string>): number {
  if (task.status === 'in_progress') return 0;
  if (task.status === 'pending' && !isBlocked(task, completedIds)) return 1;
  if (task.status === 'pending') return 2; // blocked
  if (task.status === 'completed') return 3;
  if (task.status === 'failed') return 4;
  return 5;
}

interface TaskRowProps {
  task: Task;
  tasks: Task[];
  completedIds: Set<string>;
  loops: LoopState[];
}

function TaskRow({ task, tasks, completedIds, loops }: TaskRowProps) {
  const blocked = isBlocked(task, completedIds);
  const blockerName = blocked ? getBlockerName(task, tasks, completedIds) : null;
  const loopLabel = getLoopLabel(task, loops);

  let icon: string;
  let color: string;

  switch (task.status) {
    case 'completed':
      icon = '\u2713';
      color = 'green';
      break;
    case 'in_progress':
      icon = '\u27F3';
      color = 'cyan';
      break;
    case 'failed':
      icon = '\u2717';
      color = 'red';
      break;
    default:
      // pending
      icon = '\u25CB';
      color = blocked ? 'gray' : 'yellow';
      break;
  }

  // Truncate title if too long
  const maxTitleLen = 20;
  const displayTitle =
    task.title.length > maxTitleLen ? `${task.title.slice(0, maxTitleLen - 1)}\u2026` : task.title;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={color}>{icon} </Text>
        <Text color={blocked ? 'gray' : undefined}>{displayTitle}</Text>
      </Box>
      {loopLabel && (
        <Box marginLeft={2}>
          <Text dimColor>({loopLabel})</Text>
        </Box>
      )}
      {blockerName && (
        <Box marginLeft={2}>
          <Text dimColor>
            {'\u21B3'} {blockerName}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function TaskPanel({ tasks, completedTasks, activeLoops }: TaskPanelProps) {
  const completedIds = new Set(completedTasks);
  const completedCount = completedTasks.length;
  const totalCount = tasks.length;

  // Sort tasks by status priority
  const sortedTasks = [...tasks].sort(
    (a, b) => getStatusPriority(a, completedIds) - getStatusPriority(b, completedIds)
  );

  return (
    <Box flexDirection="column" borderStyle="single" width="30%" height="100%" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>
          Tasks ({completedCount}/{totalCount})
        </Text>
      </Box>
      <Box flexDirection="column" overflow="hidden" flexGrow={1}>
        {sortedTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            tasks={tasks}
            completedIds={completedIds}
            loops={activeLoops}
          />
        ))}
        {tasks.length === 0 && <Text dimColor>No tasks yet</Text>}
      </Box>
    </Box>
  );
}
