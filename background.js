// Global WebSocket variable. Note: In MV3, this can be terminated.
// The logic is designed to handle reconnection when needed.
let socket = null;

// Use chrome.storage.session for non-persistent state if available, otherwise fall back to local.
const storageArea = chrome.storage.session || chrome.storage.local;

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
    await chrome.runtime.sendMessage({ type: 'statusUpdate', status }).catch(e => console.log("Popup not open."));
    
    // Notify all content scripts
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        try {
            await chrome.tabs.sendMessage(tab.id, { type: status === 'connected' ? 'dystopi-connected' : 'dystopi-disconnected' });
        } catch (e) {
            // This can happen if the content script is not injected in a tab, which is fine.
            // console.log(`Could not send message to tab ${tab.id}: ${e.message}`);
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
                // Forward all other messages to the appropriate tab
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
        updateStatus('disconnected');
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        // The onclose event will usually fire immediately after this.
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
    if (message.type === 'connect') {
        connectWebSocket(message.address, message.token);
    } else if (message.type === 'disconnect') {
        disconnectWebSocket();
    } else if (message.type === 'get-connection-status') {
        getConnectionState().then(state => sendResponse(state));
        return true; // Indicates an async response
    } else if (socket && socket.readyState === WebSocket.OPEN) {
        // Forward messages from content script to the agent
        console.log("BACKGROUND SEND ->", message);
        socket.send(JSON.stringify(message));
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
