# Eval System Design

Date: 2026-01-17

## Overview

A comprehensive eval system for testing C2 prompts with:
- **Regression testing**: Catch prompt changes that break expected behavior
- **Output quality scoring**: LLM-as-judge grading against rubrics
- **A/B comparison**: Compare prompt variants side-by-side

## Test Case Format

Test cases are YAML files in `evals/cases/`. Each file defines scenarios for a prompt:

```yaml
# evals/cases/enumerate.yaml
name: enumerate
prompt: ENUMERATE_PROMPT_JSON
cases:
  - id: simple-feature
    description: "Basic feature with 2 requirements"
    input:
      spec: |
        # Greeting Feature
        Create a greet(name) function.
        ## Requirements
        1. Return "Hello, {name}!"
        2. Handle empty name
    grade:
      criteria:
        - "Creates at least 2 tasks"
        - "Tasks have clear titles and descriptions"
        - "Dependencies are correctly identified"
      rubric: |
        5: All criteria met, tasks are well-scoped
        3: Most criteria met, minor issues
        1: Missing tasks or incorrect dependencies

  - id: complex-multi-file
    description: "Multi-file feature with dependencies"
    input:
      spec: |
        # User Auth System
        Add login/logout with JWT tokens.
        ...
    grade:
      criteria:
        - "Identifies auth, token, and middleware tasks"
        - "Correct dependency ordering"
      rubric: |
        5: Complete task breakdown with proper deps
        3: Missing some tasks or deps
        1: Major gaps in task identification
```

## Architecture

```
src/evals/
├── index.ts          # CLI entry point
├── loader.ts         # Load YAML test cases
├── runner.ts         # Execute prompts against cases
├── grader.ts         # LLM-as-judge scoring
├── reporter.ts       # Generate reports (console, JSON, markdown)
├── compare.ts        # A/B comparison logic
├── regression.ts     # Baseline comparison
└── types.ts          # TypeScript interfaces

evals/
├── cases/            # YAML test case definitions
│   ├── enumerate.yaml
│   ├── plan.yaml
│   ├── build.yaml
│   └── review.yaml
├── prompts/          # A/B testing prompt variants
│   └── enumerate-v2.txt
├── results/          # Timestamped run results
│   └── 2026-01-17-143022.json
└── baseline.json     # Regression baseline
```

## Execution Flow

1. `loader.ts` reads YAML files from `evals/cases/`
2. `runner.ts` executes each case against the prompt using `query()` from claude-agent-sdk
3. `grader.ts` sends outputs to Claude with the rubric, gets a 1-5 score + reasoning
4. `reporter.ts` aggregates results and outputs summary
5. Results saved to `evals/results/YYYY-MM-DD-HHmmss.json` for regression tracking

## LLM-as-Judge Grading

The grader sends each output to Claude (Haiku for cost efficiency):

```typescript
const GRADER_PROMPT = `You are evaluating an AI's response.

## Task Description
{{caseDescription}}

## Grading Criteria
{{criteria}}

## Rubric
{{rubric}}

## AI Output
{{output}}

Evaluate the output and respond with JSON:
{
  "score": <1-5>,
  "reasoning": "<why this score>",
  "criteria_met": ["<criterion 1>", ...],
  "criteria_missed": ["<criterion N>", ...]
}`;
```

**Design choices:**
- Uses Haiku for grading to reduce costs
- Each criterion checked individually for clear feedback
- Reasoning captured for debugging prompt issues
- Scores normalized to 0-1 for aggregation

## A/B Comparison

Prompt variants stored in `evals/prompts/` as separate files:

```
evals/prompts/
├── enumerate-v1.txt    # Current production prompt
├── enumerate-v2.txt    # Experimental variant
```

Compare command:
```bash
npm run eval -- --compare enumerate-v1 enumerate-v2
```

Output:
```
Case                    | v1 Score | v2 Score | Winner
------------------------|----------|----------|--------
simple-feature          |    4.2   |    4.8   | v2
complex-multi-file      |    3.5   |    3.2   | v1
edge-case-empty         |    5.0   |    5.0   | tie
------------------------|----------|----------|--------
Average                 |    4.2   |    4.3   | v2 (+2.4%)
```

## Regression Testing

Results saved with timestamps. The `--baseline` flag marks current results as reference:

```bash
npm run eval -- --baseline  # Saves to evals/baseline.json
npm run eval -- --check     # Compares against baseline, exits 1 if regression
```

Regression threshold: fail if any prompt's average score drops by more than 0.5 points (configurable).

## CLI Usage

```bash
npm run eval                     # Run all evals
npm run eval -- --case enumerate # Run specific prompt
npm run eval -- --compare v1 v2  # A/B compare two prompt versions
npm run eval -- --baseline       # Save current results as regression baseline
npm run eval -- --check          # Fail if scores drop vs baseline
```

## Dependencies

Only `yaml` package needed for parsing - everything else uses existing deps.

## Implementation Order

1. `types.ts` - Define interfaces
2. `loader.ts` - YAML parsing
3. `runner.ts` - Prompt execution
4. `grader.ts` - LLM-as-judge
5. `reporter.ts` - Console output
6. `index.ts` - CLI wiring
7. `compare.ts` - A/B comparison
8. `regression.ts` - Baseline checking
9. Create initial test cases in `evals/cases/`
