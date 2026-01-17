export type { DebugTracer, DebugEvent, TraceFile } from './types.js';
export { createNoopTracer } from './noop-tracer.js';
export { createFileTracer } from './file-tracer.js';

import type { DebugTracer } from './types.js';
import { createNoopTracer } from './noop-tracer.js';
import { createFileTracer } from './file-tracer.js';

export function createTracer(debug: boolean, stateDir: string): DebugTracer {
  return debug ? createFileTracer(stateDir) : createNoopTracer();
}
