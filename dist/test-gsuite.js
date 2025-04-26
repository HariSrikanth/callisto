import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { loadCredentials } from "./src/auth/client.js";
import * as fs from 'fs/promises';
import path from 'path';
async function testGSuiteConnection() {
    try {
        // Load credentials
        const credentials = await loadCredentials();
        console.log('Loaded credentials successfully');
        // Load refresh token
        const tokenPath = path.join(process.cwd(), '.gcp-saved-tokens.json');
        const tokenContent = await fs.readFile(tokenPath, 'utf-8');
        const tokens = JSON.parse(tokenContent);
        // Create URL and config exactly as shown in docs
        const serverUrl = new URL("https://server.smithery.ai/@rishipradeep-think41/gsuite-mcp/mcp");
        const config = {
            googleClientId: credentials.client_id,
            googleClientSecret: credentials.client_secret,
            googleRefreshToken: tokens.refresh_token
        };
        // Log the config for debugging
        console.log('Config:', JSON.stringify(config, null, 2));
        const configString = JSON.stringify(config);
        serverUrl.searchParams.set("config", btoa(configString));
        serverUrl.searchParams.set("api_key", process.env.SMITHERY_API_KEY || '');
        console.log('Connecting to:', serverUrl.toString());
        // Create transport
        const transport = new StreamableHTTPClientTransport(serverUrl);
        // Create client
        const client = new Client({
            name: "Test client",
            version: "1.0.0"
        });
        // Connect and list tools
        await client.connect(transport);
        const tools = await client.listTools();
        console.log('Available tools:', tools.map((t) => t.name).join(', '));
    }
    catch (error) {
        console.error('Error:', error);
    }
}
testGSuiteConnection();
