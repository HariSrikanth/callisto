import path from 'path';

export function getProjectRoot(): string {
  return process.cwd();
}

export function getSetupConfigPath(): string {
  return path.join(getProjectRoot(), 'setup-config.json');
} 