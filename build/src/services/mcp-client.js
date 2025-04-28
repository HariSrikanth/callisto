import { Anthropic } from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { INITIAL_SYSTEM_PROMPT, CHAT_HISTORY_FILE } from '../config/constants.js';
export class MCPClient {
    constructor() {
        this.tools = [];
        this.messages = [];
        this.setupConfig = null;
        this.REQUEST_TIMEOUT = 15000;
        this.pendingMessages = [];
        this.anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
        this.mcps = new Map();
        this.toolToServerMap = new Map();
        this.chatHistoryFile = path.join(process.cwd(), CHAT_HISTORY_FILE);
        this.loadChatHistory();
    }
    async substituteEnvVars(value) {
        if (typeof value === 'string') {
            if (value.startsWith('${') && value.endsWith('}')) {
                const ref = value.slice(2, -1);
                if (ref.includes('.')) {
                    const [file, tokenPath] = ref.split('.');
                    if (file === 'gcp-saved-tokens.json') {
                        // Use refresh token from setup config
                        return this.setupConfig?.google.refreshToken || '';
                    }
                }
                else {
                    // Map environment variables to setup config values
                    switch (ref) {
                        case 'SMITHERY_API_KEY':
                            return process.env.SMITHERY_API_KEY || '';
                        case 'GOOGLE_CLIENT_ID':
                            return this.setupConfig?.google.clientId || '';
                        case 'GOOGLE_CLIENT_SECRET':
                            return this.setupConfig?.google.clientSecret || '';
                        case 'SLACK_BOT_TOKEN':
                            return this.setupConfig?.slack.botToken || '';
                        case 'SLACK_TEAM_ID':
                            return this.setupConfig?.slack.teamId || '';
                        default:
                            return process.env[ref] || '';
                    }
                }
            }
            return value;
        }
        else if (Array.isArray(value)) {
            return Promise.all(value.map(v => this.substituteEnvVars(v)));
        }
        else if (typeof value === 'object' && value !== null) {
            const result = {};
            for (const [key, val] of Object.entries(value)) {
                result[key] = await this.substituteEnvVars(val);
            }
            return result;
        }
        return value;
    }
    async processConfig(config) {
        return this.substituteEnvVars(config);
    }
    loadChatHistory() {
        try {
            if (fs.existsSync(this.chatHistoryFile)) {
                const history = JSON.parse(fs.readFileSync(this.chatHistoryFile, 'utf-8'));
                this.messages = history;
                console.log('Loaded previous chat history.');
            }
            else {
                this.messages = [{ role: 'user', content: INITIAL_SYSTEM_PROMPT }];
                this.saveChatHistory();
            }
        }
        catch (error) {
            console.error('Error loading chat history:', error);
            this.messages = [{ role: 'user', content: INITIAL_SYSTEM_PROMPT }];
        }
    }
    saveChatHistory() {
        try {
            // Format the history with clear separation between user and API responses
            const formattedHistory = this.messages.map(msg => {
                if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                    // Format tool responses
                    return {
                        role: 'assistant',
                        content: msg.content.map((content) => {
                            if (content.type === 'tool_use') {
                                return {
                                    type: 'tool_use',
                                    tool_name: content.name,
                                    parameters: content.input
                                };
                            }
                            else if (content.type === 'tool_result') {
                                return {
                                    type: 'tool_result',
                                    tool_use_id: content.tool_use_id,
                                    content: content.content,
                                    is_error: content.is_error
                                };
                            }
                            else if (content.type === 'text') {
                                return {
                                    type: 'text',
                                    text: content.text
                                };
                            }
                            return content;
                        }).filter(Boolean) // Remove any null content
                    };
                }
                return msg;
            }).filter(msg => {
                // Remove messages with empty content
                if (Array.isArray(msg.content)) {
                    return msg.content.length > 0;
                }
                return true;
            });
            fs.writeFileSync(this.chatHistoryFile, JSON.stringify(formattedHistory, null, 2));
        }
        catch (error) {
            console.error('Error saving chat history:', error);
        }
    }
    getToolSchema(serverName, toolName, originalSchema) {
        // Default schema for all tools
        const baseSchema = {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false
        };
        // Server-specific schema handling
        switch (serverName) {
            case 'gsuite':
                if (toolName === 'list_emails' || toolName === 'search_emails') {
                    return {
                        type: "object",
                        properties: {
                            maxResults: { type: "number", default: 10 },
                            query: { type: "string" }
                        },
                        required: [],
                        additionalProperties: false
                    };
                }
                if (toolName === 'send_email') {
                    return {
                        type: "object",
                        properties: {
                            to: { type: "string" },
                            subject: { type: "string" },
                            body: { type: "string" }
                        },
                        required: ["to", "subject", "body"],
                        additionalProperties: false
                    };
                }
                break;
            case 'exa':
                if (toolName === 'web_search_exa') {
                    return {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Search query" },
                            numResults: { type: "number", default: 5, description: "Number of results to return" }
                        },
                        required: ["query"],
                        additionalProperties: false
                    };
                }
                if (toolName === 'company_research') {
                    return {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Company name or domain to research" },
                            numResults: { type: "number", default: 5, description: "Number of results to return" }
                        },
                        required: ["query"],
                        additionalProperties: false
                    };
                }
                break;
            case 'google-calendar':
                if (toolName === 'list-events' || toolName === 'search-events') {
                    return {
                        type: "object",
                        properties: {
                            maxResults: { type: "number", default: 10 },
                            timeMin: { type: "string", format: "date-time" },
                            timeMax: { type: "string", format: "date-time" }
                        },
                        required: [],
                        additionalProperties: false
                    };
                }
                if (toolName === 'create-event') {
                    return {
                        type: "object",
                        properties: {
                            summary: { type: "string" },
                            start: { type: "string", format: "date-time" },
                            end: { type: "string", format: "date-time" },
                            description: { type: "string" }
                        },
                        required: ["summary", "start", "end"],
                        additionalProperties: false
                    };
                }
                break;
        }
        // If no specific schema is defined, use the original schema if valid
        if (originalSchema && typeof originalSchema === 'object') {
            if (originalSchema.properties) {
                baseSchema.properties = originalSchema.properties;
            }
            if (originalSchema.required) {
                baseSchema.required = originalSchema.required;
            }
        }
        return baseSchema;
    }
    async connectToServers(mcpConfig, setupConfig) {
        console.log("\n=== Starting MCP Server Connections ===");
        this.setupConfig = setupConfig;
        const allTools = [];
        const connectPromises = [];
        for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
            const connectPromise = (async () => {
                try {
                    console.log(`\n[${serverName}] Initializing connection...`);
                    const mcpClient = new Client({
                        name: `mcp-client-cli-for-${serverName}`,
                        version: "1.0.0",
                    });
                    let transport;
                    if (serverConfig.smithery) {
                        // Process the Smithery configuration
                        const processedConfig = await this.processConfig(serverConfig.smithery.config);
                        const serverUrl = new URL(serverConfig.smithery.url);
                        // Merge with setup configuration
                        const config = {
                            ...processedConfig,
                            ...(this.setupConfig?.google || {}),
                            ...(this.setupConfig?.slack || {}),
                            ...(this.setupConfig?.userContext || {})
                        };
                        serverUrl.searchParams.set('config', btoa(JSON.stringify(config)));
                        serverUrl.searchParams.set('api_key', await this.processConfig(serverConfig.smithery.apiKey));
                        transport = new StreamableHTTPClientTransport(serverUrl);
                    }
                    else {
                        if (!serverConfig.command || !serverConfig.args) {
                            throw new Error(`Missing command or args for server ${serverName}`);
                        }
                        transport = new StdioClientTransport({
                            command: serverConfig.command,
                            args: serverConfig.args,
                        });
                    }
                    await mcpClient.connect(transport);
                    this.mcps.set(serverName, mcpClient);
                    // Get available tools
                    const toolsResult = await mcpClient.listTools();
                    console.log(`[${serverName}] Found ${toolsResult.tools.length} tools`);
                    // Map tools to server and display capabilities
                    for (const tool of toolsResult.tools) {
                        this.toolToServerMap.set(tool.name, serverName);
                        const toolSchema = this.getToolSchema(serverName, tool.name, tool.inputSchema);
                        allTools.push({
                            name: tool.name,
                            description: tool.description || '',
                            input_schema: toolSchema
                        });
                        // Display tool capabilities
                        console.log(`\nTool: ${tool.name}`);
                        console.log(`Description: ${tool.description}`);
                        console.log('Parameters:');
                        for (const [param, schema] of Object.entries(toolSchema.properties)) {
                            const required = toolSchema.required.includes(param) ? ' (required)' : '';
                            console.log(`  - ${param}${required}: ${schema.type}${schema.description ? ` - ${schema.description}` : ''}`);
                        }
                        if (this.requiresConfirmation(tool.name)) {
                            console.log('⚠️  Requires confirmation before execution');
                        }
                    }
                }
                catch (error) {
                    console.error(`[${serverName}] Connection failed:`, error);
                }
            })();
            connectPromises.push(connectPromise);
        }
        await Promise.all(connectPromises);
        this.tools = allTools;
        console.log(`\n=== Tool Summary ===`);
        console.log(`Total tools available: ${this.tools.length}`);
        console.log(`Tools requiring confirmation: ${this.tools.filter(t => this.requiresConfirmation(t.name)).length}`);
        console.log(`Tools available for immediate execution: ${this.tools.filter(t => !this.requiresConfirmation(t.name)).length}`);
    }
    async stageMessage(message) {
        this.pendingMessages.push(message);
        const messageType = message.type === 'email' ? 'Email' : 'Slack Message';
        const recipient = message.type === 'email'
            ? `To: ${message.content.to}`
            : `Channel: ${message.content.channel}`;
        return `
${messageType} Staged:
${recipient}
${message.content.subject ? `Subject: ${message.content.subject}\n` : ''}
Message: ${message.content.message}

Send message? (Y/N)
`;
    }
    requiresConfirmation(toolName) {
        // Require confirmation for all sending-related tools
        const sendingTools = [
            'send_email',
            'send_slack_message',
            'send_message',
            'post_message',
            'create_message',
            'send_notification',
            'post_notification',
            'send_message_on_slack'
        ];
        return sendingTools.includes(toolName);
    }
    async handleConfirmation(messageId) {
        const message = this.pendingMessages[messageId - 1];
        if (!message) {
            return "No such pending message found.";
        }
        try {
            const toolName = message.type === 'email' ? 'send_email' : 'send_slack_message';
            const result = await this.executeToolCall(toolName, message.content, `confirm-${messageId}`);
            // Remove the sent message
            this.pendingMessages = this.pendingMessages.filter((_, index) => index !== messageId - 1);
            return `Message sent successfully:\n${result.content}`;
        }
        catch (error) {
            return `Failed to send message: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
    async handleRejection(messageId) {
        const message = this.pendingMessages[messageId - 1];
        if (!message) {
            return "No such pending message found.";
        }
        // Remove the rejected message
        this.pendingMessages = this.pendingMessages.filter((_, index) => index !== messageId - 1);
        return `Message cancelled: ${message.type === 'email' ? 'Email' : 'Slack message'} to ${message.type === 'email' ? message.content.to : message.content.channel}`;
    }
    async executeToolCall(toolName, toolInput, toolUseId) {
        const serverName = this.toolToServerMap.get(toolName);
        if (!serverName) {
            return {
                type: "tool_result",
                tool_use_id: toolUseId,
                content: `Error: Tool ${toolName} not found.`,
                is_error: true,
            };
        }
        const mcpClient = this.mcps.get(serverName);
        if (!mcpClient) {
            return {
                type: "tool_result",
                tool_use_id: toolUseId,
                content: `Error: Client for server ${serverName} not found.`,
                is_error: true,
            };
        }
        // Find the tool schema
        const toolDef = this.tools.find(t => t.name === toolName);
        if (!toolDef) {
            return {
                type: "tool_result",
                tool_use_id: toolUseId,
                content: `Error: Tool ${toolName} schema not found.`,
                is_error: true,
            };
        }
        try {
            // Validate required parameters
            const schema = toolDef.input_schema;
            const missingParams = schema.required?.filter(param => !(param in toolInput));
            if (missingParams?.length) {
                return {
                    type: "tool_result",
                    tool_use_id: toolUseId,
                    content: `Error: Missing required parameters for ${toolName}: ${missingParams.join(', ')}`,
                    is_error: true,
                };
            }
            // Special handling for Exa API tools
            let processedInput = { ...toolInput };
            if (serverName === 'exa') {
                if (toolName === 'web_search_exa' || toolName === 'company_research') {
                    processedInput = {
                        query: toolInput.query,
                        num_results: toolInput.numResults || 5
                    };
                }
            }
            // Special handling for Google Calendar tools
            if (serverName === 'google-calendar' && toolName === 'create-event') {
                // Add the user's email as an attendee if not already present
                const attendees = toolInput.attendees || [];
                const userEmail = this.setupConfig?.userContext.email;
                if (userEmail && !attendees.some(a => a.email === userEmail)) {
                    processedInput = {
                        ...toolInput,
                        attendees: [...attendees, { email: userEmail }]
                    };
                }
            }
            const result = await mcpClient.callTool({
                name: toolName,
                arguments: processedInput,
            });
            const content = typeof result.content === "string"
                ? result.content
                : JSON.stringify(result.content, null, 2);
            return {
                type: "tool_result",
                tool_use_id: toolUseId,
                content: content,
            };
        }
        catch (error) {
            // Enhanced error handling
            let errorMessage = `Error executing tool ${toolName}: `;
            if (error instanceof Error) {
                errorMessage += error.message;
                // Log the full error for debugging
                console.error(`Tool execution error:`, {
                    tool: toolName,
                    server: serverName,
                    error: error.stack || error.message
                });
            }
            else {
                errorMessage += String(error);
            }
            return {
                type: "tool_result",
                tool_use_id: toolUseId,
                content: errorMessage,
                is_error: true,
            };
        }
    }
    async processQuery(query) {
        // Handle empty queries
        if (!query || query.trim() === '') {
            return "Please provide a query.";
        }
        // Handle Y/N confirmation
        const isYes = query.toLowerCase() === 'y' || query.toLowerCase() === 'yes';
        const isNo = query.toLowerCase() === 'n' || query.toLowerCase() === 'no';
        if (isYes || isNo) {
            if (this.pendingMessages.length === 0) {
                return "No pending messages to confirm or reject.";
            }
            // Always handle the most recent message
            const messageId = this.pendingMessages.length;
            return isYes ?
                this.handleConfirmation(messageId) :
                this.handleRejection(messageId);
        }
        // Regular query processing
        this.messages.push({ role: "user", content: query });
        let loopCount = 0;
        const maxLoops = 10;
        let responseText = "";
        while (loopCount < maxLoops) {
            loopCount++;
            try {
                const response = await this.anthropic.messages.create({
                    model: "claude-3-haiku-20240307",
                    max_tokens: 2000,
                    messages: this.messages,
                    system: INITIAL_SYSTEM_PROMPT,
                    tools: this.tools,
                    tool_choice: { type: 'auto' }
                }); // Using type assertion temporarily until SDK is updated
                let hasToolUse = false;
                const toolResults = [];
                let currentResponseText = "";
                for (const content of response.content) {
                    if (content.type === "text") {
                        currentResponseText += content.text;
                    }
                    else if (content.type === "tool_use") {
                        hasToolUse = true;
                        // First assert as unknown since ContentBlock is too generic
                        const toolUse = content;
                        const toolName = toolUse.name;
                        const toolInput = toolUse.input;
                        const toolUseId = toolUse.id;
                        // Stage messages that require confirmation
                        if (this.requiresConfirmation(toolName)) {
                            const message = {
                                type: toolName === 'send_email' ? 'email' : 'slack',
                                content: {
                                    ...toolInput,
                                    message: toolName === 'send_email' ? String(toolInput.body || '') : String(toolInput.message || '')
                                },
                                timestamp: new Date()
                            };
                            const stagingResponse = await this.stageMessage(message);
                            console.log(stagingResponse);
                            // Return early to wait for user confirmation
                            return stagingResponse;
                        }
                        try {
                            // Execute non-message tools immediately
                            const result = await this.executeToolCall(toolName, toolInput, toolUseId);
                            toolResults.push(result);
                            currentResponseText += result.content;
                        }
                        catch (error) {
                            // Handle tool execution errors
                            const errorResult = {
                                type: "tool_result",
                                tool_use_id: toolUseId,
                                content: `Error executing tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
                                is_error: true,
                            };
                            toolResults.push(errorResult);
                            currentResponseText += errorResult.content;
                        }
                    }
                }
                // Only add messages if they have content
                if (response.content.length > 0) {
                    this.messages.push({ role: "assistant", content: response.content });
                }
                responseText += currentResponseText;
                if (hasToolUse) {
                    // Only add tool results if there are any
                    if (toolResults.length > 0) {
                        // Add tool results to message history
                        const toolResultMessage = {
                            role: "user",
                            content: toolResults.map(result => ({
                                type: "tool_result",
                                tool_use_id: result.tool_use_id,
                                content: result.content,
                                is_error: result.is_error
                            }))
                        };
                        // Only add if we have matching tool uses
                        const lastAssistantMessage = this.messages[this.messages.length - 1];
                        if (lastAssistantMessage && Array.isArray(lastAssistantMessage.content)) {
                            const toolUses = lastAssistantMessage.content.filter(c => typeof c === 'object' && c !== null && 'type' in c && c.type === 'tool_use').map(c => c);
                            if (toolUses.length > 0) {
                                this.messages.push(toolResultMessage);
                            }
                        }
                    }
                    this.saveChatHistory();
                }
                else {
                    this.saveChatHistory();
                    return responseText;
                }
            }
            catch (error) {
                // Handle API errors
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error("Error processing query:", errorMessage);
                // Clean up any incomplete tool calls
                if (this.messages.length > 0 &&
                    this.messages[this.messages.length - 1].role === "assistant" &&
                    Array.isArray(this.messages[this.messages.length - 1].content)) {
                    this.messages.pop(); // Remove the last assistant message if it's incomplete
                }
                return `Error: ${errorMessage}`;
            }
        }
        return responseText + "\nMaximum tool use loops reached. Returning current response.";
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
        // Clear chat history
        try {
            this.messages = [{ role: 'user', content: INITIAL_SYSTEM_PROMPT }];
            this.saveChatHistory();
            console.log("Chat history cleared.");
        }
        catch (error) {
            console.error("Error clearing chat history:", error);
        }
    }
}
//# sourceMappingURL=mcp-client.js.map