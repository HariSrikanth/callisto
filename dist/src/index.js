import { Anthropic } from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import readline from "readline/promises";
import fs from "fs";
import path from "path";
import { validateRefreshToken } from "./auth/client.js";
import dotenv from "dotenv";
dotenv.config(); // load environment variables from .env
// Validate required environment variables
const requiredEnvVars = [
    'ANTHROPIC_API_KEY',
    'SMITHERY_API_KEY'
];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`${envVar} is not set in .env file`);
    }
}
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
}
// Initial system prompt to set context for the model
const INITIAL_SYSTEM_PROMPT = `
You are Callisto, an intelligent AI assistant built to listen in on meetings and help before you're even asked. Your mission: make meetings smarter, faster, and more focused—so users can spend their time solving problems, not managing logistics.

=== VISION ===
Imagine an AI agent that listens to conversations in real-time and answers questions before the user even finishes asking. If someone says:
  "What's the most recent valuation of Series?"
Callisto should already be pulling up the answer on the side.

If someone asks:
  "How does MCP differ from traditional API interfaces?"
Callisto should reference documentation or proprietary files immediately, providing a precise response in-context.

For users in sensitive fields like venture capital or finance, Callisto allows them to upload private datasets to securely reference during meetings—without compromising confidentiality.

If a colleague says:
  "Are you free tomorrow at 2?"
Callisto checks the user's calendar, offers alternatives, and schedules the meeting seamlessly.

If shorthand notes are typed in the sidebar, Callisto automatically expands them into professional minutes, including any details the user may have missed.

You are not just a listener—you are a strategic partner.

=== CAPABILITIES (via MCP Tools) ===
Callisto operates using tools from MCP (Model Context Protocol) servers. Use them proactively and responsibly to support the user:

1. Google Calendar – Manage meetings, availability, scheduling
2. Exa – Search the web and analyze external data fast
3. Email – Send and schedule emails (now or later)
4. Slack – Communicate in real time or asynchronously
5. Excel & Docs – Extract, query, and summarize from spreadsheets and documents
6. Multitool Tasks – Combine tools to solve complex or high-value actions

Always state clearly which tools you are using and why. If unsure, ask clarifying questions—but never give half-baked or lazy answers. Be sharp, be efficient, and above all, be useful.

Now, with regards to tool usage, here are some guidelines:

- Exa: When you search, make sure to return the number of results appropriately (sometimes you need to get more than 5 results). Always link sources used in response to user queries. If a user asks for information about a specific company, do a regular search on the web but also try to find the company website and search it.
- Email: When you send an email, make sure to include the subject, body, and recipient. When you search for emails, construct a good query by broadening the search paradigm to ensure that the user gets reasonable results.
- Calendar: Make sure to check today's date and ensure that all date-related actions reflect this. Ensure that you plan events cognizant of the user's schedule, and ensure that events are scheduled in natural manners (such as not too long, or at odd hours, unless requested). Make events as complete as possible (add locations, links, additional members, notes, etc).
- Slack: When you send a message, make sure to include the message and the recipient. 
- Excel & Docs: When you extract information from a spreadsheet or document, make sure to include the information and the source.
- Multitool Tasks: When you use multiple tools to solve a complex or high-value action, make sure to include the steps and the tools used.

=== GUIDING PRINCIPLE: TAKE INITIATIVE ===
The magic of Callisto lies in anticipating what comes next. After completing a task or answering a question, think:
- "What's the next logical step?"
- "What would save the user time right now?"
- "What else might they want to do?"

Then suggest it. Don't wait for a prompt. Propose meaningful follow-up actions that keep the user in flow.

Example: If you just checked their calendar and see a lunch block, suggest finding a top-rated place nearby.  
Or if you answered a financial query, offer to summarize related valuations from recent news.

Initiative is what turns you from helpful to indispensable. Be indispensable. Be great.

=== CONTEXT ===
Make sure to fetch today's date (SHOULD BE APRIL 24 2025). Default location is Pear VC headquarter in San Francisco. Make sure all date-related actions reflect this.

=== RESPONSE STYLE ===
Speak like a professional executive assistant—concise, friendly, and human. Prioritize clarity, don't over-explain, and always sound eager to help. After every response, guide the user with a next-step suggestion.

Let's get to work—Callisto style.

=== WARNINGS ===
When you start fetch the date. THINK. THINK. THINK. IT SHOULD BE April 24 2025 (2025-05-24). Unless you're dumb.


`;
async function loadGcpCredentials() {
    try {
        // Load OAuth keys
        const keysPath = path.join(process.cwd(), '.gcp-oauth.keys.json');
        console.log('Loading OAuth keys from:', keysPath);
        const keysContent = await fs.promises.readFile(keysPath, 'utf-8');
        const keys = JSON.parse(keysContent);
        // Load saved tokens
        const tokenPath = path.join(process.cwd(), '.gcp-saved-tokens.json');
        console.log('Loading saved tokens from:', tokenPath);
        const tokenContent = await fs.promises.readFile(tokenPath, 'utf-8');
        const tokens = JSON.parse(tokenContent);
        console.log('Successfully loaded GCP credentials');
        return {
            client_id: keys.installed.client_id,
            client_secret: keys.installed.client_secret,
            refresh_token: tokens.refresh_token
        };
    }
    catch (error) {
        console.error('Error loading GCP credentials:', error);
        throw new Error('Failed to load GCP credentials from .gcp-oauth.keys.json or .gcp-saved-tokens.json');
    }
}
class MCPClient {
    constructor() {
        this.tools = []; // Aggregated tools from all servers
        this.messages = []; // Chat history
        this.anthropic = new Anthropic({
            apiKey: ANTHROPIC_API_KEY,
        });
        this.mcps = new Map();
        this.toolToServerMap = new Map();
        this.chatHistoryFile = path.join(process.cwd(), 'chat_history.json');
        this.loadChatHistory();
    }
    loadChatHistory() {
        try {
            if (fs.existsSync(this.chatHistoryFile)) {
                const history = JSON.parse(fs.readFileSync(this.chatHistoryFile, 'utf-8'));
                this.messages = history;
                console.log('Loaded previous chat history.');
            }
            else {
                // Initialize with system prompt if no history exists
                this.messages = [{ role: 'user', content: INITIAL_SYSTEM_PROMPT }];
                this.saveChatHistory();
            }
        }
        catch (error) {
            console.error('Error loading chat history:', error);
            // Initialize with system prompt if there's an error
            this.messages = [{ role: 'user', content: INITIAL_SYSTEM_PROMPT }];
        }
    }
    saveChatHistory() {
        try {
            fs.writeFileSync(this.chatHistoryFile, JSON.stringify(this.messages, null, 2));
        }
        catch (error) {
            console.error('Error saving chat history:', error);
        }
    }
    async connectToServers(config) {
        /**
         * Connect to multiple MCP servers defined in the config
         *
         * @param config - The parsed mcp-config.json content
         */
        console.log("Connecting to MCP servers...");
        const allTools = [];
        const connectPromises = [];
        // Load GCP credentials once
        const gcpCredentials = await loadGcpCredentials();
        for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
            const connectPromise = (async () => {
                try {
                    console.log(`Connecting to server: ${serverName}...`);
                    const mcpClient = new Client({
                        name: `mcp-client-cli-for-${serverName}`,
                        version: "1.0.0",
                    });
                    let transport;
                    if (serverConfig.smithery) {
                        // Use Smithery HTTP transport
                        const { url, apiKey, config: smitheryConfig } = serverConfig.smithery;
                        const serverUrl = new URL(url);
                        // Load GCP credentials
                        const gcpCredentials = await loadGcpCredentials();
                        // Create config object
                        const config = {
                            googleClientId: gcpCredentials.client_id,
                            googleClientSecret: gcpCredentials.client_secret,
                            googleRefreshToken: gcpCredentials.refresh_token
                        };
                        // Convert config to base64
                        const configString = JSON.stringify(config);
                        serverUrl.searchParams.set("config", btoa(configString));
                        // Set API key
                        serverUrl.searchParams.set("api_key", process.env.SMITHERY_API_KEY || '');
                        console.log('Connecting to Smithery server with URL:', serverUrl.toString());
                        transport = new StreamableHTTPClientTransport(serverUrl);
                    }
                    else {
                        // Use stdio transport for local servers
                        const mergedEnv = { ...process.env, ...serverConfig.env };
                        const finalEnv = {};
                        for (const [key, value] of Object.entries(mergedEnv)) {
                            if (value !== undefined) {
                                finalEnv[key] = value;
                            }
                        }
                        transport = new StdioClientTransport({
                            command: serverConfig.command,
                            args: serverConfig.args,
                            env: finalEnv,
                        });
                    }
                    await mcpClient.connect(transport);
                    // List available tools for this server
                    const toolsResult = await mcpClient.listTools();
                    const serverTools = toolsResult.tools.map((tool) => {
                        // Store mapping from tool name to server name
                        this.toolToServerMap.set(tool.name, serverName);
                        return {
                            name: tool.name,
                            description: tool.description,
                            input_schema: tool.inputSchema,
                        };
                    });
                    allTools.push(...serverTools);
                    this.mcps.set(serverName, mcpClient); // Store the connected client
                    console.log(`Connected to ${serverName} with tools:`, serverTools.map(({ name }) => name));
                }
                catch (e) {
                    console.error(`Failed to connect to MCP server ${serverName}: `, e);
                }
            })();
            connectPromises.push(connectPromise);
        }
        // Wait for all connections to attempt
        await Promise.all(connectPromises);
        this.tools = allTools; // Set the aggregated tools
        if (this.mcps.size === 0) {
            throw new Error("Failed to connect to any MCP servers.");
        }
        console.log("\nSuccessfully connected to servers:", Array.from(this.mcps.keys()));
        console.log("Total available tools:", this.tools.map(({ name }) => name));
    }
    async processQuery(query) {
        // Add user message to history
        this.messages.push({ role: "user", content: query });
        let loopCount = 0;
        const maxLoops = 10; // Prevent infinite loops
        while (loopCount < maxLoops) {
            loopCount++;
            const response = await this.anthropic.messages.create({
                model: "claude-3-haiku-20240307", // Using Haiku for potentially faster responses
                max_tokens: 2000,
                messages: this.messages,
                tools: this.tools,
            });
            let hasToolUse = false;
            const toolResults = [];
            let responseText = "";
            for (const content of response.content) {
                if (content.type === "text") {
                    responseText += content.text;
                }
                else if (content.type === "tool_use") {
                    hasToolUse = true;
                    const toolUse = content;
                    const toolName = toolUse.name;
                    const toolInput = toolUse.input;
                    const toolUseId = toolUse.id;
                    // Find the correct MCP client for this tool
                    const serverName = this.toolToServerMap.get(toolName);
                    if (!serverName) {
                        console.error(`Tool ${toolName} not found on any connected server.`);
                        toolResults.push({
                            type: "tool_result",
                            tool_use_id: toolUseId,
                            content: `Error: Tool ${toolName} not found.`,
                            is_error: true,
                        });
                        continue;
                    }
                    const mcpClient = this.mcps.get(serverName);
                    if (!mcpClient) {
                        console.error(`Client for server ${serverName} not found.`);
                        toolResults.push({
                            type: "tool_result",
                            tool_use_id: toolUseId,
                            content: `Error: Client for server ${serverName} not found.`,
                            is_error: true,
                        });
                        continue;
                    }
                    console.log(`Calling tool ${toolName} on server ${serverName} with args ${JSON.stringify(toolInput)}`);
                    try {
                        const result = await mcpClient.callTool({
                            name: toolName,
                            arguments: toolInput,
                        });
                        toolResults.push({
                            type: "tool_result",
                            tool_use_id: toolUseId,
                            content: typeof result.content === "string"
                                ? result.content
                                : JSON.stringify(result.content),
                        });
                    }
                    catch (error) {
                        console.error(`Error calling tool ${toolName}:`, error);
                        toolResults.push({
                            type: "tool_result",
                            tool_use_id: toolUseId,
                            content: `Error executing tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
                            is_error: true,
                        });
                    }
                }
            }
            // Add assistant's response to history
            this.messages.push({ role: "assistant", content: response.content });
            if (hasToolUse) {
                // Add tool results to history
                this.messages.push({
                    role: "user",
                    content: toolResults,
                });
                // Save history after each interaction
                this.saveChatHistory();
                // Continue the loop to let the model process tool results
            }
            else {
                // Save history after each interaction
                this.saveChatHistory();
                // No tool use, return the final text response
                return responseText;
            }
        }
        return "Maximum tool use loops reached. Returning current response.";
    }
    async chatLoop() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        try {
            console.log("\nMCP Client Started!");
            console.log(`Connected to servers: ${Array.from(this.mcps.keys()).join(", ")}`);
            console.log("Type your queries or 'quit' to exit.");
            console.log("Type 'clear' to start a new conversation.");
            while (true) {
                const message = await rl.question("\nQuery: ");
                if (message.toLowerCase() === "quit") {
                    // Clear chat history when quitting
                    this.messages = [{ role: 'user', content: INITIAL_SYSTEM_PROMPT }];
                    this.saveChatHistory();
                    break;
                }
                if (message.toLowerCase() === "clear") {
                    this.messages = [{ role: 'user', content: INITIAL_SYSTEM_PROMPT }];
                    this.saveChatHistory();
                    console.log("Conversation history cleared.");
                    continue;
                }
                try {
                    const response = await this.processQuery(message);
                    console.log("\n" + response);
                }
                catch (error) {
                    console.error("\nError processing query:", error);
                }
            }
        }
        finally {
            rl.close();
        }
    }
    async cleanup() {
        console.log("\nCleaning up MCP connections...");
        const closePromises = Array.from(this.mcps.values()).map((client) => client.close().catch((e) => console.error("Error closing client:", e)));
        await Promise.all(closePromises);
        console.log("All MCP connections closed.");
    }
}
async function main() {
    // Validate Google OAuth token before starting
    const hasValidToken = await validateRefreshToken();
    if (!hasValidToken) {
        console.error('No valid Google OAuth token found. Please run "npm run auth" first.');
        process.exit(1);
    }
    // Read configuration from mcp-config.json
    let config;
    try {
        const configData = fs.readFileSync("mcp-config.json", "utf-8");
        config = JSON.parse(configData);
    }
    catch (error) {
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
        return;
    }
    if (!config || typeof config.mcpServers !== 'object' || Object.keys(config.mcpServers).length === 0) {
        console.error("Invalid configuration: 'mcpServers' object missing or empty in mcp-config.json");
        return;
    }
    // Basic validation for server configs
    for (const [name, serverConf] of Object.entries(config.mcpServers)) {
        if (serverConf.smithery) {
            // Validate Smithery configuration
            if (!serverConf.smithery.url || !serverConf.smithery.apiKey || !serverConf.smithery.config) {
                console.error(`Invalid Smithery config for server '${name}': missing required fields (url, apiKey, or config)`);
                return;
            }
        }
        else {
            // Validate stdio configuration
            if (!serverConf.command || !Array.isArray(serverConf.args)) {
                console.error(`Invalid stdio config for server '${name}': missing 'command' or 'args'`);
                return;
            }
        }
    }
    const mcpClient = new MCPClient();
    try {
        await mcpClient.connectToServers(config);
        await mcpClient.chatLoop();
    }
    catch (error) {
        console.error("An error occurred during client operation:", error);
    }
    finally {
        await mcpClient.cleanup();
        process.exit(0);
    }
}
main().catch(err => {
    console.error("Unhandled error in main:", err);
    process.exit(1);
});
