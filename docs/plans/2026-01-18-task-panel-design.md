# TUI Task Panel Design

## Problem

The header shows `tasks: 5/12` but users can't see which tasks are done, in progress, or blocked. This makes it hard to understand:
- What work is currently happening
- What's waiting to start
- What's blocking progress

## Solution

Add a toggleable task list sidebar panel (`[t]` key) that shows all tasks with their status and blocking relationships.

## Visual Design

When toggled, the panel slides in from the right, taking ~30% width:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Claude Squad │ phase: build │ effort: medium │ loops: 2/4 │ ...    │
├──────────────────────────────────────────────────────┬──────────────┤
│ [Status Area]                                        │ Tasks (5/12) │
├──────────────────────────────────────────────────────┼──────────────┤
│ ┌─────────────┐ ┌─────────────┐                      │ ⟳ Build API  │
│ │   loop-1    │ │   loop-2    │                      │   (loop-1)   │
│ │  Building   │ │  Building   │                      │ ⟳ Parse spec │
│ │  output...  │ │  output...  │                      │   (loop-2)   │
│ └─────────────┘ └─────────────┘                      │ ○ Write tests│
│                                                      │   ↳ Build API│
│                                                      │ ✓ Impl auth  │
│                                                      │ ✓ Add models │
├──────────────────────────────────────────────────────┴──────────────┤
│ [q]uit [p]ause [r]eview [t]asks [1-4] focus                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Task Status Icons

| Status | Icon | Color | Extra Info |
|--------|------|-------|------------|
| In progress | ⟳ | cyan | Loop ID (e.g., "loop-1") |
| Pending (unblocked) | ○ | yellow | None |
| Pending (blocked) | ○ | dim | Blocker name (e.g., "↳ Build API") |
| Completed | ✓ | green | None |
| Failed | ✗ | red | None |

### Task Sorting

Tasks sorted by status priority:
1. In progress (actively being worked on)
2. Pending unblocked (ready to start)
3. Pending blocked (waiting on dependencies)
4. Completed
5. Failed

## Implementation

### Files to Modify

1. **`src/tui/App.tsx`**
   - Add `showTaskPanel` state (boolean, default false)
   - Add `[t]` key handler in `useInput` to toggle panel
   - Pass `showTaskPanel` to Layout

2. **`src/tui/Layout.tsx`**
   - Accept `showTaskPanel` prop
   - When true: render main content at 70% width, TaskPanel at 30%
   - When false: render main content at 100% width
   - Update footer to show `[t]asks`

3. **`src/tui/TaskPanel.tsx`** (new file)
   - Accept `tasks`, `completedTasks`, `activeLoops` props
   - Compute blocked status for each task
   - Sort and render task list

### TaskPanel Component

```typescript
interface TaskPanelProps {
  tasks: Task[];
  completedTasks: string[];
  activeLoops: LoopState[];
}

function isBlocked(task: Task, completedIds: Set<string>): boolean {
  return task.status === 'pending' &&
         task.dependencies.some(depId => !completedIds.has(depId));
}

function getBlockerName(task: Task, tasks: Task[], completedIds: Set<string>): string | null {
  const blockerId = task.dependencies.find(depId => !completedIds.has(depId));
  return blockerId ? tasks.find(t => t.id === blockerId)?.title ?? null : null;
}

function getLoopLabel(task: Task, loops: LoopState[]): string | null {
  const loop = loops.find(l => l.taskIds.includes(task.id) && l.status === 'running');
  return loop ? loop.loopId : null;
}
```

### Sort Priority

```typescript
function getStatusPriority(task: Task, completedIds: Set<string>): number {
  if (task.status === 'in_progress') return 0;
  if (task.status === 'pending' && !isBlocked(task, completedIds)) return 1;
  if (task.status === 'pending' && isBlocked(task, completedIds)) return 2;
  if (task.status === 'completed') return 3;
  if (task.status === 'failed') return 4;
  return 5;
}
```

## Non-Goals

- Task filtering or search
- Clicking/selecting tasks for details
- Collapsible task groups
- Progress percentage per task

## Success Criteria

- User can toggle task panel with `[t]`
- All tasks visible with clear status icons
- Blocked tasks show which task is blocking them
- In-progress tasks show which loop is working on them
- Panel doesn't obscure critical loop output (only takes 30% width)
