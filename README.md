# Claude Squad

AI orchestration system that coordinates multiple Claude Code agents to implement software from specs. Breaks work into tasks, plans execution order, spawns parallel agents in isolated git worktrees, and merges results.

## Development

```bash
npm install           # Install dependencies
npm run build         # Compile TypeScript to dist/
npm run dev           # Run directly with tsx
npm run test          # Run all tests
npm run lint          # Run biome linter
npm run typecheck     # Type check without emitting
```

**Prerequisites**: Node.js 20+, Git, Claude Code CLI with API access

## Usage

```bash
# Basic run
sq --spec feature.md --effort medium

# Preview without executing
sq --spec feature.md --dry-run

# With terminal UI
sq --spec feature.md --tui

# Resume interrupted run
sq --spec feature.md --resume

# Debug tracing
sq --spec feature.md --debug

# Cleanup
sq clean --all
```

**Key flags**: `--effort low|medium|high|max`, `--no-worktrees`, `--reset`, `--max-loops <n>`

## Architecture

See [CLAUDE.md](CLAUDE.md) for detailed documentation.

**Phases**: ANALYZE → ENUMERATE → PLAN → BUILD → [CONFLICT] → [REVIEW] → [REVISE] → COMPLETE

**State**: SQLite in `.sq/state.db` - tasks, loops, reviews, costs

**Worktrees**: Each agent works in isolated git worktree (`sq/<runId>/<loopId>`)

## License

MIT
