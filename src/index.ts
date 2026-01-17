#!/usr/bin/env node
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { createCLI } from './cli.js';
import { loadState, initializeState } from './state/index.js';
import { runOrchestrator, getExitCode } from './orchestrator/index.js';

async function main() {
  const program = createCLI();
  program.parse();
  const opts = program.opts();

  // Validate spec file exists
  const specPath = resolve(opts.spec);
  try {
    await access(specPath);
  } catch {
    console.error(`Error: Spec file not found: ${specPath}`);
    process.exit(1);
  }

  const stateDir = resolve(opts.stateDir);

  // Load or initialize state
  let state = opts.reset ? null : await loadState(stateDir);

  if (!state) {
    state = initializeState({
      specPath,
      effort: opts.effort,
      stateDir,
      maxLoops: parseInt(opts.maxLoops, 10),
      maxIterations: parseInt(opts.maxIterations, 10),
    });
    console.log(`Initialized new run: ${state.runId}`);
  } else {
    console.log(`Resuming run: ${state.runId}`);
  }

  console.log(`Phase: ${state.phase}`);
  console.log(`Effort: ${state.effort}`);

  if (opts.dryRun) {
    console.log('[dry-run] Would execute phase:', state.phase);
    return;
  }

  if (state.phase === 'complete') {
    console.log('Run already complete!');
    process.exit(0);
  }

  // Run one phase
  state = await runOrchestrator(state, {
    onPhaseStart: (phase) => console.log(`Starting phase: ${phase}`),
    onPhaseComplete: (phase, success) =>
      console.log(`Phase ${phase} ${success ? 'completed' : 'failed'}`),
    onOutput: (text) => process.stdout.write(text),
    onLoopOutput: (loopId, text) =>
      console.log(`[${loopId.slice(0, 8)}] ${text}`),
  });

  const exitCode = getExitCode(state);

  if (state.phase === 'complete') {
    console.log('\n✓ All tasks completed successfully!');
  } else if (exitCode === 2) {
    console.log('\n⚠ Loop stuck - needs intervention');
  } else {
    console.log(`\nPhase complete. Next: ${state.phase}`);
    console.log('Run again to continue (or use outer Ralph loop)');
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
