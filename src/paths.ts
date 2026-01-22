import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Root directory of the gang-of-ralphs installation.
 * Works whether running from dist/ (compiled) or src/ (tsx dev mode).
 */
export const SQ_ROOT = resolve(__dirname, '..');

/**
 * Path to the MCP server entry point.
 */
export const MCP_SERVER_PATH = resolve(SQ_ROOT, 'dist/mcp/index.js');
