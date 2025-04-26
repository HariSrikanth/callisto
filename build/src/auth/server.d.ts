import { OAuth2Client } from 'google-auth-library';
export declare class AuthServer {
    private baseOAuth2Client;
    private flowOAuth2Client;
    private app;
    private server;
    private tokenManager;
    private portRange;
    authCompletedSuccessfully: boolean;
    constructor(oauth2Client: OAuth2Client);
    private setupRoutes;
    start(openBrowser?: boolean): Promise<boolean>;
    private startServerOnAvailablePort;
    getRunningPort(): number | null;
    stop(): Promise<void>;
}
