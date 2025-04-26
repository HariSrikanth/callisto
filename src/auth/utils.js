"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecureTokenPath = getSecureTokenPath;
exports.getKeysFilePath = getKeysFilePath;
var path = require("path");
var url_1 = require("url");
// Helper to get the project root directory reliably
function getProjectRoot() {
    var __dirname = path.dirname((0, url_1.fileURLToPath)(import.meta.url));
    // In build output (e.g., build/bundle.js), __dirname is .../build
    // Go up TWO levels to get the project root
    var projectRoot = path.join(__dirname, "..", ".."); // Go up TWO levels
    return path.resolve(projectRoot); // Ensure absolute path
}
// Returns the absolute path for the saved token file.
function getSecureTokenPath() {
    var projectRoot = getProjectRoot();
    var tokenPath = path.join(projectRoot, ".gcp-saved-tokens.json");
    return tokenPath; // Already absolute from getProjectRoot
}
// Returns the absolute path for the GCP OAuth keys file.
function getKeysFilePath() {
    var projectRoot = getProjectRoot();
    var keysPath = path.join(projectRoot, ".gcp-oauth.keys.json");
    return keysPath; // Already absolute from getProjectRoot
}
