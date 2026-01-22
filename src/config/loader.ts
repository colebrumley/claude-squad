import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { DEFAULT_PRESETS } from './effort.js';
import { type ConfigFile, ConfigSchema, type PresetConfig } from './schema.js';

/**
 * Load configuration from a YAML file or return built-in defaults.
 *
 * Resolution order:
 * 1. If configPath specified, load that file (error if not found)
 * 2. Else if sq.yaml exists in projectRoot, load it
 * 3. Else return built-in defaults
 *
 * @param configPath - Explicit path to config file (from --config flag)
 * @param projectRoot - Project root directory (defaults to cwd)
 */
export function loadConfig(configPath?: string, projectRoot: string = process.cwd()): ConfigFile {
  // Explicit path provided
  if (configPath) {
    if (!existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    return parseAndValidate(configPath);
  }

  // Check default location
  const defaultPath = join(projectRoot, 'sq.yaml');
  if (existsSync(defaultPath)) {
    return parseAndValidate(defaultPath);
  }

  // Return built-in defaults
  return { presets: DEFAULT_PRESETS };
}

/**
 * Parse YAML file and validate against schema.
 */
function parseAndValidate(path: string): ConfigFile {
  const content = readFileSync(path, 'utf-8');
  const parsed = parseYaml(content);
  return ConfigSchema.parse(parsed);
}

/**
 * Get a preset by name from the config.
 *
 * @param config - Loaded config file
 * @param name - Preset name (e.g., 'medium', 'high')
 * @throws Error if preset not found
 */
export function getPreset(config: ConfigFile, name: string): PresetConfig {
  const preset = config.presets[name];
  if (!preset) {
    const available = Object.keys(config.presets).join(', ');
    throw new Error(`Preset "${name}" not found. Available: ${available}`);
  }
  return preset;
}
