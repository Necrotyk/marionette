// Global WebSocket variable. Note: In MV3, this can be terminated.
// The logic is designed to handle reconnection when needed.
let socket = null;

// Use chrome.storage.session for non-persistent state if available, otherwise fall back to local.
const storageArea = chrome.storage.session || chrome.storage.local;

// --- SECURITY ENHANCEMENT ---
// An allowlist of message types that are permitted to be sent from the
// content script (and by extension, the web UI) to the WebSocket agent.
// This prevents compromised page scripts from sending arbitrary commands.
const ALLOWED_MESSAGE_TYPES = new Set([
    'shell_create',
    'shell_input',
    'shell_resize',
    'shell_close',
    'fs_ls'
]);

// Function to get the current connection state from storage
async function getConnectionState() {
    return new Promise(resolve => {
        storageArea.get(['connectionStatus', 'serverAddress', 'authToken'], resolve);
    });
}

// Function to update the stored status and notify other parts of the extension
async function updateStatus(status, address = '', token = '') {
    const state = { connectionStatus: status, serverAddress: address, authToken: token };
    await storageArea.set(state);
    
    // Notify the popup
    await chrome.runtime.sendMessage({ type: 'statusUpdate', status }).catch(e => {});
    
    // Notify all content scripts
    const tabs = await chrome.tabs.query({ /* all tabs */ });
    for (const tab of tabs) {
        try {
            // Use a more specific message type to avoid conflicts
            await chrome.tabs.sendMessage(tab.id, { type: status === 'connected' ? 'marionette-connected' : 'marionette-disconnected' });
        } catch (e) {
            // This can happen if the content script is not injected in a tab, which is fine.
        }
    }
    console.log(`Status updated to: ${status}`);
}

// Main function to handle WebSocket connection
function connectWebSocket(address, token) {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        console.log("WebSocket connection already open or connecting.");
        return;
    }

    console.log(`Attempting to connect to WebSocket at ${address}`);
    socket = new WebSocket(address);

    socket.onopen = () => {
        console.log("WebSocket opened. Sending authentication token.");
        // Use a structured object for auth, consistent with other messages
        socket.send(JSON.stringify({ type: "auth", token: token }));
    };

    socket.onmessage = (event) => {
        console.log("BACKGROUND RECV <-", event.data);
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'auth_success') {
                console.log("Authentication successful.");
                updateStatus('connected', address, token);
            } else if (message.type === 'auth_fail') {
                console.log("Authentication failed.");
                socket.close(1000, "Authentication Failed");
            } else {
                // Forward all other messages to all relevant tabs
                chrome.tabs.query({}).then(tabs => {
                    tabs.forEach(tab => {
                         chrome.tabs.sendMessage(tab.id, message).catch(() => {});
                    });
                });
            }
        } catch (e) {
            console.error("Error parsing message from server:", e);
        }
    };

    socket.onclose = (event) => {
        console.log(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
        socket = null;
        // Pass the reason for disconnection for better error reporting in the UI
        const reason = event.reason === "Authentication Failed" ? "auth_fail" : "generic";
        updateStatus('disconnected', '', '', reason);
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        // The onclose event will usually fire immediately after this.
        const errorMessage = { type: 'marionette-error', message: 'WebSocket connection failed.' };
         chrome.tabs.query({}).then(tabs => {
            tabs.forEach(tab => {
                 chrome.tabs.sendMessage(tab.id, errorMessage).catch(() => {});
            });
        });
    };
}

function disconnectWebSocket() {
    if (socket) {
        console.log("User initiated disconnect.");
        socket.close(1000, "User initiated disconnect");
    }
    // Ensure status is updated even if socket was already null
    updateStatus('disconnected');
}

// Listener for messages from the popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Internal extension messages for connection management
    if (message.type === 'connect') {
        connectWebSocket(message.address, message.token);
        return; // Do not process further
    } 
    if (message.type === 'disconnect') {
        disconnectWebSocket();
        return; // Do not process further
    } 
    if (message.type === 'get-connection-status') {
        getConnectionState().then(state => sendResponse(state));
        return true; // Indicates an async response
    }

    // --- SECURITY FIX: Validate messages before sending to WebSocket ---
    if (socket && socket.readyState === WebSocket.OPEN) {
        // Check if the message type is in our allowlist.
        if (typeof message.type === 'string' && ALLOWED_MESSAGE_TYPES.has(message.type)) {
            console.log("BACKGROUND SEND ->", message.type);
            socket.send(JSON.stringify(message));
        } else {
            // If the message type is not allowed, reject it.
            console.warn("Rejected untrusted/unknown message type from extension context:", message);
        }
    } else {
        console.warn("Message received but socket is not connected.", message);
    }
});

// Attempt to reconnect on service worker startup if we were previously connected
chrome.runtime.onStartup.addListener(async () => {
    console.log("Extension startup.");
    const state = await getConnectionState();
    if (state.connectionStatus === 'connected' && state.serverAddress && state.authToken) {
        console.log("Attempting to reconnect previous session...");
        connectWebSocket(state.serverAddress, state.authToken);
    } else {
        await updateStatus('disconnected');
    }
});
