// Global WebSocket variable. Note: In MV3, this can be terminated.
// The logic is designed to handle reconnection when needed.
let socket = null;

// --- FIX: Track the active tab ---
// This will hold the ID of the tab running the Marionette UI.
let activeMarionetteTabId = null;

// Use chrome.storage.session for non-persistent state if available, otherwise fall back to local.
const storageArea = chrome.storage.session || chrome.storage.local;

// --- SECURITY ENHANCEMENT ---
// An allowlist of message types that are permitted to be sent from the
// content script (and by extension, the web UI) to the WebSocket agent.
const ALLOWED_MESSAGE_TYPES = new Set([
    'shell_create',
    'shell_input',
    'shell_resize',
    'shell_close',
    'fs_ls',
    // --- FIX: Add a message type for the UI to identify itself ---
    'marionette_ui_ready' 
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
    
    // --- FIX: Only notify the active Marionette tab ---
    if (activeMarionetteTabId) {
        const messageType = status === 'connected' ? 'marionette-connected' : 'marionette-disconnected';
        chrome.tabs.sendMessage(activeMarionetteTabId, { type: messageType }).catch(e => {
            // If sending fails, the tab might have closed.
            console.log("Could not send status to tab, it may have closed.", e);
            activeMarionetteTabId = null;
        });
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
                // --- FIX: Forward all other messages ONLY to the active tab ---
                if (activeMarionetteTabId) {
                    chrome.tabs.sendMessage(activeMarionetteTabId, message).catch((e) => {
                        console.error("Failed to send message to Marionette tab:", e);
                        activeMarionetteTabId = null; // Assume tab is closed
                    });
                }
            }
        } catch (e) {
            console.error("Error parsing message from server:", e);
        }
    };

    socket.onclose = (event) => {
        console.log(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
        socket = null;
        const reason = event.reason === "Authentication Failed" ? "auth_fail" : "generic";
        updateStatus('disconnected', '', '', reason);
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        const errorMessage = { type: 'marionette-error', message: 'WebSocket connection failed.' };
         if (activeMarionetteTabId) {
            chrome.tabs.sendMessage(activeMarionetteTabId, errorMessage).catch(() => {});
        }
    };
}

function disconnectWebSocket() {
    if (socket) {
        console.log("User initiated disconnect.");
        socket.close(1000, "User initiated disconnect");
    }
    updateStatus('disconnected');
}

// Listener for messages from the popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // --- FIX: Handle UI identification message ---
    if (message.type === 'marionette_ui_ready') {
        if (sender.tab) {
            activeMarionetteTabId = sender.tab.id;
            console.log(`Marionette UI is active in tab ID: ${activeMarionetteTabId}`);
            // When a new UI connects, send it the current status.
            getConnectionState().then(state => {
                 const messageType = state.connectionStatus === 'connected' ? 'marionette-connected' : 'marionette-disconnected';
                 chrome.tabs.sendMessage(activeMarionetteTabId, { type: messageType }).catch(()=>{});
            });
        }
        return;
    }

    if (message.type === 'connect') {
        connectWebSocket(message.address, message.token);
        return;
    } 
    if (message.type === 'disconnect') {
        disconnectWebSocket();
        return;

    } 
    if (message.type === 'get-connection-status') {
        getConnectionState().then(state => sendResponse(state));
        return true; // Indicates an async response
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        if (typeof message.type === 'string' && ALLOWED_MESSAGE_TYPES.has(message.type)) {
            console.log("BACKGROUND SEND ->", message.type);
            socket.send(JSON.stringify(message));
        } else {
            console.warn("Rejected untrusted/unknown message type from extension context:", message);
        }
    } else {
        console.warn("Message received but socket is not connected.", message);
    }
});

// --- FIX: Add a listener for when a tab is closed ---
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabId === activeMarionetteTabId) {
        console.log(`Marionette tab ${tabId} has been closed.`);
        activeMarionetteTabId = null;
        // Optional: you might want to disconnect the WebSocket session here
        // disconnectWebSocket(); 
    }
});


// Attempt to reconnect on service worker startup if we were previously connected
chrome.runtime.onStartup.addListener(async () => {
    console.log("Extension startup.");
    // Don't auto-reconnect on startup, as we don't know which tab is the right one.
    // The UI will send 'marionette_ui_ready' when it loads.
    await updateStatus('disconnected');
});
