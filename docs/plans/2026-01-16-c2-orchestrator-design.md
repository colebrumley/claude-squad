# c2 Orchestrator Design

An AI orchestrator using the Claude Code SDK that improves on the Ralph Wiggum pattern with parallel execution, effort-based review frequency, and a multi-column TUI.

## Overview

c2 is a thin coordination layer that:
- Runs inside an outer Ralph loop (stateless between invocations)
- Breaks specs into tasks, identifies parallelizable work
- Spawns Claude Code agents for actual work
- Manages state on disk between invocations

```
┌─────────────────────────────────────────────────────────────┐
│                     Outer Ralph Loop                        │
│                   (bash: while :; do c2; done)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      c2 Orchestrator                        │
│                                                             │
│  1. Load state from disk (or initialize if first run)       │
│  2. Determine phase: ENUMERATE → PLAN → BUILD → REVIEW      │
│  3. Execute one phase (spawning agents as needed)           │
│  4. Save state to disk                                      │
│  5. Exit (outer loop restarts us)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Agents                       │
│  (spawned via SDK for actual work - planning, coding, etc.) │
└─────────────────────────────────────────────────────────────┘
```

## Phases

The orchestrator moves through phases, persisting position between invocations:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   ENUMERATE  │ ──▶ │     PLAN     │ ──▶ │    BUILD     │ ──▶ │    REVIEW    │
│              │     │              │     │              │     │              │
│ Break spec   │     │ Identify     │     │ Execute      │     │ Validate     │
│ into tasks   │     │ dependencies │     │ tasks in     │     │ quality,     │
│              │     │ & ordering   │     │ parallel     │     │ run tests    │
│              │     │              │     │ loops        │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                │                     │
                                                │    ┌────────────────┘
                                                │    │ (if issues found)
                                                ▼    ▼
                                          ┌──────────────┐
                                          │    REVISE    │
                                          │              │
                                          │ Fix issues,  │
                                          │ loop back to │
                                          │ BUILD/REVIEW │
                                          └──────────────┘
```

**Phase behaviors:**
- **ENUMERATE**: Single agent call - reads spec, outputs task list
- **PLAN**: Single agent call - analyzes dependencies, creates execution graph
- **BUILD**: Parallel agent loops - one loop per independent task group
- **REVIEW**: Effort-dependent - low effort does quick validation, high effort does deep analysis
- **REVISE**: Re-enters BUILD with specific fixes, tracks revision count

## Effort Levels

Effort controls review frequency and depth across all phases:

| Level | Flag | Behavior |
|-------|------|----------|
| **Low** | `--effort=low` | No intermediate reviews. ENUMERATE → PLAN → BUILD → final REVIEW. Prioritizes speed. |
| **Medium** | `--effort=medium` | Review after PLAN (catch bad architecture early). Standard validation at end. |
| **High** | `--effort=high` | Review after ENUMERATE (are tasks correct?), after PLAN (is approach sound?), deep review after BUILD. May prompt for human input at checkpoints. |
| **Max** | `--effort=max` | All of high, plus: each BUILD loop self-reviews every N iterations, runs full test suite between tasks, validates against spec before marking complete. |

**Review agent behavior by effort:**
- Low: "Do tests pass? Yes/no."
- Medium: "Do tests pass? Does the code match the plan?"
- High: "Does this match the spec? Are there edge cases? Is the approach optimal?"
- Max: "Full code review. Security check. Performance analysis. Spec compliance."

**Iteration review intervals:**

| Effort | Review Every N Iterations |
|--------|---------------------------|
| Low    | 10                        |
| Medium | 5                         |
| High   | 3                         |
| Max    | Every iteration           |

## State Structure

State persists to disk between invocations as JSON:

```typescript
// .c2/state.json
interface OrchestratorState {
  // Identity
  runId: string;
  specPath: string;
  effort: 'low' | 'medium' | 'high' | 'max';

  // Phase tracking
  phase: 'enumerate' | 'plan' | 'build' | 'review' | 'revise' | 'complete';
  phaseHistory: PhaseResult[];

  // Task management
  tasks: Task[];
  taskGraph: TaskGraph;

  // Build tracking
  activeLoops: LoopState[];
  completedTasks: string[];

  // Review tracking
  pendingReview: boolean;
  reviewType: 'enumerate' | 'plan' | 'build' | null;
  revisionCount: number;

  // Context for agents
  context: {
    discoveries: string[];
    errors: string[];
    decisions: string[];
  };
}

interface LoopState {
  loopId: string;
  taskIds: string[];

  // Iteration tracking
  iteration: number;
  maxIterations: number;
  reviewInterval: number;
  lastReviewAt: number;

  // Health tracking
  status: 'running' | 'stuck' | 'completed' | 'failed';
  stuckIndicators: {
    sameErrorCount: number;
    noProgressCount: number;
    testFlapping: boolean;
  };
}
```

**File layout:**
```
.c2/
  state.json          # Orchestrator state
  spec.md             # Copy of input spec
  tasks/              # Individual task details
  loops/              # Per-loop progress files
  reviews/            # Review outputs
