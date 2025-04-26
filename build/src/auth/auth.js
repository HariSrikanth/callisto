import { loadCredentials } from './client.js';
import { AuthServer } from './server.js';
import { OAuth2Client } from 'google-auth-library';
// Main function to run the authentication server
async function runAuthServer() {
    let authServer = null; // Keep reference for cleanup
    try {
        // Initialize OAuth client
        const { client_id, client_secret } = await loadCredentials();
        const oauth2Client = new OAuth2Client(client_id, client_secret, 'http://localhost:4100/code');
        // Create and start the auth server
        authServer = new AuthServer(oauth2Client);
        // Start with browser opening (true by default)
        const success = await authServer.start(true);
        if (!success && !authServer.authCompletedSuccessfully) {
            // Failed to start and tokens weren't already valid
            process.stderr.write('Authentication failed. Could not start server or validate existing tokens. Check port availability (3000-3004) and try again.\n');
            process.exit(1);
        }
        else if (authServer.authCompletedSuccessfully) {
            // Auth was successful (either existing tokens were valid or flow completed just now)
            process.stderr.write('Authentication successful.\n');
            process.exit(0); // Exit cleanly if auth is already done
        }
        // If we reach here, the server started and is waiting for the browser callback
        process.stderr.write('Authentication server started. Please complete the authentication in your browser...\n');
        // Poll for completion or handle SIGINT
        const pollInterval = setInterval(async () => {
            if (authServer?.authCompletedSuccessfully) {
                clearInterval(pollInterval);
                await authServer.stop();
                process.stderr.write('Authentication successful. Server stopped.\n');
                process.exit(0);
            }
        }, 1000); // Check every second
        // Handle process termination (SIGINT)
        process.on('SIGINT', async () => {
            clearInterval(pollInterval); // Stop polling
            if (authServer) {
                await authServer.stop();
            }
            process.exit(0);
        });
    }
    catch (error) {
        process.stderr.write(`Error during authentication: ${error instanceof Error ? error.message : error}\n`);
        if (authServer) {
            await authServer.stop();
        }
        process.exit(1);
    }
}
runAuthServer();
//# sourceMappingURL=auth.js.map