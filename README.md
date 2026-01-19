# Claude Squad

An AI orchestration system that coordinates multiple Claude Code agents to implement software from specifications. Give it a spec file, and it breaks the work into tasks, plans execution order, spawns parallel agents in isolated git worktrees, and merges the results.

## Why Claude Squad?

- **Parallel execution** - Multiple agents work simultaneously on independent tasks
- **Git isolation** - Each agent works in its own worktree, preventing conflicts
- **Automatic conflict resolution** - When merges conflict, a dedicated agent resolves them
- **Multi-tier quality control** - Per-loop reviews after each task plus periodic checkpoint reviews
- **Intent-driven validation** - Reviews check if implementation serves user intent, not just literal spec
- **Stateless orchestration** - Resume interrupted runs; state persists to SQLite
- **Cost management** - Three-tier cost limits (per-loop, per-phase, per-run) prevent runaway spending

## Quick Start

```bash
# Clone and build
git clone https://github.com/colebrumley/claude-squad.git
cd claude-squad
npm install && npm run build
npm link  # Creates global 'sq' command

# Run on a spec file
sq --spec feature.md --effort medium --tui
```

## Installation

```bash
git clone https://github.com/colebrumley/claude-squad.git
cd claude-squad
npm install
npm run build
npm link  # Creates global 'sq' command
```

### Prerequisites

- Node.js 20+
- Git (for worktree isolation)
- Claude Code CLI configured with API access

## Usage

```bash
sq --spec <path> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--spec <path>` | Path to spec file (required) | - |
| `--effort <level>` | Quality level: `low`, `medium`, `high`, `max` | `medium` |
| `--tui` | Show terminal UI with live progress | off |
| `--dry-run` | Preview tasks and plan without executing | off |
| `--no-worktrees` | Disable git worktree isolation | off |
| `--resume` | Resume an interrupted run | off |
| `--reset` | Discard state and start fresh | off |
| `--max-loops <n>` | Max concurrent parallel agents | 4 |
| `--max-iterations <n>` | Max iterations per agent loop | 20 |
| `--state-dir <path>` | State directory | `.sq` |
| `--debug` | Enable debug tracing to `.sq/debug/<runId>/` | off |

### Examples

```bash
# Preview what would happen
sq --spec feature.md --dry-run

# Run with live UI
sq --spec feature.md --effort high --tui

# Simple single-agent run (no worktrees)
sq --spec bugfix.md --no-worktrees

# Resume after interruption
sq --spec feature.md --resume

# Debug mode (traces prompts/responses to .sq/debug/)
sq --spec feature.md --debug

# Clean up worktrees
sq clean --all              # Remove all sq worktrees
sq clean --run <id>         # Remove worktrees for specific run
```

## Effort Levels

The `--effort` flag controls how thoroughly sq reviews work:

| Level | When to Use | Review Behavior | Cost Limit |
|-------|-------------|-----------------|------------|
| `low` | Fast iteration, trusted specs | Reviews only at the end | $5/run |
| `medium` | Default, balanced approach | Reviews after planning + periodic checkpoints | $15/run |
| `high` | Critical features, complex specs | Reviews after each major phase + frequent checkpoints | $30/run |
| `max` | Production code, full validation | Reviews every iteration with comprehensive analysis | $100/run |

**What changes at higher effort levels:**
- More frequent reviews (every 10 → 5 → 3 → 1 iterations)
- Deeper review analysis (shallow → standard → deep → comprehensive)
- Stricter stuck detection (5 → 4 → 3 → 2 repeated errors)
- More powerful models (haiku → sonnet → opus)
- Higher cost limits but stricter per-loop/per-phase caps

## Writing Specs

Specs are markdown files describing what to build. See [docs/writing-specs.md](docs/writing-specs.md) for the full guide.

Good specs include:
- **Clear requirements** - Numbered list of discrete features
- **File locations** - Where code should go (e.g., "Create `src/auth/login.ts`")
- **Dependencies** - What existing code to integrate with
- **Test expectations** - What tests should verify
- **Intent context** - Why you want this (helps reviews catch over-engineering)

Minimal example:

