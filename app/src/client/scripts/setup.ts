import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface UserContext {
  name: string;
  role: string;
  company: string;
  location: string;
  timezone: string;
}

interface SetupConfig {
  userContext: UserContext;
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

async function promptUser(rl: readline.Interface, question: string): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

async function setupGoogleAuth(rl: readline.Interface): Promise<{ clientId: string; clientSecret: string; refreshToken: string }> {
  console.log('\n=== Google OAuth Setup ===');
  console.log('Please provide your Google OAuth credentials.');
  console.log('You can find these in your Google Cloud Console: https://console.cloud.google.com');
  
  let clientId = process.env.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId) {
    clientId = await promptUser(rl, 'Google Client ID: ');
  }
  if (!clientSecret) {
    clientSecret = await promptUser(rl, 'Google Client Secret: ');
  }

  // Start OAuth flow
  const oauth2Client = new OAuth2Client(
    clientId,
    clientSecret,
    'http://localhost:4100/code'
  );

  const scopes = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.send'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  console.log('\nTrying to open browser for Google OAuth...');
  try {
    const openModule = await import('open');
    await openModule.default(authUrl);
    console.log('Browser opened successfully!');
  } catch (error) {
    console.log('Failed to open browser automatically. Please open this URL manually:');
    console.log('\n' + authUrl + '\n');
  }

  // Start local server to receive the code
  const app = express();
  let code: string | null = null;
  let serverError: Error | null = null;

  const server = app.listen(4100, () => {
    console.log('Waiting for OAuth callback on http://localhost:4100/code ...');
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', (error) => {
      serverError = error;
      reject(error);
    });

    app.get('/code', async (req, res) => {
      try {
        code = req.query.code as string;
        if (!code) {
          throw new Error('No authorization code received');
        }
        res.send('Authorization successful! You can close this window.');
        resolve();
      } catch (error) {
        serverError = error as Error;
        res.status(500).send('Authorization failed. Please try again.');
        reject(error);
      }
    });
  });

  server.close();

  if (serverError) {
    throw serverError;
  }

  if (!code) {
    throw new Error('Failed to get authorization code');
  }

  // Exchange code for tokens
  console.log('\nExchanging authorization code for tokens...');
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('No refresh token received. Please revoke application access in Google Cloud Console and try again.');
  }
  console.log('Successfully obtained refresh token!');

  return {
    clientId,
    clientSecret,
    refreshToken: tokens.refresh_token
  };
}

async function setupUserContext(rl: readline.Interface): Promise<UserContext> {
  console.log('\n=== User Context Setup ===');
  const name = await promptUser(rl, 'What is your name? ');
  const role = await promptUser(rl, 'What is your role? ');
  const company = await promptUser(rl, 'Where do you work? ');
  const location = await promptUser(rl, 'What is your primary work location? ');
  const timezone = await promptUser(rl, 'What is your timezone? (e.g., America/Los_Angeles) ');

  return { name, role, company, location, timezone };
}

async function setupSlack(rl: readline.Interface): Promise<{ botToken: string; teamId: string; channels: string[] }> {
  console.log('\n=== Slack Setup ===');
  console.log('Please provide your Slack Bot Token and Team ID.');
  console.log('You can find these in your Slack App settings at https://api.slack.com/apps');
  
  const botToken = await promptUser(rl, 'Slack Bot Token (starts with xoxb-): ');
  const teamId = await promptUser(rl, 'Slack Team ID (starts with T): ');

  let channels: string[] = [];
  try {
    // Connect to Slack to get available channels
    console.log('\nConnecting to Slack to fetch available channels...');
    const client = new Client({
      name: 'setup-script',
      version: '1.0.0',
    });

    const serverUrl = new URL('https://server.smithery.ai/@KaranThink41/official-slack-mcp/mcp');
    serverUrl.searchParams.set('config', btoa(JSON.stringify({
      SLACK_BOT_TOKEN: botToken,
      SLACK_TEAM_ID: teamId
    })));
    serverUrl.searchParams.set('api_key', process.env.SMITHERY_API_KEY || '');

    const transport = new StreamableHTTPClientTransport(serverUrl);
    await client.connect(transport);

    // Get available channels
    const result = await client.callTool({
      name: 'slack_list_channels',
      arguments: { limit: 100 }
    });

    channels = (result.content as any).channels.map((ch: any) => ch.id);
    console.log(`Found ${channels.length} channels`);
  } catch (error) {
    console.warn('\nWarning: Failed to fetch Slack channels. Setup will continue with empty channel list.');
    console.warn('Error details:', error);
  }

  return { botToken, teamId, channels };
}

