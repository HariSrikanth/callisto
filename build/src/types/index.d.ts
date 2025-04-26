import { MessageParam, Tool, ToolResultBlockParam, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
export type { MessageParam, Tool, ToolResultBlockParam, ToolUseBlock };
export interface McpServerConfig {
    command?: string;
    args?: string[];
    env?: {
        [key: string]: string;
    };
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
