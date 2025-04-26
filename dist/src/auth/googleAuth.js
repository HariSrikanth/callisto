import { google } from 'googleapis';
import readline from 'readline/promises';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();
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
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
    }
    console.log('Creating OAuth2 client with:');
    console.log('Client ID:', clientId);
    console.log('Client Secret:', clientSecret ? '***' : 'not set');
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
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
        console.log('Redirect URI: urn:ietf:wg:oauth:2.0:oob');
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
            // Save the refresh token to .env
            const envPath = path.join(process.cwd(), '.env');
            let envContent = fs.readFileSync(envPath, 'utf-8');
            // Check if GOOGLE_REFRESH_TOKEN already exists in .env
            if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
            }
            else {
                envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
            }
            fs.writeFileSync(envPath, envContent);
            console.log('Refresh token has been saved to .env file');
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
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) {
        console.log('No refresh token found in .env file');
        return false;
    }
    try {
        console.log('Validating refresh token...');
        const oauth2Client = await getGoogleAuthClient();
        oauth2Client.setCredentials({
            refresh_token: refreshToken
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
