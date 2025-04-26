export declare function loadCredentials(): Promise<{
    client_id: string;
    client_secret: string;
}>;
export declare function getRefreshToken(): Promise<string>;
export declare function validateRefreshToken(): Promise<boolean>;
