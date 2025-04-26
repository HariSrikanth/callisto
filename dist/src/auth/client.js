import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { getKeysFilePath, getSecureTokenPath } from './utils.js';
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
export async function initializeOAuth2Client() {
    try {
        const keysContent = await fs.readFile(getKeysFilePath(), "utf-8");
        const keys = JSON.parse(keysContent);
        const { client_id, client_secret, redirect_uris } = keys.installed;
        // Use the first redirect URI as the default for the base client
        return new OAuth2Client({
            clientId: client_id,
            clientSecret: client_secret,
            redirectUri: redirect_uris[0],
        });
    }
    catch (error) {
        throw new Error(`Error loading OAuth keys: ${error instanceof Error ? error.message : error}`);
    }
}
export async function loadCredentials() {
    try {
        const keysContent = await fs.readFile(getKeysFilePath(), "utf-8");
        const keys = JSON.parse(keysContent);
        const { client_id, client_secret } = keys.installed;
        if (!client_id || !client_secret) {
            throw new Error('Client ID or Client Secret missing in keys file.');
        }
        return { client_id, client_secret };
    }
    catch (error) {
        throw new Error(`Error loading credentials: ${error instanceof Error ? error.message : error}`);
    }
}
export async function getRefreshToken() {
    const oauth2Client = await initializeOAuth2Client();
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
    console.log('Redirect URI: urn:ietf:wg:oauth:2.0:oob');
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
        // Save the refresh token to .env
        const envPath = path.join(process.cwd(), '.env');
        let envContent = await fs.readFile(envPath, 'utf-8');
        // Check if GOOGLE_REFRESH_TOKEN already exists in .env
        if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
            envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
        }
        else {
            envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
        }
        await fs.writeFile(envPath, envContent);
        console.log('Refresh token has been saved to .env file');
        return tokens.refresh_token;
    }
    finally {
        readline.close();
    }
}
export async function validateRefreshToken() {
    try {
        const tokenPath = getSecureTokenPath();
        const tokenContent = await fs.readFile(tokenPath, 'utf-8');
        const tokens = JSON.parse(tokenContent);
        if (!tokens.refresh_token) {
            console.log('No refresh token found in .gcp-saved-tokens.json');
            return false;
        }
        const oauth2Client = await initializeOAuth2Client();
        oauth2Client.setCredentials({
            refresh_token: tokens.refresh_token
        });
        // Try to get a new access token to validate the refresh token
        const { token } = await oauth2Client.getAccessToken();
        console.log('Refresh token is valid');
        return true;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            console.log('No .gcp-saved-tokens.json file found');
            return false;
        }
        console.error('Error validating refresh token:', error);
        return false;
    }
}
