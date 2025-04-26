import { MCPClient } from '../src/client/src/services/mcp-client.js';
import { McpConfig } from '../src/client/src/types/index.js';
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import dotenv from 'dotenv';

// Load environment variables from client directory
dotenv.config({ path: path.join(__dirname, '../src/client/.env') });

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
  },
  
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
  }
};

// Add debug mode state
let debugMode = false;

function formatToolResult(result: any): string {
  if (typeof result === 'string') {
    try {
      // Try to parse JSON for better formatting
      const parsed = JSON.parse(result);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return result;
    }
  }
  return JSON.stringify(result, null, 2);
}

function formatOutput(type: string, content: string) {
  switch (type) {
    case 'EXA_SEARCH':
      return `${colors.fg.cyan}[EXA SEARCH]${colors.reset} ${content}`;
    case 'CALENDAR':
      return `${colors.fg.yellow}[CALENDAR]${colors.reset} ${content}`;
    case 'EMAIL':
      return `${colors.fg.green}[EMAIL]${colors.reset} ${content}`;
    case 'SLACK':
      return `${colors.fg.magenta}[SLACK]${colors.reset} ${content}`;
    case 'ERROR':
      return `${colors.fg.red}[ERROR]${colors.reset} ${content}`;
    case 'HELP':
      return `${colors.fg.blue}[HELP]${colors.reset} ${content}`;
    case 'INPUT':
      return `${colors.fg.white}[INPUT]${colors.reset} ${content}`;
    case 'RESPONSE':
      return `${colors.fg.green}[RESPONSE]${colors.reset} ${content}`;
    case 'WORKFLOW':
      return `${colors.fg.yellow}[WORKFLOW]${colors.reset} ${content}`;
    case 'TOOL_RESULT':
      return `${colors.fg.blue}[TOOL RESULT]${colors.reset}\n${content}`;
    case 'DEBUG':
      return `${colors.fg.magenta}[DEBUG]${colors.reset} ${content}`;
    default:
      return content;
  }
}

function formatRawData(data: any): string {
  return JSON.stringify(data, null, 2);
}

function printHelp() {
  console.log(`\n${colors.bright}Available Commands:${colors.reset}`);
  console.log(`${colors.dim}----------------------------------------${colors.reset}`);
  console.log(`${colors.fg.cyan}help${colors.reset} - Show this help menu`);
  console.log(`${colors.fg.cyan}clear${colors.reset} - Clear the screen`);
  console.log(`${colors.fg.cyan}quit${colors.reset} - Exit the program`);
  console.log(`${colors.fg.cyan}sample${colors.reset} - Load sample transcript`);
  console.log(`${colors.fg.cyan}debug${colors.reset} - Toggle debug mode (show raw data)`);
  console.log(`${colors.dim}----------------------------------------${colors.reset}`);
  console.log(`\n${colors.bright}Input Format:${colors.reset}`);
  console.log(`${colors.dim}----------------------------------------${colors.reset}`);
  console.log(`${colors.fg.cyan}SCREEN: <message>${colors.reset} - For screen text`);
  console.log(`${colors.fg.cyan}MIC: <message>${colors.reset} - For voice input`);
  console.log(`${colors.dim}----------------------------------------${colors.reset}`);
}

async function processTranscriptLine(client: MCPClient, line: string, rl: readline.Interface) {
  console.log(`\n${colors.bright}${line}${colors.reset}`);
  try {
    const result = await client.processQuery(line);
    
    if (debugMode) {
      console.log(formatOutput('DEBUG', 'Raw Response Data:'));
      console.log(formatRawData(result));
    }
    
    console.log(formatOutput('RESPONSE', result));
    
    // Check for calendar-related content
    if (line.toLowerCase().includes('availability') || 
        line.toLowerCase().includes('schedule') || 
        line.toLowerCase().includes('meeting') || 
        line.toLowerCase().includes('call') || 
        line.toLowerCase().includes('appointment')) {
      // Trigger a calendar check
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const calendarResult = await client.processQuery(`SCREEN: Check my calendar availability from ${now.toISOString()} to ${nextWeek.toISOString()}`);
      
      if (debugMode) {
        console.log(formatOutput('DEBUG', 'Raw Calendar Check Data:'));
        console.log(formatRawData(calendarResult));
      }
      
      console.log(formatOutput('CALENDAR', 'Checking calendar availability...'));
      console.log(formatOutput('TOOL_RESULT', formatToolResult(calendarResult)));
    }
    
    if (client.hasPendingWorkflow) {
      const response = await rl.question("\nResponse (y/n): ");
      await client.handleUserResponse(response);
      
      if (debugMode) {
        console.log(formatOutput('DEBUG', 'Raw Workflow Response Data:'));
        console.log(formatRawData({ response, hasPendingWorkflow: client.hasPendingWorkflow }));
      }
      
      console.log(formatOutput('WORKFLOW', `Workflow ${response.toLowerCase() === 'y' ? 'approved' : 'rejected'}`));
    }
  } catch (error) {
    console.error(formatOutput('ERROR', `Error processing transcript line: ${error}`));
    if (debugMode) {
      console.log(formatOutput('DEBUG', 'Raw Error Data:'));
      console.log(formatRawData(error));
    }
  }
}

