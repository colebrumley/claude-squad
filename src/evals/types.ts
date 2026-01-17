// Types for the eval system

/** Input data for a test case */
export interface TestCaseInput {
  spec: string;
  [key: string]: unknown;
}

/** Grading configuration for a test case */
export interface GradeConfig {
  criteria: string[];
  rubric: string;
}

/** A single test case definition */
export interface TestCase {
  id: string;
  description: string;
  input: TestCaseInput;
  grade: GradeConfig;
}

/** A test suite loaded from YAML */
export interface TestSuite {
  name: string;
  prompt: string;
  cases: TestCase[];
}

/** Result of LLM-as-judge grading */
export interface GradeResult {
  score: number;
  normalizedScore: number;
  reasoning: string;
  criteriaMet: string[];
  criteriaMissed: string[];
}

/** Result of running a single test case */
export interface TestCaseResult {
  caseId: string;
  description: string;
  output: string;
  grade: GradeResult;
  costUsd: number;
  durationMs: number;
}

/** Result of running a full test suite */
export interface TestSuiteResult {
  name: string;
  prompt: string;
  cases: TestCaseResult[];
  averageScore: number;
  averageNormalizedScore: number;
  totalCostUsd: number;
  totalDurationMs: number;
  timestamp: string;
}

/** Full eval run result (multiple suites) */
export interface EvalRunResult {
  timestamp: string;
  suites: TestSuiteResult[];
  overallAverageScore: number;
  totalCostUsd: number;
  totalDurationMs: number;
}

/** Baseline data for regression testing */
export interface Baseline {
  timestamp: string;
  scores: Record<string, number>;
}

/** A/B comparison result for a single case */
export interface ComparisonCaseResult {
  caseId: string;
  description: string;
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B' | 'tie';
}

/** A/B comparison result for a full suite */
export interface ComparisonResult {
  promptA: string;
  promptB: string;
  cases: ComparisonCaseResult[];
  averageScoreA: number;
  averageScoreB: number;
  winner: 'A' | 'B' | 'tie';
  percentDiff: number;
}
