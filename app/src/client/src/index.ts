import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { MCPClient } from "./services/mcp-client.js";
import { McpConfig, SetupConfig } from "./types/index.js";
import { MCP_CONFIG_FILE, SETUP_CONFIG_FILE } from "./config/constants.js";

// Configure dotenv to look in src/client directory
dotenv.config({ path: path.join(process.cwd(), 'src', 'client', '.env') });

async function main() {
  // Read setup configuration first
  let setupConfig: SetupConfig;
  try {
    const setupPath = path.join(process.cwd(), 'src', 'client', SETUP_CONFIG_FILE);
    const setupData = fs.readFileSync(setupPath, "utf-8");
    setupConfig = JSON.parse(setupData);
  } catch (error) {
    console.error("Failed to read or parse setup-config.json:", error);
    console.log("Please run 'npm run setup' to configure the application first.");
    process.exit(1);
  }

  // Read MCP configuration
  let mcpConfig: McpConfig;
  try {
    const mcpPath = path.join(process.cwd(), 'src', 'client', MCP_CONFIG_FILE);
    const configData = fs.readFileSync(mcpPath, "utf-8");
    mcpConfig = JSON.parse(configData);
  } catch (error) {
    console.error("Failed to read or parse mcp-config.json:", error);
    console.log(`Please ensure mcp-config.json exists and follows the structure:
{
  "mcpServers": {
    "serverName1": { 
      "command": "...", 
      "args": [...] 
    },
    "serverName2": { 
      "smithery": {
        "url": "...",
        "apiKey": "...",
        "config": {...}
      }
    }
  }
}`);
    process.exit(1);
  }

  if (!mcpConfig || typeof mcpConfig.mcpServers !== 'object' || Object.keys(mcpConfig.mcpServers).length === 0) {
    console.error("Invalid configuration: 'mcpServers' object missing or empty in mcp-config.json");
    process.exit(1);
  }

  // Basic validation for server configs
  for (const [name, serverConf] of Object.entries(mcpConfig.mcpServers)) {
    if (serverConf.smithery) {
      // Validate Smithery configuration
      if (!serverConf.smithery.url || !serverConf.smithery.apiKey || !serverConf.smithery.config) {
        console.error(`Invalid Smithery config for server '${name}': missing required fields (url, apiKey, or config)`);
        process.exit(1);
      }
    } else {
      // Validate stdio configuration
      if (!serverConf.command || !Array.isArray(serverConf.args)) {
        console.error(`Invalid stdio config for server '${name}': missing 'command' or 'args'`);
        process.exit(1);
      }
    }
  }

  const mcpClient = new MCPClient();
  try {
    await mcpClient.connectToServers(mcpConfig, setupConfig);
    await mcpClient.chatLoop();
  } catch (error) {
    console.error("An error occurred during client operation:", error);
    process.exit(1);
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Unhandled error in main:", err);
  process.exit(1);
});


