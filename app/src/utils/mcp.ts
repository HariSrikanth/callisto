import { Anthropic } from "@anthropic-ai/sdk";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface MCPResponse {
  response: string;
  context?: string;
  action?: {
    type: string;
    details: any;
  };
}

class MCPError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'MCPError';
  }
}

export class MCPClient {
  private anthropic: Anthropic;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new MCPError('ANTHROPIC_API_KEY not found in environment variables');
    }

    this.anthropic = new Anthropic({
      apiKey
    });
  }

  private async retry<T>(operation: () => Promise<T>, retries = this.MAX_RETRIES): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0) {
        console.log(`Retrying operation, ${retries} attempts remaining...`);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        return this.retry(operation, retries - 1);
      }
      throw error;
    }
  }

  private validateResponse(response: string): MCPResponse {
    try {
      const parsed = JSON.parse(response);
      
      // Validate required fields
      if (!parsed.response) {
        throw new MCPError('Response missing required field: response');
      }

      // Ensure action has required structure if present
      if (parsed.action && (!parsed.action.type || !parsed.action.details)) {
        throw new MCPError('Invalid action structure in response');
      }

      return parsed;
    } catch (error) {
      if (error instanceof MCPError) throw error;
      
      // If parsing fails, wrap the raw response in our format
      return {
        response,
        context: 'Raw model response',
        action: {
          type: 'general',
          details: {}
        }
      };
    }
  }

  public async makeQuery(prompt: string): Promise<string> {
    console.log('🚀 Initiating query to Claude...', {
      promptLength: prompt.length,
      preview: prompt.slice(0, 100) + '...'
    });

    try {
      const response = await this.retry(async () => {
        const message = await this.anthropic.messages.create({
          model: 'claude-3-opus-20240229',
          max_tokens: 4096,
          temperature: 0.7,
          messages: [{
            role: 'user',
            content: prompt
          }],
          system: "You are an AI assistant helping process and analyze conversation transcripts. Always provide responses in the specified JSON format with proper structure."
        });

        return message.content[0].text;
      });

      console.log('✨ Received response from Claude', {
        preview: response.slice(0, 100) + '...'
      });

      // Validate and format response
      const formatted = this.validateResponse(response);
      return JSON.stringify(formatted);

    } catch (error) {
      console.error('❌ Error in makeQuery:', error);
      
      // Return a formatted error response
      const errorResponse: MCPResponse = {
        response: `Error processing query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context: 'Error occurred during processing',
        action: {
          type: 'error',
          details: { error: true }
        }
      };
      
      return JSON.stringify(errorResponse);
    }
  }
}

// Export singleton instance
export const mcpClient = new MCPClient();

// Export makeQuery as a standalone function
export async function makeQuery(prompt: string): Promise<string> {
  return mcpClient.makeQuery(prompt);
} 