```

## Parallel Build Loops

Independent tasks run in parallel, each loop is a mini-Ralph:

```
                        ┌─────────────────────┐
                        │     Task Graph      │
                        │                     │
                        │  A ──┬──▶ D ──▶ E   │
                        │      │              │
                        │  B ──┘              │
                        │                     │
                        │  C (independent)    │
                        └─────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
            ┌──────────────┐            ┌──────────────┐
            │   Loop 1     │            │   Loop 2     │
            │   A → B → D  │            │      C       │
            │   → E        │            │              │
            └──────────────┘            └──────────────┘
                    │                           │
                    └─────────────┬─────────────┘
                                  ▼
                        ┌─────────────────────┐
                        │   Merge & Review    │
                        └─────────────────────┘
```

**Orchestrator's role during BUILD phase:**
1. Check which loops are still active
2. Spawn new loops for tasks whose dependencies are met
3. Collect results from completed loops
4. Detect conflicts (two loops edited same file) → queue for REVISE

**Stuck detection triggers:**
- Same error 3+ times → pause loop, escalate
- No file changes in 3+ iterations → likely stuck
- Iteration count > 2x estimated → review needed

## CLI Interface

```bash
# Basic usage
c2 --spec=spec.md --effort=medium

# All options
c2 --spec=<path>              # Required: path to spec file
   --effort=<level>           # low|medium|high|max (default: medium)
   --max-loops=<n>            # Max concurrent parallel loops (default: 4)
   --max-iterations=<n>       # Hard cap per loop (default: 20)
   --state-dir=<path>         # State directory (default: .c2/)
   --resume                   # Resume existing run (default if state exists)
   --reset                    # Discard state, start fresh
   --dry-run                  # Show what would happen, don't execute
```

**Exit codes:**
- `0` - Completed successfully
- `1` - Error occurred (saved to state, will retry)
- `2` - Stuck/needs human intervention
- `3` - Max iterations reached

## TUI Layout

Multi-column display with one column per running loop:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  c2 orchestrator │ phase: BUILD │ effort: high │ loops: 3/4 │ iter: 12     │
├───────────────────────┬───────────────────────┬───────────────────────────────┤
│ Loop 1: auth-system   │ Loop 2: api-endpoints │ Loop 3: database-schema     │
│ task: implement login │ task: create /users   │ task: add users table       │
│ iter: 5/20 ✓ passing  │ iter: 3/20 ⟳ running  │ iter: 7/20 ✗ failing        │
├───────────────────────┼───────────────────────┼───────────────────────────────┤
│ > Reading auth.ts...  │ > Creating endpoint   │ > Test failed:              │
│ > Found existing      │   handler for POST    │   column "email" missing    │
│   session logic       │   /users route        │ > Updating migration...     │
│ > Extending with      │ > Adding validation   │ > Adding email column       │
│   JWT support...      │   middleware...       │ > Re-running tests...       │
│ > Writing token       │ > Writing tests...    │                             │
│   generation...       │                       │                             │
├───────────────────────┴───────────────────────┴───────────────────────────────┤
│ [q]uit  [p]ause all  [r]eview now  [1-4] focus loop  [tab] cycle            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**TUI features:**
- Header: Overall orchestrator status, phase, effort, active loop count
- Columns: One per active loop, auto-sized
- Per-column: Task name, iteration count, status indicator, streaming output
- Footer: Keyboard shortcuts for control
- Focus mode: Expand one column full-width for detailed view

## Project Structure

```
c2/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # CLI entry point
│   ├── orchestrator/
│   │   ├── index.ts          # Main orchestrator logic
│   │   ├── phases/
│   │   │   ├── enumerate.ts  # Break spec into tasks
│   │   │   ├── plan.ts       # Build dependency graph
│   │   │   ├── build.ts      # Manage parallel loops
│   │   │   ├── review.ts     # Validate work
│   │   │   └── revise.ts     # Fix issues
│   │   └── state.ts          # State load/save
│   ├── loops/
│   │   ├── manager.ts        # Spawn/track parallel loops
│   │   ├── loop.ts           # Single loop execution
│   │   └── stuck-detection.ts
│   ├── agents/
│   │   ├── spawn.ts          # Claude Code SDK wrapper
│   │   ├── prompts.ts        # Phase-specific prompts
│   │   └── context.ts        # Context building
│   ├── tui/
│   │   ├── index.ts          # TUI entry point
│   │   ├── layout.ts         # Multi-column layout
│   │   ├── column.ts         # Single loop column
│   │   └── header.ts         # Status bar
│   └── types/
│       └── index.ts          # Shared types
├── prompts/
│   ├── enumerate.md
│   ├── plan.md
│   ├── build.md
│   └── review.md
└── .c2/                      # Runtime state (gitignored)
```

**Key dependencies:**
- `@anthropic-ai/claude-code` - Agent SDK
- `commander` - CLI parsing
- `ink` + `ink-box` - TUI rendering
- `zod` - State validation

## Key Differentiators from Standard Ralph

1. **Parallel execution** - Independent tasks run concurrently
2. **Programmatic orchestration** - Not just a bash loop
3. **Effort-based review frequency** - Configurable quality vs speed tradeoff
4. **TUI for monitoring** - Multi-column view of all running loops
5. **Stuck detection** - Automatic detection and escalation of stuck loops
