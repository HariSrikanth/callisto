import path from 'path';
export function getProjectRoot() {
    return process.cwd();
}
export function getSetupConfigPath() {
    return path.join(getProjectRoot(), 'setup-config.json');
}
//# sourceMappingURL=utils.js.map