```markdown
# Greeting Module

Create a greeting utility for our application.

## Requirements

1. Create `src/greet.ts` with a `greet(name: string)` function
2. Return "Hello, {name}!" for valid names
3. Return "Hello, World!" for empty string
4. Add tests in `src/greet.test.ts`

## Intent

We need a simple, consistent way to generate greeting messages across the app. Keep it simple - no i18n, no formatting options.
```

See `examples/` for more sample specs.

## How It Works

sq operates as a state machine with these phases:

### 1. Enumerate
Reads your spec and breaks it into discrete tasks. Agent uses read-only tools to explore the codebase and calls `write_task()` for each task. Detects empty projects and includes scaffold instructions only when needed.

### 2. Plan
Analyzes task dependencies and groups tasks for parallel execution. Agent calls `add_plan_group()` to create execution groups. Group 0 runs first, then group 1, etc. Tasks in the same group run in parallel.

### 3. Build
Spawns parallel agents in isolated git worktrees to implement tasks. Each agent:
- Works in its own branch (`sq/<runId>/<loopId>`)
- Gets immediate review after completing each task
- Receives review feedback injected into next iteration
- Is monitored for stuck conditions (repeated errors, no progress, idle timeout)

**Per-loop reviews**: After each task completion, a review validates the work and checks if it serves the interpreted intent. Failed reviews increment revision attempts - exceeding the limit marks the loop as stuck.

### 4. Conflict
If worktree merges conflict, a dedicated agent resolves them. Gets conflict file list and uses standard git tools to resolve.

### 5. Review
Validates work quality at checkpoints (depends on effort level). Reviews check:
- Technical correctness (tests pass, code works)
- **Intent satisfaction** - Does this serve what the user actually wanted?
- Common issues: over-engineering, missing error handling, pattern violations, dead code, spec-intent mismatches

Reviews pass ONLY if both technical quality AND intent satisfaction are confirmed.

### 6. Revise
If review fails, analyzes issues and creates fix plan. Returns to BUILD phase with feedback context. Max revisions limit prevents infinite loops.

**Phase flow**:
```
ENUMERATE → [Review?] → PLAN → [Review?] → BUILD → [CONFLICT?] → [Review?] → [REVISE] → COMPLETE
```

The orchestrator is stateless per invocation - it loads state, executes one phase step, saves state, and exits. An outer loop continuously restarts it until completion.

## TUI Mode

Run with `--tui` for a terminal interface showing:

- Overall progress and current phase
- Active agent loops with their assigned tasks
- Task status breakdown with symbols:
  - ✓ completed
  - ○ pending
  - ● in progress
  - ✗ failed
- Real-time streaming output from each agent:
  - `[tool] starting <toolname>`
  - `[tool] <toolname> (2.5s)` (on completion)
  - `[thinking] <content>`
  - Text output from agents
- Cost tracking per loop and total
- Adaptive column layout (focused column takes full width)

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `q` | Quit (saves state for resume) |
| `p` | Pause/resume orchestration |
| `r` | Trigger immediate review |
| `1-4` | Focus on loop column (press again to unfocus) |

## Git Worktree Isolation

By default, parallel agents work in isolated git worktrees to prevent conflicts. Each agent gets its own branch (`sq/<runId>/<loopId>`) and directory (`.sq/worktrees/<loopId>`).

**How it works**:
1. Agent works in isolation, committing changes to its branch
2. Auto-commits before merge: `git commit -m "auto-commit before merge"`
3. Merges back to base branch with: `git merge --no-ff` (traceable history)
4. If conflicts occur, sq spawns a dedicated CONFLICT agent to resolve them
5. After completion, `sq clean` removes worktrees and branches

Disable with `--no-worktrees` for simpler single-agent runs or when git isolation isn't needed.

## State and Resume

sq saves state to `.sq/` between invocations. This enables:

- **Resume** - Continue where you left off after interruption (`sq --spec <path> --resume`)
- **Inspection** - View tasks, progress, and agent outputs in SQLite database
- **Debugging** - Understand what happened when something fails
- **Cost tracking** - Monitor spending at loop, phase, and run levels

State includes:
- Tasks with status and dependencies
- Execution plan groups
- Loop iteration counts and stuck indicators
- Review results and issues
- Context entries (discoveries, errors, decisions)
- Complete cost breakdown

Use `--reset` to discard state and start fresh.

