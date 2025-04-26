import { OAuth2Client } from 'google-auth-library';
export declare function getGoogleAuthClient(): Promise<OAuth2Client>;
export declare function getRefreshToken(): Promise<string>;
export declare function validateRefreshToken(): Promise<boolean>;
