# Dry Run Mode for Claude Squad

Add a `--dry-run` flag that simulates orchestration without spawning agents or making changes, useful for validating specs and estimating costs before committing resources.

## Background

When working with large specs, users want to preview what sq will do before running expensive agent operations. A dry-run mode should enumerate tasks and create a plan, then report what would happen without executing the BUILD phase.

## Requirements

### CLI Changes

1. Add `--dry-run` boolean flag to the CLI in `src/cli.ts`
2. When enabled, pass `dryRun: true` to the orchestrator configuration
3. Display a summary at the end showing:
   - Total tasks that would be created
   - Planned execution groups
   - Estimated agent spawns

### Orchestrator Changes

4. Modify `src/orchestrator/index.ts` to accept `dryRun` option
5. In dry-run mode, stop after PLAN phase completes (skip BUILD entirely)
6. Set final phase to `COMPLETE` with a `dryRun: true` flag in state

### State Changes

7. Add `dryRun?: boolean` field to the run state in `src/state/index.ts`
8. Update Zod schema to include the new field
9. Add test for state serialization with dry-run flag

### Output Summary

10. Create `src/orchestrator/summary.ts` with a `printDryRunSummary(state)` function
11. Summary should include:
    - List of enumerated tasks with their IDs and descriptions
    - Dependency graph visualization (text-based)
    - Planned execution groups showing parallelization
    - Estimated total agent invocations

### Tests

12. Add CLI test for `--dry-run` flag parsing in `src/cli.test.ts`
13. Add orchestrator test verifying BUILD phase is skipped in dry-run mode
14. Add summary output test with fixture data

## Non-Goals

- Cost estimation in dollars (would require API pricing integration)
- Interactive approval after dry-run (separate feature)
- Partial dry-run (running some phases but not others)

## Example Usage

```bash
# Preview what would happen without executing
./bin/sq --spec feature.md --effort medium --dry-run

# Output:
# === DRY RUN SUMMARY ===
#
# Tasks (5):
#   [1] Create user model - depends on: none
#   [2] Add validation logic - depends on: 1
#   [3] Create API endpoint - depends on: 1
#   [4] Add authentication middleware - depends on: none
#   [5] Write integration tests - depends on: 2, 3, 4
#
# Execution Plan:
#   Group 1 (parallel): [1, 4]
#   Group 2 (parallel): [2, 3]
#   Group 3: [5]
#
# Estimated agent spawns: 5
# Estimated iterations: 3 groups
```
