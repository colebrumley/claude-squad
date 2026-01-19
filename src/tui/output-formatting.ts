/**
 * Output message formatting utilities for the TUI.
 * Centralizes the logic for formatting and classifying different message types.
 */

export type OutputMessageType = 'thinking' | 'tool' | 'review' | 'text';

/**
 * Classify an output line by its type.
 */
export function classifyOutputLine(line: string): OutputMessageType {
  if (line.startsWith('[thinking]')) {
    return 'thinking';
  }
  if (line.startsWith('[tool]')) {
    return 'tool';
  }
  if (line.startsWith('[review]')) {
    return 'review';
  }
  return 'text';
}

/**
 * Get the color for an output line based on its type.
 */
export function getOutputLineColor(line: string): string | undefined {
  const type = classifyOutputLine(line);
  switch (type) {
    case 'thinking':
      return 'magenta';
    case 'tool':
      return 'cyan';
    case 'review':
      return 'blue';
    default:
      return undefined;
  }
}

/**
 * Determine if an output line should be dimmed.
 */
export function shouldDimOutputLine(line: string): boolean {
  const type = classifyOutputLine(line);
  return type === 'text';
}
