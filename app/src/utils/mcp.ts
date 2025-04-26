import { MCPClient } from '../client/src/services/mcp-client';
import { McpConfig, SetupConfig } from '../client/src/types';
import fs from 'fs';
import path from 'path';
import { MCP_CONFIG_FILE } from '../client/src/config/constants';

let mcpClient: MCPClient | null = null;

function isSetupComplete(): boolean {
  // Try development path first
  let setupConfigPath = path.join(__dirname, '..', 'src', 'client', 'setup-config.json');
  
  // If not found, try production path
  if (!fs.existsSync(setupConfigPath)) {
    setupConfigPath = path.join(__dirname, '..', 'client', 'setup-config.json');
  }
  
  console.log('Checking setup config at:', setupConfigPath);
  return fs.existsSync(setupConfigPath);
}

export async function initializeMCP(): Promise<void> {
  if (mcpClient) return;

  if (!isSetupComplete()) {
    throw new Error('Client setup not completed. Please run npm run setup first.');
  }

  try {
    // Try development paths first
    let clientDir = path.join(__dirname, '..', 'src', 'client');
    let mcpConfigPath = path.join(clientDir, MCP_CONFIG_FILE);
    let setupConfigPath = path.join(clientDir, 'setup-config.json');

    // If not found, try production paths
    if (!fs.existsSync(mcpConfigPath)) {
      clientDir = path.join(__dirname, '..', 'client');
      mcpConfigPath = path.join(clientDir, MCP_CONFIG_FILE);
      setupConfigPath = path.join(clientDir, 'setup-config.json');
    }

    const mcpConfig = JSON.parse(
      fs.readFileSync(mcpConfigPath, 'utf-8')
    ) as McpConfig;
    
    const setupConfig = JSON.parse(
      fs.readFileSync(setupConfigPath, 'utf-8')
    ) as SetupConfig;

    // Initialize client
    mcpClient = new MCPClient();
    await mcpClient.connectToServers(mcpConfig, setupConfig);
  } catch (error) {
    console.error('Failed to initialize MCP:', error);
    throw error;
  }
}

export async function makeQuery(query: string): Promise<string> {
  if (!isSetupComplete()) {
    throw new Error('Client setup not completed. Please run npm run setup first.');
  }

  if (!mcpClient) {
    await initializeMCP();
  }
  
  if (!mcpClient) {
    throw new Error('Failed to initialize MCP client');
  }

  try {
    return await mcpClient.processQuery(query);
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
}

export async function cleanup(): Promise<void> {
  if (mcpClient) {
    await mcpClient.cleanup();
    mcpClient = null;
  }
} 