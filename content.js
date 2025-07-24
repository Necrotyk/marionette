/**
 * Marionette Companion Content Script
 * * This script acts as a bridge between the web page (script.js) and the extension's
 * service worker (background.js). It is responsible for injecting the injector script
 * and relaying messages between the two contexts.
 */

console.log("Marionette Companion: Content script loaded.");

/**
 * Dispatches a custom DOM event to the window object, forwarding a message
 * from the background script to the page script (script.js).
 * @param {object} message - The message object from the background script.
 */
function dispatchDataToPage(message) {
    // The payload is serialized to a JSON string to ensure it can be safely
    // accessed by the less privileged page context.
    const payload = JSON.stringify(message);
    window.dispatchEvent(new CustomEvent('marionette-message', { detail: payload }));
}

/**
 * Listens for messages from the background script (service worker) and
 * forwards them to the web page.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // We only care about messages that are not responses to our own requests.
    if (message.type) {
        dispatchDataToPage(message);
    }
});

/**
 * SECURITY FIX: Listens for events from the web page (relayed via injector.js)
 * and sends them to the background script, but only if they are trusted.
 */
// Injects the injector.js script into the main page's context with the nonce
function injectScript() {
    try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injector.js');
        script.setAttribute('data-marionette-nonce', MARIONETTE_NONCE);
        (document.head || document.documentElement).appendChild(script);
        script.onload = () => {
            script.remove();
            chrome.runtime.sendMessage({ type: 'get-connection-status' });
        };
        console.log("Marionette Companion: Injector script loaded into page context.");
    } catch (e) {
        console.error("Marionette Companion: Error injecting script.", e);
    }
}


// Injects the injector.js script into the main page's context with the nonce
function injectScript() {
    try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injector.js');
        script.setAttribute('data-marionette-nonce', MARIONETTE_NONCE);
        (document.head || document.documentElement).appendChild(script);
        script.onload = () => {
            script.remove();
            chrome.runtime.sendMessage({ type: 'get-connection-status' });
        };
        console.log("Marionette Companion: Injector script loaded into page context.");
    } catch (e) {
        console.error("Marionette Companion: Error injecting script.", e);
    }
}

// Generate a random nonce for secure communication
function generateNonce() {
    // 128-bit random nonce as a hex string
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}
const MARIONETTE_NONCE = generateNonce();

// Use a MutationObserver to wait until the web app's main object is available
// before injecting our script. This ensures the UI is ready.
const observer = new MutationObserver((mutations, obs) => {
    // Check for a specific element that indicates the UI is ready
    if (document.getElementById('desktop')) {
        console.log("Marionette Companion: Desktop UI detected. Injecting script.");
        injectScript();
        // Stop observing once we've injected the script.
        obs.disconnect();
    }
});

// Start observing the document for changes.
observer.observe(document, {
    childList: true,
    subtree: true
});