## Debug Mode

Enable with `--debug` to write comprehensive traces to `.sq/debug/<runId>/`:

- `agent-calls.jsonl` - All agent invocations with full prompts, outputs, costs
- `mcp-calls.jsonl` - All MCP tool calls with inputs, results, durations
- `trace.jsonl` - Phase transitions, loop events, decisions, errors, state snapshots

Useful for understanding orchestrator behavior, debugging agent issues, and analyzing cost patterns.

## Cost Management

Three-tier enforcement prevents runaway costs:

1. **Per-loop limits** - Single agent cannot exceed budget (prevents one loop from burning all funds)
2. **Per-phase limits** - Total phase cost across all loops capped
3. **Per-run limits** - Hard cap on entire orchestrator run

| Effort | Per-loop | Per-phase | Per-run |
|--------|----------|-----------|---------|
| low | $1 | $2 | $5 |
| medium | $2 | $5 | $15 |
| high | $5 | $10 | $30 |
| max | $10 | $25 | $100 |

When exceeded: loop/phase/run terminates gracefully with error context saved to state.

## Advanced Features

### Intent-Driven Reviews

Reviews don't just check if code matches the spec literally - they ask "What was the user really trying to accomplish?" This catches:
- Over-engineering (user wanted simple function, got framework)
- Missing context (user wanted quick fix, got architectural change)
- Pattern violations (user follows specific conventions you missed)
- Dead code (implemented features that don't serve the goal)

Reviews store both `interpretedIntent` and `intentSatisfied` in the database.

### Per-Loop Review System

After each task completion, the agent's work gets an immediate review:
- Validates technical correctness
- Checks intent satisfaction
- Issues specific, actionable feedback
- Tracks revision attempts (failed reviews increment counter)
- Exceeding max revision attempts marks loop as stuck

This catches issues early before they compound in later phases.

### Stuck Detection

Loops are automatically marked stuck when:
- Same error repeats ≥ threshold times (2-5 depending on effort)
- No file changes in ≥ threshold+2 iterations
- Max iterations exceeded
- Idle timeout (no output for 5 minutes)
- Max revision attempts exceeded (per-loop reviews)

Stuck loops pause to prevent wasted cost and allow manual intervention.

### Empty Project Detection

sq detects empty/new codebases and includes scaffold instructions only when needed. Ignores common non-code files (.git, .gitignore, *.md, node_modules, etc.) to avoid unnecessary boilerplate in existing projects.

## Troubleshooting

### Agents appear stuck

Check `.sq/state.db` table `loops` for stuck indicators:
- `same_error_count` - How many times same error repeated
- `no_progress_count` - Iterations without file changes
- `last_activity_at` - When agent last produced output
- `last_error` - Most recent error message

Idle timeout triggers after 5 minutes with no output.

### Worktree errors

Clean up orphaned worktrees:
```bash
sq clean --all
git worktree prune
```

### Review keeps failing

Check `review_issues` table in `.sq/state.db` for specific problems. Look for:
- `type` - Category of issue (over-engineering, missing-error-handling, etc.)
- `description` - What's wrong
- `suggestion` - How to fix it
- `file` and `line` - Where to look

Per-loop reviews track `revisionAttempts` - check `loop_reviews` table.

### State corruption

Reset and start fresh:
```bash
sq --spec <path> --reset
# or manually
rm -rf .sq/
```

### High costs

Check cost breakdown:
```bash
sqlite3 .sq/state.db "SELECT phase, cost_usd FROM phase_costs WHERE run_id = '<runId>'"
sqlite3 .sq/state.db "SELECT id, cost_usd FROM loops WHERE run_id = '<runId>'"
```

With `--debug`, examine `agent-calls.jsonl` for token usage patterns.

### MCP server issues

If connections fail:
```bash
# Check for zombie processes
pkill -f "sq-mcp"

# Verify state directory
ls -la .sq/

# Reinitialize
sq --spec <path> --reset
```

## Development

```bash
npm install           # Install dependencies
npm run build         # Compile TypeScript to dist/
npm run dev           # Run directly with tsx
npm run test          # Run all tests
npm run lint          # Run biome linter
npm run typecheck     # Type check without emitting
```

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

## License

MIT
