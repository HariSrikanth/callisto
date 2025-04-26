import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/contacts.other.readonly',
    'https://www.googleapis.com/auth/contacts.readonly'
];
// Try to load .env from multiple possible locations
const possibleEnvPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '..', '..', '.env')
];
for (const envPath of possibleEnvPaths) {
    try {
        const result = dotenv.config({ path: envPath });
        if (!result.error) {
            console.log(`Loaded .env from ${envPath}`);
            break;
        }
    }
    catch (error) {
        // Continue to next path if this one fails
        continue;
    }
}
export async function loadCredentials() {
    try {
        const setupConfigPath = path.join(process.cwd(), 'setup-config.json');
        const setupConfigContent = await fs.readFile(setupConfigPath, 'utf-8');
        const setupConfig = JSON.parse(setupConfigContent);
        const { clientId, clientSecret } = setupConfig.google;
        if (!clientId || !clientSecret) {
            throw new Error('Client ID or Client Secret missing in setup-config.json');
        }
        return { client_id: clientId, client_secret: clientSecret };
    }
    catch (error) {
        throw new Error(`Error loading credentials: ${error instanceof Error ? error.message : error}`);
    }
}
export async function getRefreshToken() {
    const { client_id, client_secret } = await loadCredentials();
    const oauth2Client = new OAuth2Client(client_id, client_secret, 'http://localhost:4100/code');
    // Generate the URL for user consent
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });
    console.log('\n=== OAuth Configuration ===');
    console.log('Scopes:', SCOPES);
    console.log('Access Type: offline');
    console.log('Prompt: consent');
    console.log('Redirect URI: http://localhost:4100/code');
    console.log('\n=== Authorization URL ===');
    console.log(authUrl);
    console.log('\nPlease visit this URL in your browser and authorize the application.');
    console.log('After authorization, you will be redirected to a page with a code.');
    console.log('Copy that code and paste it here:');
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    try {
        const code = await new Promise((resolve) => {
            readline.question('', (answer) => resolve(answer));
        });
        console.log('\nExchanging authorization code for tokens...');
        const { tokens } = await oauth2Client.getToken(code);
        console.log('Token exchange successful');
        if (!tokens.refresh_token) {
            throw new Error('No refresh token received. Please try again with a new authorization code.');
        }
        // Update setup-config.json with the new refresh token
        const setupConfigPath = path.join(process.cwd(), 'setup-config.json');
        const setupConfigContent = await fs.readFile(setupConfigPath, 'utf-8');
        const setupConfig = JSON.parse(setupConfigContent);
        setupConfig.google.refreshToken = tokens.refresh_token;
        await fs.writeFile(setupConfigPath, JSON.stringify(setupConfig, null, 2));
        console.log('Refresh token has been saved to setup-config.json');
        return tokens.refresh_token;
    }
    finally {
        readline.close();
    }
}
export async function validateRefreshToken() {
    try {
        const setupConfigPath = path.join(process.cwd(), 'setup-config.json');
        const setupConfigContent = await fs.readFile(setupConfigPath, 'utf-8');
        const setupConfig = JSON.parse(setupConfigContent);
        if (!setupConfig.google.refreshToken) {
            console.log('No refresh token found in setup-config.json');
            return false;
        }
        const { client_id, client_secret } = await loadCredentials();
        const oauth2Client = new OAuth2Client(client_id, client_secret);
        oauth2Client.setCredentials({
            refresh_token: setupConfig.google.refreshToken
        });
        // Try to get a new access token to validate the refresh token
        const { token } = await oauth2Client.getAccessToken();
        console.log('Refresh token is valid');
        return true;
    }
    catch (error) {
        console.error('Error validating refresh token:', error);
        return false;
    }
}
//# sourceMappingURL=client.js.map