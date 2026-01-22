#!/usr/bin/env node
import { createDatabase } from '../db/index.js';
import { startMCPServer } from './server.js';

// MCP server is started with run ID as argument
const runId = process.argv[2];
const dbPath = process.argv[3] || '.ralphs/state.db';

if (!runId) {
  console.error('Usage: ralphs-mcp <run-id> [db-path]');
  process.exit(1);
}

createDatabase(dbPath);

startMCPServer(runId, dbPath)
  .then((server) => {
    // Register graceful shutdown handlers
    const shutdown = async () => {
      try {
        await server.close();
      } catch {
        // Ignore close errors during shutdown
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Handle unexpected errors after startup
    server.onerror = (error) => {
      console.error('MCP server error:', error.message);
    };

    server.onclose = () => {
      process.exit(0);
    };
  })
  .catch((error) => {
    console.error('Failed to start MCP server:', error.message);
    process.exit(1);
  });