async function setupCalendars(rl: readline.Interface, googleConfig: { clientId: string; clientSecret: string; refreshToken: string }): Promise<string[]> {
  console.log('\n=== Calendar Setup ===');
  console.log('Connecting to Google Calendar to fetch available calendars...');

  let calendars: string[] = [];
  try {
    // Connect to Google Calendar MCP
    const client = new Client({
      name: 'setup-script',
      version: '1.0.0',
    });

    const serverUrl = new URL('https://server.smithery.ai/@rishipradeep-think41/gsuite-mcp/mcp');
    serverUrl.searchParams.set('config', btoa(JSON.stringify({
      googleClientId: googleConfig.clientId,
      googleClientSecret: googleConfig.clientSecret,
      googleRefreshToken: googleConfig.refreshToken
    })));
    serverUrl.searchParams.set('api_key', process.env.SMITHERY_API_KEY || '');

    const transport = new StreamableHTTPClientTransport(serverUrl);
    await client.connect(transport);

    // Get available calendars
    const result = await client.callTool({
      name: 'list_calendars',
      arguments: {}
    });

    calendars = (result.content as any).calendars.map((cal: any) => cal.id);
    console.log(`Found ${calendars.length} calendars`);
  } catch (error) {
    console.warn('\nWarning: Failed to fetch Google calendars. Setup will continue with empty calendar list.');
    console.warn('Error details:', error);
  }

  return calendars;
}

async function saveConfig(config: SetupConfig) {
  const clientDir = path.join(process.cwd(), 'src', 'client');
  const configPath = path.join(clientDir, 'setup-config.json');
  const envPath = path.join(clientDir, '.env');

  // Ensure client directory exists
  await fs.promises.mkdir(clientDir, { recursive: true });

  // Save setup config
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
  console.log('\nConfiguration saved to src/client/setup-config.json');

  // Update .env file
  const envContent = `
ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}
SMITHERY_API_KEY=${process.env.SMITHERY_API_KEY || ''}
EXA_API_KEY=${process.env.EXA_API_KEY || ''}
GOOGLE_CLIENT_ID=${config.google.clientId}
GOOGLE_CLIENT_SECRET=${config.google.clientSecret}
SLACK_BOT_TOKEN=${config.slack.botToken}
SLACK_TEAM_ID=${config.slack.teamId}
`.trim();

  await fs.promises.writeFile(envPath, envContent);
  console.log('Environment variables saved to src/client/.env');
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('=== Callisto Setup ===');
    console.log('This script will help you set up Callisto with your preferences and credentials.');

    // Setup Google OAuth first
    const googleConfig = await setupGoogleAuth(rl);

    // Setup user context
    const userContext = await setupUserContext(rl);

    // Setup Slack
    const slack = await setupSlack(rl);

    // Setup calendars
    const calendars = await setupCalendars(rl, googleConfig);

    // Save configuration
    const config: SetupConfig = {
      userContext,
      slack,
      calendars,
      google: googleConfig
    };

    await saveConfig(config);

    console.log('\n=== Setup Complete ===');
    console.log('You can now run the main application with: npm start');
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch(console.error); 