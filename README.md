# Claude Squad (sq)

An AI orchestrator that coordinates multiple Claude Code agents to implement software from specifications. Give it a spec, and it breaks it into tasks, plans execution order, spawns parallel agents, and manages the entire workflow.

## Installation

```bash
npm install
npm run build
```

## Quick Start

1. Write a spec file describing what you want to build:

```markdown
# User Authentication

Add user authentication to the application.

## Requirements

1. Create a User model with email and password fields
2. Add password hashing with bcrypt
3. Create login and registration API endpoints
4. Add JWT token generation and validation
5. Write tests for all authentication flows
```

2. Run sq:

```bash
./bin/sq --spec auth-spec.md --effort medium --tui
```

3. Watch as sq:
   - Enumerates discrete tasks from your spec
   - Plans execution order based on dependencies
   - Spawns parallel agents to implement each task
   - Merges changes and resolves conflicts
   - Reviews the completed work

## Writing Specs

Specs are markdown files that describe what you want built. Good specs include:

- **Clear requirements** - Numbered list of discrete features
- **File locations** - Where code should go (e.g., "Create `src/auth/login.ts`")
- **Dependencies** - What existing code to integrate with
- **Test expectations** - What tests should verify

See `examples/` for sample specs.

## CLI Options

```bash
./bin/sq --spec <path>              # Required: path to spec file
         --effort <level>           # low|medium|high|max (default: medium)
         --max-loops <n>            # Max concurrent parallel agents (default: 4)
         --max-iterations <n>       # Max iterations per agent loop (default: 20)
         --state-dir <path>         # State directory (default: .sq/)
         --resume                   # Resume existing run
         --reset                    # Discard state, start fresh
         --dry-run                  # Preview what would happen
         --tui                      # Enable terminal UI
         --no-worktrees             # Disable git worktree isolation
```

## Effort Levels

The `--effort` flag controls how thoroughly sq reviews work:

| Level | When to Use | Review Behavior |
|-------|-------------|-----------------|
| `low` | Fast iteration, trusted specs | Reviews only at the end |
| `medium` | Default, balanced approach | Reviews after planning |
| `high` | Critical features, complex specs | Reviews after each major phase |
| `max` | Production code, full validation | Reviews every iteration |

Higher effort means more thorough validation but longer execution time.

## TUI Mode

Run with `--tui` for a multi-column terminal interface showing:

- Overall progress and current phase
- Active agent loops with their tasks
- Streaming output from each agent
- Keyboard shortcuts for control

```
┌─────────────────────────────────────────────────────────────────────┐
│  Claude Squad │ phase: BUILD │ effort: medium │ loops: 2/4 │ tasks: 3/8 │
├───────────────────────┬─────────────────────────────────────────────┤
│ Loop 1: auth          │ Loop 2: api                                 │
│ task: password hash   │ task: create endpoints                      │
│ iter: 3/20 ✓ passing  │ iter: 5/20 ⟳ running                        │
├───────────────────────┼─────────────────────────────────────────────┤
│ > Adding bcrypt...    │ > Writing POST /login handler...            │
│ > Updating User model │ > Adding validation middleware              │
└───────────────────────┴─────────────────────────────────────────────┘
```

## Git Worktree Isolation

By default, parallel agents work in isolated git worktrees to prevent conflicts. Each agent gets its own branch (`sq/<runId>/<loopId>`) and directory.

When agents complete, their changes merge back to the base branch. If conflicts occur, sq spawns a dedicated agent to resolve them.

Disable with `--no-worktrees` for simpler single-agent runs or when git isolation isn't needed.

## Cleanup

sq creates worktrees and branches that persist after runs. Clean them up with:

```bash
./bin/sq clean --all            # Remove all sq worktrees and branches
./bin/sq clean --run <id>       # Remove worktrees for a specific run
```

## State and Resume

sq saves state to `.sq/` between invocations. This enables:

- **Resume** - Continue where you left off after interruption
- **Inspection** - View tasks, progress, and agent outputs
- **Debugging** - Understand what happened when something fails

Use `--reset` to discard state and start fresh.

## Dry Run

Preview what sq would do without actually spawning agents:

```bash
./bin/sq --spec feature.md --dry-run
```

This runs ENUMERATE and PLAN phases, then prints:
- Tasks that would be created
- Dependency relationships
- Planned execution groups
- Estimated agent spawns

## How It Works

sq operates as a state machine with these phases:

1. **ENUMERATE** - Reads your spec and breaks it into discrete tasks
2. **PLAN** - Analyzes dependencies and groups tasks for parallel execution
3. **BUILD** - Spawns Claude Code agents to implement each task
4. **CONFLICT** - Resolves any merge conflicts between parallel agents
5. **REVIEW** - Validates completed work (depth depends on effort level)
6. **REVISE** - Re-enters BUILD if review finds issues

The orchestrator is stateless per invocation - it loads state, executes one phase step, saves state, and exits. An outer loop continuously restarts it until completion.

## License

ISC
