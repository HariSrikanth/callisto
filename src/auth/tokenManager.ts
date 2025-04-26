import { OAuth2Client, Credentials } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getSetupConfigPath } from './utils.js';
import { GaxiosError } from 'gaxios';

export class TokenManager {
  private oauth2Client: OAuth2Client;
  private configPath: string;

  constructor(oauth2Client: OAuth2Client) {
    this.oauth2Client = oauth2Client;
    this.configPath = getSetupConfigPath();
    this.setupTokenRefresh();
  }

  private setupTokenRefresh(): void {
    this.oauth2Client.on('tokens', async (tokens: Credentials) => {
      try {
        await this.saveTokens(tokens);
      } catch (error) {
        console.error('Error saving tokens:', error);
      }
    });
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  async saveTokens(tokens: Credentials): Promise<void> {
    try {
      const config = JSON.parse(await fs.readFile(this.configPath, 'utf-8'));
      config.google.refreshToken = tokens.refresh_token;
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new Error(`Error saving tokens: ${error instanceof Error ? error.message : error}`);
    }
  }

  async loadSavedTokens(): Promise<Credentials | null> {
    try {
      const config = JSON.parse(await fs.readFile(this.configPath, 'utf-8'));
      return { refresh_token: config.google.refreshToken };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new Error(`Error loading tokens: ${error instanceof Error ? error.message : error}`);
    }
  }

  async validateTokens(): Promise<boolean> {
    try {
      const tokens = await this.loadSavedTokens();
      if (!tokens) {
        return false;
      }

      this.oauth2Client.setCredentials(tokens);
      await this.oauth2Client.getAccessToken();
      return true;
    } catch (error) {
      if (error instanceof GaxiosError && error.response?.data?.error === 'invalid_grant') {
        console.error('Error validating tokens: Invalid grant. Token likely expired or revoked.');
        return false;
      }
      console.error('Error validating tokens:', error);
      return false;
    }
  }

  async refreshTokensIfNeeded(): Promise<boolean> {
    const expiryDate = this.oauth2Client.credentials.expiry_date;
    const isExpired = expiryDate
      ? Date.now() >= expiryDate - 5 * 60 * 1000 // 5 minute buffer
      : !this.oauth2Client.credentials.access_token; // No token means we need one

    if (isExpired && this.oauth2Client.credentials.refresh_token) {
      console.error("Auth token expired or nearing expiry, refreshing...");
      try {
        const response = await this.oauth2Client.refreshAccessToken();
        const newTokens = response.credentials;

        if (!newTokens.access_token) {
          throw new Error("Received invalid tokens during refresh");
        }
        // The 'tokens' event listener should handle saving
        this.oauth2Client.setCredentials(newTokens);
        console.error("Token refreshed successfully");
        return true;
      } catch (refreshError) {
        if (refreshError instanceof GaxiosError && refreshError.response?.data?.error === 'invalid_grant') {
            console.error("Error refreshing auth token: Invalid grant. Token likely expired or revoked. Please re-authenticate.");
            return false; // Indicate failure due to invalid grant
        } else {
            // Handle other refresh errors
            console.error("Error refreshing auth token:", refreshError);
            return false;
        }
      }
    } else if (!this.oauth2Client.credentials.access_token && !this.oauth2Client.credentials.refresh_token) {
        console.error("No access or refresh token available. Please re-authenticate.");
        return false;
    } else {
        // Token is valid or no refresh token available
        return true;
    }
  }
} 