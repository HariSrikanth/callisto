"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeOAuth2Client = initializeOAuth2Client;
exports.loadCredentials = loadCredentials;
exports.getRefreshToken = getRefreshToken;
exports.validateRefreshToken = validateRefreshToken;
var google_auth_library_1 = require("google-auth-library");
var fs = require("fs/promises");
var path_1 = require("path");
var dotenv_1 = require("dotenv");
var utils_js_1 = require("./utils.js");
var SCOPES = [
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
var possibleEnvPaths = [
    path_1.default.join(process.cwd(), '.env'),
    path_1.default.join(process.cwd(), '..', '.env'),
    path_1.default.join(process.cwd(), '..', '..', '.env')
];
for (var _i = 0, possibleEnvPaths_1 = possibleEnvPaths; _i < possibleEnvPaths_1.length; _i++) {
    var envPath = possibleEnvPaths_1[_i];
    try {
        var result = dotenv_1.default.config({ path: envPath });
        if (!result.error) {
            console.log("Loaded .env from ".concat(envPath));
            break;
        }
    }
    catch (error) {
        // Continue to next path if this one fails
        continue;
    }
}
function initializeOAuth2Client() {
    return __awaiter(this, void 0, void 0, function () {
        var keysContent, keys, _a, client_id, client_secret, redirect_uris, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs.readFile((0, utils_js_1.getKeysFilePath)(), "utf-8")];
                case 1:
                    keysContent = _b.sent();
                    keys = JSON.parse(keysContent);
                    _a = keys.installed, client_id = _a.client_id, client_secret = _a.client_secret, redirect_uris = _a.redirect_uris;
                    // Use the first redirect URI as the default for the base client
                    return [2 /*return*/, new google_auth_library_1.OAuth2Client({
                            clientId: client_id,
                            clientSecret: client_secret,
                            redirectUri: redirect_uris[0],
                        })];
                case 2:
                    error_1 = _b.sent();
                    throw new Error("Error loading OAuth keys: ".concat(error_1 instanceof Error ? error_1.message : error_1));
                case 3: return [2 /*return*/];
            }
        });
    });
}
function loadCredentials() {
    return __awaiter(this, void 0, void 0, function () {
        var keysContent, keys, _a, client_id, client_secret, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs.readFile((0, utils_js_1.getKeysFilePath)(), "utf-8")];
                case 1:
                    keysContent = _b.sent();
                    keys = JSON.parse(keysContent);
                    _a = keys.installed, client_id = _a.client_id, client_secret = _a.client_secret;
                    if (!client_id || !client_secret) {
                        throw new Error('Client ID or Client Secret missing in keys file.');
                    }
                    return [2 /*return*/, { client_id: client_id, client_secret: client_secret }];
                case 2:
                    error_2 = _b.sent();
                    throw new Error("Error loading credentials: ".concat(error_2 instanceof Error ? error_2.message : error_2));
                case 3: return [2 /*return*/];
            }
        });
    });
}
function getRefreshToken() {
    return __awaiter(this, void 0, void 0, function () {
        var oauth2Client, authUrl, readline, code, tokens, envPath, envContent;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, initializeOAuth2Client()];
                case 1:
                    oauth2Client = _a.sent();
                    authUrl = oauth2Client.generateAuthUrl({
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
                    readline = require('readline').createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 7, 8]);
                    return [4 /*yield*/, new Promise(function (resolve) {
                            readline.question('', function (answer) { return resolve(answer); });
                        })];
                case 3:
                    code = _a.sent();
                    console.log('\nExchanging authorization code for tokens...');
                    return [4 /*yield*/, oauth2Client.getToken(code)];
                case 4:
                    tokens = (_a.sent()).tokens;
                    console.log('Token exchange successful');
                    if (!tokens.refresh_token) {
                        throw new Error('No refresh token received. Please try again with a new authorization code.');
                    }
                    envPath = path_1.default.join(process.cwd(), '.env');
                    return [4 /*yield*/, fs.readFile(envPath, 'utf-8')];
                case 5:
                    envContent = _a.sent();
                    // Check if GOOGLE_REFRESH_TOKEN already exists in .env
                    if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                        envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, "GOOGLE_REFRESH_TOKEN=".concat(tokens.refresh_token));
                    }
                    else {
                        envContent += "\nGOOGLE_REFRESH_TOKEN=".concat(tokens.refresh_token);
                    }
                    return [4 /*yield*/, fs.writeFile(envPath, envContent)];
                case 6:
                    _a.sent();
                    console.log('Refresh token has been saved to .env file');
                    return [2 /*return*/, tokens.refresh_token];
                case 7:
                    readline.close();
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    });
}
function validateRefreshToken() {
    return __awaiter(this, void 0, void 0, function () {
        var tokenPath, tokenContent, tokens, oauth2Client, token, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    tokenPath = (0, utils_js_1.getSecureTokenPath)();
                    return [4 /*yield*/, fs.readFile(tokenPath, 'utf-8')];
                case 1:
                    tokenContent = _a.sent();
                    tokens = JSON.parse(tokenContent);
                    if (!tokens.refresh_token) {
                        console.log('No refresh token found in .gcp-saved-tokens.json');
                        return [2 /*return*/, false];
                    }
                    return [4 /*yield*/, initializeOAuth2Client()];
                case 2:
                    oauth2Client = _a.sent();
                    oauth2Client.setCredentials({
                        refresh_token: tokens.refresh_token
                    });
                    return [4 /*yield*/, oauth2Client.getAccessToken()];
                case 3:
                    token = (_a.sent()).token;
                    console.log('Refresh token is valid');
                    return [2 /*return*/, true];
                case 4:
                    error_3 = _a.sent();
                    if (error_3.code === 'ENOENT') {
                        console.log('No .gcp-saved-tokens.json file found');
                        return [2 /*return*/, false];
                    }
                    console.error('Error validating refresh token:', error_3);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
