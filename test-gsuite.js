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
var streamableHttp_js_1 = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
var index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
var client_js_1 = require("./src/auth/client.js");
var fs = require("fs/promises");
var path_1 = require("path");
function testGSuiteConnection() {
    return __awaiter(this, void 0, void 0, function () {
        var credentials, setupConfig, serverUrl, config, configString, transport, client, tools, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, (0, client_js_1.loadCredentials)()];
                case 1:
                    credentials = _a.sent();
                    console.log('Loaded credentials successfully');
                    return [4 /*yield*/, fs.readFile('setup-config.json', 'utf-8')];
                case 2:
                    setupConfig = JSON.parse(_a.sent());
                    serverUrl = new URL("https://server.smithery.ai/@rishipradeep-think41/gsuite-mcp/mcp");
                    config = {
                        googleClientId: credentials.client_id,
                        googleClientSecret: credentials.client_secret,
                        googleRefreshToken: setupConfig.google.refreshToken
                    };
                    // Log the config for debugging
                    console.log('Config:', JSON.stringify(config, null, 2));
                    configString = JSON.stringify(config);
                    serverUrl.searchParams.set("config", btoa(configString));
                    serverUrl.searchParams.set("api_key", process.env.SMITHERY_API_KEY || '');
                    console.log('Connecting to:', serverUrl.toString());
                    transport = new streamableHttp_js_1.StreamableHTTPClientTransport(serverUrl);
                    client = new index_js_1.Client({
                        name: "Test client",
                        version: "1.0.0"
                    });
                    // Connect and list tools
                    return [4 /*yield*/, client.connect(transport)];
                case 3:
                    // Connect and list tools
                    _a.sent();
                    return [4 /*yield*/, client.listTools()];
                case 4:
                    tools = _a.sent();
                    console.log('Available tools:', tools.map(function (t) { return t.name; }).join(', '));
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _a.sent();
                    console.error('Error:', error_1);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
testGSuiteConnection();
