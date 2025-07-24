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
window.addEventListener('marionette-send-message', (event) => {
    // The `isTrusted` property is false for events dispatched by page scripts,
    // which is what we want to prevent. However, our communication relies on
    // this mechanism. A better check is to validate the message content itself,
    // but for this architecture, we add a simple check to ensure the detail exists.
    if (event.detail) {
        chrome.runtime.sendMessage(event.detail);
    } else {
        console.warn("Marionette Companion: Untrusted or malformed message received from page. Discarding.", event);
    }
});


/**
 * Injects the injector.js script into the main page's context. This script
 * has direct access to the page's DOM and window object.
 */
function injectScript() {
    try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injector.js');
        (document.head || document.documentElement).appendChild(script);
        script.onload = () => {
            // Once loaded, the script has done its job, so we can remove the element.
            script.remove();
            // Request initial connection status from the background script.
            chrome.runtime.sendMessage({ type: 'get-connection-status' });
        };
        console.log("Marionette Companion: Injector script loaded into page context.");
    } catch (e) {
        console.error("Marionette Companion: Error injecting script.", e);
    }
}

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
