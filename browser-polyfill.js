/*
 * Copyright 2017-2020 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

if (typeof browser === "undefined" || Object.getPrototypeOf(browser) !== Object.prototype) {
  const CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE =
    "The message port closed before a response was received.";
  const SEND_RESPONSE_DEPRECATION_WARNING =
    "Returning a Promise is the preferred way to send a reply from an onMessage/onMessageExternal listener, as the sendResponse callback is unsupported in many circumstances and may be deprecated in the future.";

  const wrapMethod = (dot, aname, anamespace, api) => {
    const anameParts = aname.split(".");
    const anameLastPart = anameParts.pop();

    for (const part of anameParts) {
      anamespace = anamespace[part];
    }

    const func = anamespace[anameLastPart];

    return (...args) => {
      api.runtime.lastError;

      return new Promise((resolve, reject) => {
        const callback = (result) => {
          const err = api.runtime.lastError;
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        };

        try {
          func(dot, ...args, callback);
        } catch (err) {
          reject(err);
        }
      });
    };
  };

  const wrapMethodAndApply = (dot, aname, anamespace, api) => {
    const anameParts = aname.split(".");
    const anameLastPart = anameParts.pop();

    for (const part of anameParts) {
      anamespace = anamespace[part];
    }

    const func = anamespace[anameLastPart];

    return (...args) => {
      api.runtime.lastError;

      return new Promise((resolve, reject) => {
        const callback = (result) => {
          const err = api.runtime.lastError;
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        };

        try {
          func.apply(dot, [...args, callback]);
        } catch (err) {
          reject(err);
        }
      });
    };
  };

  const wrapLongLivedPort = (port, api) => {
    const onMessage = {
      addListener(listener) {
        port.onMessage.addListener(listener);
      },
    };

    const onDisconnect = {
      addListener(listener) {
        port.onDisconnect.addListener(listener);
      },
    };

    return {
      name: port.name,
      disconnect() {
        port.disconnect();
      },
      postMessage(message) {
        port.postMessage(message);
      },
      onMessage,
      onDisconnect,
      sender: port.sender,
    };
  };

  const wrapSendMessage = (sendMessage, api) => {
    return (...args) => {
      return new Promise((resolve, reject) => {
        const callback = (result) => {
          const err = api.runtime.lastError;
          if (
            err &&
            err.message === CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE
          ) {
            resolve();
          } else if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        };

        try {
          sendMessage(...args, callback);
        } catch (err) {
          if (
            err.message === "Extension context invalidated." ||
            err.message === "Attempt to postMessage on disconnected port"
          ) {
            reject(err);
          } else {
            console.warn(
              "Warning: `browser.runtime.sendMessage` received an unexpected error:",
              err
            );
            resolve();
          }
        }
      });
    };
  };

  const wrapAPIs = (extensionAPIs) => {
    const api = {
      runtime: {
        connect(...args) {
          const port = extensionAPIs.runtime.connect(...args);
          return wrapLongLivedPort(port, extensionAPIs);
        },

        sendMessage: wrapSendMessage(
          extensionAPIs.runtime.sendMessage,
          extensionAPIs
        ),
      },

      tabs: {
        sendMessage: wrapSendMessage(
          extensionAPIs.tabs.sendMessage,
          extensionAPIs
        ),
      },
    };

    const staticWrappers = {
      "runtime.getBackgroundPage": extensionAPIs => {
        return wrapMethod(
          null,
          "getBackgroundPage",
          extensionAPIs.runtime,
          extensionAPIs
        );
      },
      "runtime.getBrowserInfo": extensionAPIs => {
        if (!("getBrowserInfo" in extensionAPIs.runtime)) {
          return;
        }
        return wrapMethod(
          null,
          "getBrowserInfo",
          extensionAPIs.runtime,
          extensionAPIs
        );
      },
      "runtime.getPlatformInfo": extensionAPIs => {
        return wrapMethod(
          null,
          "getPlatformInfo",
          extensionAPIs.runtime,
          extensionAPIs
        );
      },
      "runtime.openOptionsPage": extensionAPIs => {
        return wrapMethod(
          null,
          "openOptionsPage",
          extensionAPIs.runtime,
          extensionAPIs
        );
      },
      "runtime.requestUpdateCheck": extensionAPIs => {
        return wrapMethod(
          null,
          "requestUpdateCheck",
          extensionAPIs.runtime,
          extensionAPIs
        );
      },
      "runtime.setUninstallURL": extensionAPIs => {
        return wrapMethod(
          null,
          "setUninstallURL",
          extensionAPIs.runtime,
          extensionAPIs
        );
      },
      "storage.local.clear": extensionAPIs => {
        return wrapMethod(
          null,
          "clear",
          extensionAPIs.storage.local,
          extensionAPIs
        );
      },
      "storage.local.get": extensionAPIs => {
        return wrapMethod(
          null,
          "get",
          extensionAPIs.storage.local,
          extensionAPIs
        );
      },
      "storage.local.getBytesInUse": extensionAPIs => {
        return wrapMethod(
          null,
          "getBytesInUse",
          extensionAPIs.storage.local,
          extensionAPIs
        );
      },
      "storage.local.remove": extensionAPIs => {
        return wrapMethod(
          null,
          "remove",
          extensionAPIs.storage.local,
          extensionAPIs
        );
      },
      "storage.local.set": extensionAPIs => {
        return wrapMethod(
          null,
          "set",
          extensionAPIs.storage.local,
          extensionAPIs
        );
      },
      "storage.managed.get": extensionAPIs => {
        return wrapMethod(
          null,
          "get",
          extensionAPIs.storage.managed,
          extensionAPIs
        );
      },
      "storage.managed.getBytesInUse": extensionAPIs => {
        return wrapMethod(
          null,
          "getBytesInUse",
          extensionAPIs.storage.managed,
          extensionAPIs
        );
      },
      "storage.sync.clear": extensionAPIs => {
        return wrapMethod(
          null,
          "clear",
          extensionAPIs.storage.sync,
          extensionAPIs
        );
      },
      "storage.sync.get": extensionAPIs => {
        return wrapMethod(
          null,
          "get",
          extensionAPIs.storage.sync,
          extensionAPIs
        );
      },
      "storage.sync.getBytesInUse": extensionAPIs => {
        return wrapMethod(
          null,
          "getBytesInUse",
          extensionAPIs.storage.sync,
          extensionAPIs
        );
      },
      "storage.sync.remove": extensionAPIs => {
        return wrapMethod(
          null,
          "remove",
          extensionAPIs.storage.sync,
          extensionAPIs
        );
      },
      "storage.sync.set": extensionAPIs => {
        return wrapMethod(
          null,
          "set",
          extensionAPIs.storage.sync,
          extensionAPIs
        );
      },
      "tabs.create": extensionAPIs => {
        return wrapMethod(null, "create", extensionAPIs.tabs, extensionAPIs);
      },
      "tabs.get": extensionAPIs => {
        return wrapMethod(null, "get", extensionAPIs.tabs, extensionAPIs);
      },
      "tabs.getCurrent": extensionAPIs => {
        return wrapMethod(null, "getCurrent", extensionAPIs.tabs, extensionAPIs);
      },
      "tabs.query": extensionAPIs => {
        return wrapMethod(null, "query", extensionAPIs.tabs, extensionAPIs);
      },
      "tabs.remove": extensionAPIs => {
        return wrapMethod(null, "remove", extensionAPIs.tabs, extensionAPIs);
      },
      "tabs.update": extensionAPIs => {
        return wrapMethod(null, "update", extensionAPIs.tabs, extensionAPIs);
      },
    };

    const methodWrappers = {
      "runtime.onMessage.addListener": (extensionAPIs) => (listener) => {
        const listenerWrapper = (message, sender, sendResponse) => {
          const wrappedSender = {
            ...sender,
            tab: sender.tab ? { ...sender.tab } : undefined,
          };

          const result = listener(message, wrappedSender);

          if (typeof result !== "object" || !("then" in result)) {
            if (sendResponse !== undefined) {
              console.warn(SEND_RESPONSE_DEPRECATION_WARNING);
              sendResponse();
            }
            return false;
          }

          Promise.resolve(result).then(
            (res) => {
              if (sendResponse !== undefined) {
                sendResponse(res);
              }
            },
            (err) => {
              if (sendResponse !== undefined) {
                let errMessage = err;
                if (err && "message" in err) {
                  errMessage = err.message;
                }
                sendResponse({
                  __mozWebExtensionPolyfillReject__: true,
                  message: errMessage,
                });
              }
            }
          );

          return true;
        };
        extensionAPIs.runtime.onMessage.addListener(listenerWrapper);
      },
    };

    for (const aname of Object.keys(staticWrappers)) {
      const anameParts = aname.split(".");
      const anameLastPart = anameParts.pop();

      let apiNamespace = api;
      let extensionAPIsNamespace = extensionAPIs;
      for (const part of anameParts) {
        if (!(part in apiNamespace)) {
          apiNamespace[part] = {};
        }
        apiNamespace = apiNamespace[part];
        extensionAPIsNamespace = extensionAPIsNamespace[part];
      }

      if (anameLastPart in apiNamespace) {
        continue;
      }

      if (!(anameLastPart in extensionAPIsNamespace)) {
        continue;
      }

      const wrapper = staticWrappers[aname](extensionAPIs);
      if (wrapper) {
        apiNamespace[anameLastPart] = wrapper;
      }
    }

    for (const aname of Object.keys(methodWrappers)) {
      const anameParts = aname.split(".");
      const anameLastPart = anameParts.pop();

      let apiNamespace = api;
      let extensionAPIsNamespace = extensionAPIs;
      for (const part of anameParts) {
        if (!(part in apiNamespace)) {
          apiNamespace[part] = {};
        }
        apiNamespace = apiNamespace[part];
        extensionAPIsNamespace = extensionAPIsNamespace[part];
      }

      if (anameLastPart in apiNamespace) {
        continue;
      }

      if (!(anameLastPart in extensionAPIsNamespace)) {
        continue;
      }

      const wrapper = methodWrappers[aname](extensionAPIs);
      apiNamespace[anameLastPart] = wrapper;
    }

    return api;
  };

  if (
    typeof chrome !== "object" ||
    !chrome ||
    !chrome.runtime ||
    !chrome.runtime.id
  ) {
    throw new Error("This script should not be loaded in a browser that doesn't support Chrome extensions.");
  }

  this.browser = wrapAPIs(chrome);
}
