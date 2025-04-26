import { OAuth2Client, Credentials } from 'google-auth-library';
export declare class TokenManager {
    private oauth2Client;
    private configPath;
    constructor(oauth2Client: OAuth2Client);
    private setupTokenRefresh;
    getConfigPath(): string;
    saveTokens(tokens: Credentials): Promise<void>;
    loadSavedTokens(): Promise<Credentials | null>;
    validateTokens(): Promise<boolean>;
    refreshTokensIfNeeded(): Promise<boolean>;
}
