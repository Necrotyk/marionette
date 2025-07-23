# Marionette

**A browser-based control plane for remote server management.**

Marionette is a powerful and intuitive tool for remote administration and automation directly from a browser. It uses a lightweight Python agent on the target machine, a secure browser extension as a bridge, and a feature-rich web UI as the control interface.

## Features

* **Remote Terminal:** Get a fully functional PTY shell session in your browser, running on the remote machine.
* **Remote File Browser:** Navigate the agent's filesystem, with support for future file operations.
* **Secure API Key Authentication:** Secure the connection between the extension and the agent using persistent, user-generated API keys.
* **Connection Profile Manager:** Save and quickly switch between multiple server configurations directly in the extension popup.
* **Portable & Configurable:** Designed to be easily deployed in any environment with minimal configuration.

## Architecture

The project consists of three main components:

1.  **The Agent (`agent.py`):** A Python script that runs on the remote/target server. It creates a secure WebSocket server, manages terminal sessions, and handles filesystem operations.
2.  **The Web UI (`index.html`, `script.js`, `style.css`):** A single-page application that provides the desktop-like user interface. It runs in your browser and communicates with the extension.
3.  **The Browser Extension:** The secure bridge that connects the Web UI to the Agent. It manages connection profiles and relays WebSocket messages, ensuring communication is sandboxed and secure.

---

## Setup Instructions

Follow these steps to get Marionette up and running on your system.

### Prerequisites

* **Python 3.6+** and `pip` on the server where the agent will run.
* A modern Chromium-based web browser (like Google Chrome, Brave, or Edge) on your local machine.
* `git` for cloning the repository.

### 1. Agent Setup (On Your Remote Server)

First, set up the Python agent on the machine you want to control.

**A. Clone the Repository:**

    git clone https://github.com/Necrotyk/marionette
    cd marionette

B. Install Dependencies:
The agent requires the websockets library.

    pip install websockets

C. Generate Your First API Key:
The agent uses a persistent API key for authentication. Run the following command in the project directory to create your first key:

    python3 agent.py --generate-key

This will create an api_keys.json file in the same directory and print your new key. Copy this key and save it somewhere secure. This is the "password" you'll use in the browser extension.

D. Run the Agent:
Start the agent script. You can specify which directory the agent should be "jailed" to for security.

    # Run the agent, jailed to the user's home directory (default)
    python3 agent.py

    # Or, run the agent jailed to a specific project folder
    python3 agent.py --directory /path/to/your/project

The agent is now running and waiting for a connection.

2. Web UI Setup (On Your Local Machine)

The Web UI files (index.html, style.css, script.js) need to be served by a web server.

A. Start a Simple Web Server:
Navigate to the project directory on your local machine and run the following command:

    python3 -m http.server

This will start a web server. You can now access the Marionette UI by navigating to http://localhost:8000 in your browser.

3. Browser Extension Setup (On Your Local Machine)

A. Build the Extension:
Run the build script to prepare the extension files:

     ./build.sh

This will create a dist/chrome directory containing the packaged extension.

B. Load the Extension in Chrome:

  Open Chrome and navigate to chrome://extensions.

  Enable "Developer mode" using the toggle in the top-right corner.

  Click the "Load unpacked" button.

  Select the dist/chrome directory from your project folder.

The Marionette Companion extension icon should now appear in your browser's toolbar.

Usage

  Create a Connection Profile:

  Click the Marionette extension icon in your browser toolbar.

  Click "Add New".

  Give your profile a name (e.g., "My Home Server").

  For the "Server Address", enter the IP address or domain of your agent (e.g., localhost or 192.168.1.10). The wss:// and default port :9001 will be added automatically.

  Paste the API key you generated earlier into the "API Key" field.

  Click "Save".

  Connect to the Agent:

  With your new profile selected, click the "Connect" button.

  The status should change to "Connected".

  Launch Remote Apps:

  Go to the Web UI tab (e.g., http://localhost:8000).

  Click on "Applications" in the top panel. You should now see "Remote Terminal" and "Remote Files" available. Click on them to launch the windows and start managing your remote server.
