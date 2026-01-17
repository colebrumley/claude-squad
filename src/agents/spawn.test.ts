import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createAgentConfig } from './spawn.js';

describe('Agent Spawning', () => {
  test('createAgentConfig returns valid config for enumerate phase', () => {
    const config = createAgentConfig('enumerate', '/path/to/project');

    assert.strictEqual(config.cwd, '/path/to/project');
    assert.ok(config.allowedTools.includes('Read'));
    assert.ok(config.allowedTools.includes('Glob'));
    assert.strictEqual(config.permissionMode, 'bypassPermissions');
  });

  test('createAgentConfig for build includes Edit and Bash', () => {
    const config = createAgentConfig('build', '/path/to/project');

    assert.ok(config.allowedTools.includes('Edit'));
    assert.ok(config.allowedTools.includes('Bash'));
  });
});
