import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export type { MessageParam };

// Tool-related type definitions based on Anthropic API
export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResultBlockParam {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  tool_name?: string;
  parameters?: Record<string, unknown>;
}

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: { [key: string]: string };
  smithery?: {
    url: string;
    apiKey: string;
    config: Record<string, unknown>;
  };
}

export interface McpConfig {
  mcpServers: {
    [serverName: string]: McpServerConfig;
  };
}

export interface GcpCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

export interface SetupConfig {
  userContext: {
    name: string;
    email: string;
    role: string;
    company: string;
    location: string;
    timezone: string;
  };
  slack: {
    botToken: string;
    teamId: string;
    channels: string[];
  };
  calendars: string[];
  google: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
}

export interface MCPClientInterface {
  connectToServers(mcpConfig: McpConfig, setupConfig: SetupConfig): Promise<void>;
  processQuery(query: string): Promise<string>;
  chatLoop(): Promise<void>;
  cleanup(): Promise<void>;
}

export interface PendingMessage {
  type: 'email' | 'slack';
  content: {
    to?: string;
    channel?: string;
    subject?: string;
    message: string;
  };
  timestamp: Date;
}

export interface WorkflowState {
  id: string;
  type: 'search' | 'email' | 'calendar' | 'slack';
  status: 'staging' | 'ready' | 'pending_approval' | 'completed';
  context: {
    messages: MessageParam[];
    toolCalls: ToolUseBlock[];
    results: ToolResultBlockParam[];
  };
  requiresApproval: boolean;
}

export interface MeetingContext {
  companyInfo: Map<string, any>;
  personInfo: Map<string, any>;
  documentHistory: Map<string, any>;
  calendarEvents: any[];
  activeWorkflows: Map<string, WorkflowState>;
  pendingWorkflows: Map<string, WorkflowState>;
}

export interface TranscriptChunk {
  speaker: string;
  content: string;
  timestamp: Date;
} 