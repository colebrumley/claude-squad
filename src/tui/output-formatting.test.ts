import assert from 'node:assert';
import { describe, test } from 'node:test';
import {
  classifyOutputLine,
  getOutputLineColor,
  shouldDimOutputLine,
} from './output-formatting.js';

describe('Output Formatting Utilities', () => {
  describe('classifyOutputLine', () => {
    test('classifies thinking lines', () => {
      assert.strictEqual(classifyOutputLine('[thinking] some thought'), 'thinking');
      assert.strictEqual(classifyOutputLine('[thinking]'), 'thinking');
      assert.strictEqual(classifyOutputLine('[thinking] '), 'thinking');
    });

    test('classifies tool lines', () => {
      assert.strictEqual(classifyOutputLine('[tool] starting Read'), 'tool');
      assert.strictEqual(classifyOutputLine('[tool] Grep (2.5s)'), 'tool');
      assert.strictEqual(classifyOutputLine('[tool]'), 'tool');
    });

    test('classifies review lines', () => {
      assert.strictEqual(classifyOutputLine('[review] Reviewing task completion...'), 'review');
      assert.strictEqual(classifyOutputLine('[review]'), 'review');
    });

    test('classifies regular text lines', () => {
      assert.strictEqual(classifyOutputLine('Some regular output'), 'text');
      assert.strictEqual(classifyOutputLine(''), 'text');
      assert.strictEqual(classifyOutputLine('TASK_COMPLETE'), 'text');
    });

    test('does not misclassify lines with brackets elsewhere', () => {
      assert.strictEqual(classifyOutputLine('Using [tool] in sentence'), 'text');
      assert.strictEqual(classifyOutputLine('  [thinking] with leading space'), 'text');
    });
  });

  describe('getOutputLineColor', () => {
    test('returns magenta for thinking lines', () => {
      assert.strictEqual(getOutputLineColor('[thinking] analyzing...'), 'magenta');
    });

    test('returns cyan for tool lines', () => {
      assert.strictEqual(getOutputLineColor('[tool] starting Read'), 'cyan');
      assert.strictEqual(getOutputLineColor('[tool] Grep (1.5s)'), 'cyan');
    });

    test('returns blue for review lines', () => {
      assert.strictEqual(getOutputLineColor('[review] Reviewing task completion...'), 'blue');
    });

    test('returns undefined for regular text', () => {
      assert.strictEqual(getOutputLineColor('Regular output'), undefined);
      assert.strictEqual(getOutputLineColor(''), undefined);
    });
  });

  describe('shouldDimOutputLine', () => {
    test('returns false for thinking lines (use color instead)', () => {
      assert.strictEqual(shouldDimOutputLine('[thinking] analyzing...'), false);
    });

    test('returns false for tool lines (use color instead)', () => {
      assert.strictEqual(shouldDimOutputLine('[tool] starting Read'), false);
    });

    test('returns false for review lines (use color instead)', () => {
      assert.strictEqual(shouldDimOutputLine('[review] Reviewing task completion...'), false);
    });

    test('returns true for regular text lines', () => {
      assert.strictEqual(shouldDimOutputLine('Regular output'), true);
      assert.strictEqual(shouldDimOutputLine('TASK_COMPLETE'), true);
    });
  });
});

describe('Output Line Classification Integration', () => {
  test('all line types have consistent behavior', () => {
    const lines = [
      {
        line: '[thinking] analyzing...',
        expectedType: 'thinking',
        expectedColor: 'magenta',
        expectedDim: false,
      },
      {
        line: '[tool] starting Read',
        expectedType: 'tool',
        expectedColor: 'cyan',
        expectedDim: false,
      },
      {
        line: '[tool] Read (2.5s)',
        expectedType: 'tool',
        expectedColor: 'cyan',
        expectedDim: false,
      },
      {
        line: '[review] Reviewing task completion...',
        expectedType: 'review',
        expectedColor: 'blue',
        expectedDim: false,
      },
      {
        line: 'Regular text output',
        expectedType: 'text',
        expectedColor: undefined,
        expectedDim: true,
      },
      { line: 'TASK_COMPLETE', expectedType: 'text', expectedColor: undefined, expectedDim: true },
      { line: '', expectedType: 'text', expectedColor: undefined, expectedDim: true },
    ];

    for (const { line, expectedType, expectedColor, expectedDim } of lines) {
      assert.strictEqual(
        classifyOutputLine(line),
        expectedType,
        `Line "${line}" should be classified as "${expectedType}"`
      );
      assert.strictEqual(
        getOutputLineColor(line),
        expectedColor,
        `Line "${line}" should have color "${expectedColor}"`
      );
      assert.strictEqual(
        shouldDimOutputLine(line),
        expectedDim,
        `Line "${line}" dimmed should be ${expectedDim}`
      );
    }
  });
});
