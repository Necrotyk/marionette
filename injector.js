/**
 * Marionette Companion Injector Script
 * * This script runs in the page's own JavaScript context. It has access to the
 * DOM and the `window` object, allowing it to interact with the Marionette UI.
 * Its purpose is to detect events within the UI (like theme changes or terminal resizes)
 * and forward them to the content script.
 */

console.log("Marionette Companion: Injector script running in page context.");

// --- SECURITY ENHANCEMENT: NONCE ---
/**
 * Retrieves the nonce passed from the content script via a data attribute.
 * This is necessary to authenticate messages sent back to the content script.
 * We use document.currentScript for modern browsers and a fallback for others.
 */
const currentScript = document.currentScript ||
    Array.from(document.getElementsByTagName('script'))
         .find(s => s.src && s.src.includes('injector.js'));
const MARIONETTE_NONCE = currentScript ? currentScript.getAttribute('data-marionette-nonce') : null;

// Expose the nonce to the global window scope so that the main application script (script.js) can use it.
if (MARIONETTE_NONCE) {
    window.__MARIONETTE_NONCE__ = MARIONETTE_NONCE;
} else {
    console.error("Marionette Companion: CRITICAL - Could not retrieve security nonce. Communication with the extension will fail.");
}


/**
 * Dispatches a custom DOM event on the window object. This is the primary
 * method for communicating from the page context back to the content script.
 * It automatically includes the security nonce.
 * @param {string} eventName - The name of the custom event.
 * @param {object} detail - The data payload for the event.
 */
function dispatchToContentScript(eventName, detail) {
    // Always include the nonce in the message detail for validation by the content script.
    const secureDetail = { ...detail, nonce: MARIONETTE_NONCE };
    window.dispatchEvent(new CustomEvent(eventName, { detail: secureDetail }));
}

// This listener acts as a bridge, catching all 'marionette-send-message' events
// dispatched by the main `script.js` and allowing them to be heard by the
// content script's own listener for the same event.
window.addEventListener('marionette-send-message', (event) => {
    // No action needed here; the event is simply passed through the DOM.
});


// --- Resize Observer for Remote Terminals ---
// This observer watches for style or class changes on elements that could
// indicate a window resize, specifically for remote terminal windows.
const resizeObserver = new MutationObserver(mutations => {
    for (let mutation of mutations) {
        if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
            const windowEl = mutation.target;
            
            // Check if the mutated element is a remote terminal window
            if (windowEl.classList.contains('app-window') && windowEl.id.startsWith('window-remote-terminal')) {
                const contentEl = windowEl.querySelector('.terminal-content');
                if (contentEl) {
                    // Approximate terminal dimensions based on element size and typical font metrics.
                    const rows = Math.floor(contentEl.clientHeight / 15); 
                    const cols = Math.floor(contentEl.clientWidth / 8);  
                    const windowId = windowEl.id.replace('window-', '');
                    
                    // Dispatch the resize event to the content script using the secure dispatcher
                    dispatchToContentScript('marionette-send-message', {
                        type: 'shell_resize',
                        window_id: windowId,
                        cols: cols,
                        rows: rows
                    });
                }
            }
        }
    }
});

// Wait for the main desktop element to be created before we start observing it.
const desktopObserver = new MutationObserver((mutations, obs) => {
    const desktopEl = document.getElementById('desktop');
    if (desktopEl) {
        // Start observing the desktop and all its descendants for attribute changes.
        resizeObserver.observe(desktopEl, {
            attributes: true,
            subtree: true,
            attributeFilter: ['style', 'class']
        });
        obs.disconnect(); // Stop this observer once the desktop is found.
    }
});

// Start observing the body to detect when the desktop element is added.
desktopObserver.observe(document.body, {
    childList: true,
    subtree: true
});
