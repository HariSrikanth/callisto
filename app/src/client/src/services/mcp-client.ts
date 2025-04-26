import { Anthropic } from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { MCPClientInterface, McpConfig, MessageParam, Tool, ToolResultBlockParam, SetupConfig, PendingMessage, MeetingContext, TranscriptChunk, WorkflowState } from '../types/index.js';
import { INITIAL_SYSTEM_PROMPT, CHAT_HISTORY_FILE, GCP_SAVED_TOKENS_FILE } from '../config/constants.js';
import { loadGcpCredentials } from '../utils/gcp.js';

interface ToolSchema {
  type: "object";
  properties: Record<string, any>;
  required: string[];
  additionalProperties: boolean;
  [key: string]: any;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface TextBlock {
  type: 'text';
  text: string;
}

interface ContentBlock {
  type: string;
  [key: string]: unknown;
}

export class MCPClient implements MCPClientInterface {
  private anthropic: Anthropic;
  private mcps: Map<string, Client>;
  private tools: Tool[] = [];
  private toolToServerMap: Map<string, string>;
  private messages: MessageParam[] = [];
  private chatHistoryFile: string;
  private setupConfig: SetupConfig | null = null;
  private readonly REQUEST_TIMEOUT = 15000;
  private pendingMessages: PendingMessage[] = [];
  private meetingContext: MeetingContext;
  private currentPendingWorkflowId: string | null = null;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.mcps = new Map();
    this.toolToServerMap = new Map();
    this.cleanup()
    
    // Try development path first
    let chatHistoryPath = path.join(process.cwd(), 'src', 'client', CHAT_HISTORY_FILE);
    
    // If not found, try production path
    if (!fs.existsSync(path.dirname(chatHistoryPath))) {
      chatHistoryPath = path.join(process.cwd(), 'out', 'client', CHAT_HISTORY_FILE);
      // Ensure the directory exists
      fs.mkdirSync(path.join(process.cwd(), 'out', 'client'), { recursive: true });
    }
    
    this.chatHistoryFile = chatHistoryPath;
    this.loadChatHistory();
    
    // Initialize meeting context
    this.meetingContext = {
      companyInfo: new Map(),
      personInfo: new Map(),
      documentHistory: new Map(),
      calendarEvents: [],
      activeWorkflows: new Map(),
      pendingWorkflows: new Map()
    };
  }