async function main() {
  // Check required environment variables
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(formatOutput('ERROR', 'ANTHROPIC_API_KEY environment variable is not set'));
    process.exit(1);
  }

  // Load MCP config from client directory
  const mcpConfigPath = path.join(process.cwd(), 'mcp-config.json');
  if (!fs.existsSync(mcpConfigPath)) {
    console.error(formatOutput('ERROR', 'mcp-config.json not found'));
    process.exit(1);
  }
  const mcpConfig: McpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));

  // Load setup config from client directory
  const setupConfigPath = path.join(process.cwd(), 'setup-config.json');
  if (!fs.existsSync(setupConfigPath)) {
    console.error(formatOutput('ERROR', 'setup-config.json not found'));
    process.exit(1);
  }
  const setupConfig = JSON.parse(fs.readFileSync(setupConfigPath, 'utf-8'));

  // Initialize MCP client
  const client = new MCPClient();
  try {
    await client.connectToServers(mcpConfig, setupConfig);
  } catch (error) {
    console.error(formatOutput('ERROR', `Error connecting to servers: ${error}`));
    process.exit(1);
  }

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`\n${colors.bright}MCP Client Started!${colors.reset}`);
  console.log(`Connected to servers: ${client.connectedServers.join(", ")}`);
  console.log(`\n${colors.bright}Test Meeting: Interactive Mode${colors.reset}`);
  console.log("----------------------------------------");
  printHelp();

  // Sample meeting transcript
  const sampleTranscript = [
    "SCREEN: Morning. Just wanted to sync before our call with Cardless tomorrow. Their co-founder, Michael Spelfell, is joining to discuss their new branded credit card program. Have you had a chance to review their latest pitch deck and product roadmap?",
    "MIC: Hi, Taylor. Yes, I went through their materials yesterday. Their technology for launching branded card products quickly is quite impressive. I see strong potential in their partnerships with sports teams like the Cleveland Cavaliers and Miami Marlins.",
    "SCREEN: That's good to hear. I'm particularly interested in their user acquisition strategy through these sports team partnerships. Do you think this approach gives them a sustainable advantage over competitors like Deserve and Mission Lane?",
    "MIC: Yeah, I think their partnerships strategy is smart. By targeting dedicated fan bases, they're tapping into existing communities with strong loyalty.",
    "SCREEN: Valid points. We should also discuss their revenue model during the call. Their percentage split with the sports franchises seems aggressive.",
    "SCREEN: By the way, do you have availability next week if we need a follow-up with their technical team?",
    "MIC: Yeah, I can do Tuesday afternoon or Wednesday morning next week for a technical deep dive. I'd like to understand more about their infrastructure and how they're handling compliance and security.",
    "SCREEN: Perfect. I'll make sure we cover these points tomorrow. I'll send over some additional questions tonight that we might want to address. Looking forward to the call.",
    "MIC: Yeah, I saw the announcement. It's a significant win for them. The Bulls demographic is younger and potentially more tech-savvy than the baseball fans."
  ];

  while (true) {
    const input = await rl.question(`\n${colors.fg.cyan}Enter command or message (type 'help' for options):${colors.reset} `);
    
    // Handle commands
    if (input.toLowerCase() === 'quit') {
      break;
    } else if (input.toLowerCase() === 'help') {
      printHelp();
      continue;
    } else if (input.toLowerCase() === 'clear') {
      console.clear();
      continue;
    } else if (input.toLowerCase() === 'debug') {
      debugMode = !debugMode;
      console.log(formatOutput('DEBUG', `Debug mode ${debugMode ? 'enabled' : 'disabled'}`));
      continue;
    } else if (input.toLowerCase() === 'sample') {
      console.log(`\n${colors.bright}Loading sample transcript...${colors.reset}`);
      for (const line of sampleTranscript) {
        await processTranscriptLine(client, line, rl);
      }
      continue;
    }

    // Process user input
    if (input.startsWith('SCREEN:') || input.startsWith('MIC:')) {
      await processTranscriptLine(client, input, rl);
    } else {
      console.log(formatOutput('ERROR', 'Invalid input format. Use SCREEN: or MIC: prefix.'));
    }
  }

  // Cleanup
  try {
    await client.cleanup();
  } catch (error) {
    console.error(formatOutput('ERROR', `Error during cleanup: ${error}`));
  }
  rl.close();
}

main().catch(error => {
  console.error(formatOutput('ERROR', `Fatal error: ${error}`));
  process.exit(1);
}); 