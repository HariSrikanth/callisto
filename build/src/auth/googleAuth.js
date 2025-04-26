import { google } from 'googleapis';
import readline from 'readline/promises';
import fs from 'fs/promises';
import path from 'path';
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
export async function getGoogleAuthClient() {
    const setupConfigPath = path.join(process.cwd(), 'setup-config.json');
    const setupConfig = JSON.parse(await fs.readFile(setupConfigPath, 'utf-8'));
    const { clientId, clientSecret } = setupConfig.google;
    if (!clientId || !clientSecret) {
        throw new Error('Client ID and Client Secret must be set in setup-config.json');
    }
    console.log('Creating OAuth2 client with:');
    console.log('Client ID:', clientId);
    console.log('Client Secret:', clientSecret ? '***' : 'not set');
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:4100/code');
    return oauth2Client;
}
export async function getRefreshToken() {
    try {
        const oauth2Client = await getGoogleAuthClient();
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
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        try {
            const code = await rl.question('');
            console.log('\nExchanging authorization code for tokens...');
            const { tokens } = await oauth2Client.getToken(code);
            console.log('Token exchange successful');
            if (!tokens.refresh_token) {
                throw new Error('No refresh token received. Please try again with a new authorization code.');
            }
            // Update setup-config.json with the new refresh token
            const setupConfigPath = path.join(process.cwd(), 'setup-config.json');
            const setupConfig = JSON.parse(await fs.readFile(setupConfigPath, 'utf-8'));
            setupConfig.google.refreshToken = tokens.refresh_token;
            await fs.writeFile(setupConfigPath, JSON.stringify(setupConfig, null, 2));
            console.log('Refresh token has been saved to setup-config.json');
            return tokens.refresh_token;
        }
        finally {
            rl.close();
        }
    }
    catch (error) {
        console.error('\n=== OAuth Error ===');
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        else {
            console.error('Unknown error:', error);
        }
        throw error;
    }
}
export async function validateRefreshToken() {
    try {
        const setupConfigPath = path.join(process.cwd(), 'setup-config.json');
        const setupConfig = JSON.parse(await fs.readFile(setupConfigPath, 'utf-8'));
        if (!setupConfig.google.refreshToken) {
            console.log('No refresh token found in setup-config.json');
            return false;
        }
        console.log('Validating refresh token...');
        const oauth2Client = await getGoogleAuthClient();
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
//# sourceMappingURL=googleAuth.js.map