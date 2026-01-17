#!/usr/bin/env node
import { createDatabase } from '../db/index.js';
import { startMCPServer } from './server.js';

// MCP server is started with run ID as argument
const runId = process.argv[2];
const dbPath = process.argv[3] || '.sq/state.db';

if (!runId) {
  console.error('Usage: sq-mcp <run-id> [db-path]');
  process.exit(1);
}

createDatabase(dbPath);
startMCPServer(runId, dbPath).catch(console.error);
