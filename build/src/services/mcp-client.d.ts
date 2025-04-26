import { MCPClientInterface, McpConfig, SetupConfig } from '../types/index.js';
export declare class MCPClient implements MCPClientInterface {
    private anthropic;
    private mcps;
    private tools;
    private toolToServerMap;
    private messages;
    private chatHistoryFile;
    private setupConfig;
    private readonly REQUEST_TIMEOUT;
    private pendingMessages;
    constructor();
    private substituteEnvVars;
    private processConfig;
    private loadChatHistory;
    private saveChatHistory;
    private getToolSchema;
    connectToServers(mcpConfig: McpConfig, setupConfig: SetupConfig): Promise<void>;
    private stageMessage;
    private requiresConfirmation;
    private handleConfirmation;
    private handleRejection;
    private executeToolCall;
    processQuery(query: string): Promise<string>;
    chatLoop(): Promise<void>;
    cleanup(): Promise<void>;
}
