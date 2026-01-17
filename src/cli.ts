import { Command } from 'commander';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('sq')
    .description('Claude Squad - AI orchestrator with parallel agent loops')
    .requiredOption('--spec <path>', 'Path to spec file')
    .option('--effort <level>', 'Effort level: low|medium|high|max', 'medium')
    .option('--max-loops <n>', 'Max concurrent parallel loops', '4')
    .option('--max-iterations <n>', 'Max iterations per loop', '20')
    .option('--state-dir <path>', 'State directory', '.sq')
    .option('--resume', 'Resume existing run', false)
    .option('--reset', 'Discard state and start fresh', false)
    .option('--dry-run', 'Show what would happen', false)
    .option('--tui', 'Run with TUI interface', false)
    .option('--no-worktrees', 'Disable git worktree isolation', false);

  return program;
}