  private async substituteEnvVars(value: any): Promise<any> {
    if (typeof value === 'string') {
      if (value.startsWith('${') && value.endsWith('}')) {
        const ref = value.slice(2, -1);
        if (ref.includes('.')) {
          const [file, tokenPath] = ref.split('.');
          if (file === 'gcp-saved-tokens.json') {
            // Use refresh token from setup config
            return this.setupConfig?.google.refreshToken || '';
          }
        } else {
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
    } else if (Array.isArray(value)) {
      return Promise.all(value.map(v => this.substituteEnvVars(v)));
    } else if (typeof value === 'object' && value !== null) {
      const result: any = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = await this.substituteEnvVars(val);
      }
      return result;
    }
    return value;
  }

  private async processConfig(config: any): Promise<any> {
    return this.substituteEnvVars(config);
  }

  private loadChatHistory() {
    try {
      if (fs.existsSync(this.chatHistoryFile)) {
        const history = JSON.parse(fs.readFileSync(this.chatHistoryFile, 'utf-8'));
        this.messages = history;
        console.log('Loaded previous chat history.');
      } else {
        this.messages = [{ role: 'user', content: INITIAL_SYSTEM_PROMPT }];
        this.saveChatHistory();
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      this.messages = [{ role: 'user', content: INITIAL_SYSTEM_PROMPT }];
    }
  }

  private saveChatHistory() {
    try {
      // Format the history with clear separation between user and API responses
      const formattedHistory = this.messages.map(msg => {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          // Format tool responses
          return {
            role: 'assistant',
            content: msg.content.map((content: any) => {
              if (content.type === 'tool_use') {
                return {
                  type: 'tool_call',
                  tool: content.name,
                  input: content.input
                };
              } else if (content.type === 'text') {
                return {
                  type: 'text',
                  content: content.text
                };
              }
              return content;
            }).filter(content => content !== null) // Remove any null content
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
    } catch (error) {
      console.error('Error saving chat history:', error);
    }
  }

  private getToolSchema(serverName: string, toolName: string, originalSchema: any): ToolSchema {
    // Default schema for all tools
    const baseSchema: ToolSchema = {
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

  async connectToServers(mcpConfig: McpConfig, setupConfig: SetupConfig): Promise<void> {
    console.log("\n=== Starting MCP Server Connections ===");
    this.setupConfig = setupConfig;
    const allTools: Tool[] = [];
    const connectPromises: Promise<void>[] = [];

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
          } else {
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
              description: tool.description,
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
        } catch (error) {
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

  private async stageMessage(message: PendingMessage): Promise<string> {
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

  private requiresConfirmation(toolName: string): boolean {
    // Require confirmation for all sending-related tools
    const sendingTools = [
      'send_email',
      'send_slack_message',
      'send_message',
      'post_message',
      'create_message',
      'send_notification',
      'post_notification'
    ];
    return sendingTools.includes(toolName);
  }

  private async handleConfirmation(messageId: number): Promise<string> {
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
    } catch (error) {
      return `Failed to send message: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async handleRejection(messageId: number): Promise<string> {
    const message = this.pendingMessages[messageId - 1];
    if (!message) {
      return "No such pending message found.";
    }
    
    // Remove the rejected message
    this.pendingMessages = this.pendingMessages.filter((_, index) => index !== messageId - 1);
    return `Message cancelled: ${message.type === 'email' ? 'Email' : 'Slack message'} to ${message.type === 'email' ? message.content.to : message.content.channel}`;
  }

  private async executeToolCall(toolName: string, toolInput: any, toolUseId: string): Promise<ToolResultBlockParam> {
    const serverName = this.toolToServerMap.get(toolName);
    if (!serverName) {
      return {
        type: "tool_result" as const,
        tool_use_id: toolUseId,
        content: `Error: Tool ${toolName} not found.`,
        is_error: true,
      };
    }

    const mcpClient = this.mcps.get(serverName);
    if (!mcpClient) {
      return {
        type: "tool_result" as const,
        tool_use_id: toolUseId,
        content: `Error: Client for server ${serverName} not found.`,
        is_error: true,
      };
    }

    try {
      // Special handling for Exa API tools
      if (serverName === 'exa') {
        let processedInput = { ...toolInput };
        
        // Handle web search
        if (toolName === 'web_search_exa') {
          processedInput = {
            query: toolInput.query,
            num_results: toolInput.numResults || 5
          };
        }
        
        // Handle company research
        if (toolName === 'company_research') {
          processedInput = {
            query: toolInput.query,
            num_results: toolInput.numResults || 5
          };
        }

        const result = await mcpClient.callTool({
          name: toolName,
          arguments: processedInput,
        });
        
        const content = typeof result.content === "string"
          ? result.content
          : JSON.stringify(result.content, null, 2);
        
        return {
          type: "tool_result" as const,
          tool_use_id: toolUseId,
          content: content as string,
        };
      }

      // Handle non-Exa tools normally
      const result = await mcpClient.callTool({
        name: toolName,
        arguments: toolInput,
      });
      
      const content = typeof result.content === "string"
        ? result.content
        : JSON.stringify(result.content, null, 2);
      
      return {
        type: "tool_result" as const,
        tool_use_id: toolUseId,
        content: content as string,
      };
    } catch (error) {
      const errorMessage = `Error executing tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
      return {
        type: "tool_result" as const,
        tool_use_id: toolUseId,
        content: errorMessage,
        is_error: true,
      };
    }
  }

  async processQuery(query: string): Promise<string> {
    // Handle empty queries
    if (!query || query.trim() === '') {
      return "Please provide a query.";
    }

    // Handle Y/N confirmation
    const isYes = query.toLowerCase() === 'y' || query.toLowerCase() === 'yes';
    const isNo = query.toLowerCase() === 'n' || query.toLowerCase() === 'no';
    
    if (isYes || isNo) {
      if (this.currentPendingWorkflowId) {
        await this.handleUserResponse(query);
        return "Response processed.";
      } else if (this.pendingMessages.length > 0) {
        // Handle legacy message confirmation
        const messageId = this.pendingMessages.length;
        return isYes ? 
          await this.handleConfirmation(messageId) : 
          await this.handleRejection(messageId);
      }
      return "No pending actions to confirm or reject.";
    }

    // Handle transcript chunks
    if (query.startsWith('SCREEN:') || query.startsWith('MIC:')) {
      const [speaker, content] = query.split(':').map(s => s.trim());
      await this.processTranscriptChunk({
        speaker,
        content,
        timestamp: new Date()
      });
      return "Transcript chunk processed.";
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
        } as any);

        let hasToolUse = false;
        const toolResults: ToolResultBlockParam[] = [];
        let currentResponseText = "";

        for (const content of response.content) {
          if (content.type === "text") {
            currentResponseText += content.text;
          } else if (content.type === "tool_use") {
            hasToolUse = true;
            const toolUse = content as unknown as ToolUseBlock;
            const toolName = toolUse.name;
            const toolInput = toolUse.input;
            const toolUseId = toolUse.id;

            // Stage messages that require confirmation
            if (this.requiresConfirmation(toolName)) {
              const message: PendingMessage = {
                type: toolName === 'send_email' ? 'email' : 'slack',
                content: {
                  ...toolInput,
                  message: toolName === 'send_email' ? String(toolInput.body || '') : String(toolInput.message || '')
                },
                timestamp: new Date()
              };
              
              const stagingResponse = await this.stageMessage(message);
              return stagingResponse;
            }

            try {
              // Execute non-message tools immediately
              const result = await this.executeToolCall(toolName, toolInput, toolUseId);
              toolResults.push(result);
              currentResponseText += result.content;
            } catch (error) {
              const errorResult = {
                type: "tool_result" as const,
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
            this.messages.push({
              role: "user",
              content: toolResults.map(result => ({
                type: "tool_result",
                tool_use_id: result.tool_use_id,
                content: result.content,
                is_error: result.is_error
              }))
            } as any);
          }
          this.saveChatHistory();
        } else {
          this.saveChatHistory();
          return responseText;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Error processing query:", errorMessage);
        
        if (this.messages.length > 0 && 
            this.messages[this.messages.length - 1].role === "assistant" && 
            Array.isArray(this.messages[this.messages.length - 1].content)) {
          this.messages.pop();
        }
        
        return `Error: ${errorMessage}`;
      }
    }

    return responseText + "\nMaximum tool use loops reached. Returning current response.";
  }

  async processTranscriptChunk(chunk: TranscriptChunk): Promise<void> {
    this.messages.push({ role: "user", content: chunk.content });
    const workflows = await this.identifyWorkflows(chunk);
    
    for (const workflow of workflows) {
      if (workflow.requiresApproval) {
        await this.stageWorkflow(workflow);
      } else {
        await this.executeWorkflow(workflow);
      }
    }
  }

  private async identifyWorkflows(chunk: TranscriptChunk): Promise<WorkflowState[]> {
    if (this.messages.length > 0 && 
        this.messages[this.messages.length - 1].role === "assistant" && 
        Array.isArray(this.messages[this.messages.length - 1].content)) {
      this.messages.pop();
    }

    const calendarKeywords = ['availability', 'schedule', 'meeting', 'call', 'appointment', 'free', 'busy'];
    const hasCalendarQuery = calendarKeywords.some(keyword => 
      chunk.content.toLowerCase().includes(keyword)
    );

    if (hasCalendarQuery) {
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const calendarWorkflow: WorkflowState = {
        id: `calendar-${Date.now()}`,
        type: 'calendar',
        status: 'staging',
        context: {
          messages: this.messages,
          toolCalls: [{
            type: 'tool_use',
            id: `calendar-${Date.now()}`,
            name: 'list-events',
            input: {
              timeMin: now.toISOString(),
              timeMax: nextWeek.toISOString(),
              maxResults: 10
            }
          }],
          results: []
        },
        requiresApproval: false
      };
      
      this.messages.push({
        role: "assistant",
        content: [{
          type: "tool_use" as const,
          id: calendarWorkflow.id,
          name: "list-events",
          input: calendarWorkflow.context.toolCalls[0].input
        }]
      } as any);
      
      return [calendarWorkflow];
    }

    const response = await this.anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 2000,
      messages: this.messages,
      system: INITIAL_SYSTEM_PROMPT,
      tools: this.tools,
      tool_choice: { type: 'auto' }
    } as any);

    const workflows: WorkflowState[] = [];
    
    for (const content of response.content) {
      if (typeof content === 'object' && content !== null && 'type' in content) {
        const typedContent = content as { type: string };
        if (typedContent.type === "tool_use") {
          const toolUse = content as unknown as ToolUseBlock;
          workflows.push({
            id: toolUse.id,
            type: this.getWorkflowType(toolUse.name),
            status: 'staging',
            context: {
              messages: this.messages,
              toolCalls: [toolUse],
              results: []
            },
            requiresApproval: this.requiresConfirmation(toolUse.name)
          });
        }
      }
    }

    if (workflows.length > 0) {
      this.messages.push({ role: "assistant", content: response.content });
    }
    
    return workflows;
  }

  private getWorkflowType(toolName: string): WorkflowState['type'] {
    if (toolName.startsWith('web_search_exa') || toolName.startsWith('company_research')) {
      return 'search';
    } else if (toolName === 'send_email') {
      return 'email';
    } else if (toolName.startsWith('list-events') || toolName === 'create-event') {
      return 'calendar';
    } else if (toolName === 'send_message_on_slack') {
      return 'slack';
    }
    return 'search';
  }

  private async executeWorkflow(workflow: WorkflowState): Promise<void> {
    if (!workflow.requiresApproval) {
      const result = await this.executeToolCall(
        workflow.context.toolCalls[0].name,
        workflow.context.toolCalls[0].input,
        workflow.context.toolCalls[0].id
      );
      
      workflow.context.results.push(result);
      workflow.status = 'completed';
      
      this.messages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: result.tool_use_id,
          content: result.content,
          is_error: result.is_error
        }]
      } as any);

      await this.updateContext(workflow);
    }
  }

  private async stageWorkflow(workflow: WorkflowState): Promise<void> {
    const stagingResponse = await this.stageMessage({
      type: workflow.type === 'email' ? 'email' : 'slack',
      content: {
        ...workflow.context.toolCalls[0].input,
        message: workflow.type === 'email' 
          ? String(workflow.context.toolCalls[0].input.body || '')
          : String(workflow.context.toolCalls[0].input.message || '')
      },
      timestamp: new Date()
    });
    
    workflow.status = 'pending_approval';
    this.meetingContext.pendingWorkflows.set(workflow.id, workflow);
    this.currentPendingWorkflowId = workflow.id;
    
    console.log(stagingResponse);
  }

  private async updateContext(workflow: WorkflowState): Promise<void> {
    if (workflow.type === 'search') {
      const result = workflow.context.results[0];
      if (result && !result.is_error) {
        try {
          const content = JSON.parse(result.content);
          if (content.company) {
            this.meetingContext.companyInfo.set(content.company, content);
          }
          if (content.person) {
            this.meetingContext.personInfo.set(content.person, content);
          }
        } catch (e) {
          // Handle non-JSON content
        }
      }
    } else if (workflow.type === 'calendar') {
      const result = workflow.context.results[0];
      if (result && !result.is_error) {
        try {
          const content = JSON.parse(result.content);
          if (Array.isArray(content.events)) {
            this.meetingContext.calendarEvents.push(...content.events);
          }
        } catch (e) {
          // Handle non-JSON content
        }
      }
    }
  }

  async handleUserResponse(response: string): Promise<void> {
    if (this.currentPendingWorkflowId) {
      const workflow = this.meetingContext.pendingWorkflows.get(this.currentPendingWorkflowId);
      if (workflow) {
        if (response.toLowerCase() === 'y' || response.toLowerCase() === 'yes') {
          await this.executeWorkflow(workflow);
          this.meetingContext.pendingWorkflows.delete(workflow.id);
        } else if (response.toLowerCase() === 'n' || response.toLowerCase() === 'no') {
          this.meetingContext.pendingWorkflows.delete(workflow.id);
          console.log(`Workflow ${workflow.id} cancelled.`);
        }
        this.currentPendingWorkflowId = null;
      }
    }
  }

  get connectedServers(): string[] {
    return Array.from(this.mcps.keys());
  }

  get hasPendingWorkflow(): boolean {
    return this.currentPendingWorkflowId !== null;
  }

  async chatLoop(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("\nMCP Client Started!");
      console.log(`Connected to servers: ${this.connectedServers.join(", ")}`);
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
        } catch (error) {
          console.error("\nError processing query:", error);
        }
      }
    } finally {
      rl.close();
    }
  }

  async cleanup(): Promise<void> {
    console.log("\nCleaning up MCP connections...");
    const closePromises = Array.from(this.mcps.values()).map((client) =>
      client.close().catch((e) => console.error("Error closing client:", e)),
    );
    await Promise.all(closePromises);
    console.log("All MCP connections closed.");

    // Clear chat history
    try {
      this.messages = [{ role: 'user', content: INITIAL_SYSTEM_PROMPT }];
      this.saveChatHistory();
      console.log("Chat history cleared.");
    } catch (error) {
      console.error("Error clearing chat history:", error);
    }
  }
} 