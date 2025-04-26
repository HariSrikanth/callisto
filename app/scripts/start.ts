import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { SpawnOptions } from 'child_process';
import { fileURLToPath } from 'url';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the root directory (one level up from scripts)
const rootDir = path.join(__dirname, '..');
const clientPath = path.join(rootDir, 'src', 'client');
const outClientPath = path.join(rootDir, 'out', 'client');

// Debug logging
console.log('Root directory:', rootDir);
console.log('Client directory:', clientPath);
console.log('Out client directory:', outClientPath);

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  const options: SpawnOptions = {
    cwd,
    stdio: 'inherit',
    shell: true
  };

  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, options);
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    childProcess.on('error', reject);
  });
}

async function ensureConfigFiles(): Promise<void> {
  try {
    // Create out/client directory if it doesn't exist
    await fs.mkdir(outClientPath, { recursive: true });

    // Always copy mcp-config.json
    const mcpConfigSrc = path.join(clientPath, 'mcp-config.json');
    const mcpConfigDest = path.join(outClientPath, 'mcp-config.json');
    await fs.copyFile(mcpConfigSrc, mcpConfigDest);
    console.log('Copied mcp-config.json to out/client');

    // Copy setup-config.json if it exists
    const setupConfigSrc = path.join(clientPath, 'setup-config.json');
    const setupConfigDest = path.join(outClientPath, 'setup-config.json');
    
    try {
      await fs.access(setupConfigSrc);
      await fs.copyFile(setupConfigSrc, setupConfigDest);
      console.log('Copied setup-config.json to out/client');
    } catch (error) {
      console.log('setup-config.json not found in src/client - skipping copy');
    }

    // Copy chat_history.json if it exists
    const chatHistorySrc = path.join(clientPath, 'chat_history.json');
    const chatHistoryDest = path.join(outClientPath, 'chat_history.json');
    
    try {
      await fs.access(chatHistorySrc);
      await fs.copyFile(chatHistorySrc, chatHistoryDest);
      console.log('Copied chat_history.json to out/client');
    } catch (error) {
      console.log('chat_history.json not found in src/client - skipping copy');
    }
  } catch (error) {
    console.error('Error copying config files:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    // Ensure config files are in place
    await ensureConfigFiles();

    // Start the app
    console.log('Starting the app...');
    await runCommand('npm', ['run', 'start:app'], rootDir);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 