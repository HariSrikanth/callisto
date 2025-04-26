import fs from 'fs';
import path from 'path';
import { GcpCredentials } from '../types/index.js';
import { GCP_SAVED_TOKENS_FILE } from '../config/constants.js';

export async function loadGcpCredentials(): Promise<GcpCredentials> {
  try {
    // Get client credentials from environment variables
    const client_id = process.env.GOOGLE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;

    if (!client_id || !client_secret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables');
    }

    // Load saved tokens
    const tokenPath = path.join(process.cwd(), GCP_SAVED_TOKENS_FILE);
    console.log('Loading saved tokens from:', tokenPath);
    const tokenContent = await fs.promises.readFile(tokenPath, 'utf-8');
    const tokens = JSON.parse(tokenContent);

    if (!tokens.refresh_token) {
      throw new Error('No refresh token found in saved tokens file');
    }

    console.log('Successfully loaded GCP credentials');
    return {
      client_id,
      client_secret,
      refresh_token: tokens.refresh_token
    };
  } catch (error) {
    console.error('Error loading GCP credentials:', error);
    throw new Error('Failed to load GCP credentials from environment variables and saved tokens');
  }
} 