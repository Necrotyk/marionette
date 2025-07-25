// --- Global State ---
let desktopSettings = {
    backgroundMode: 'matrix', // matrix, constellation, synthwave
    matrixColor: '#00AEEF',
    rainMode: 'default',
    rainDirection: 'down',
    username: 'user',
    webApps: []
};

let fileSystem = {};

// --- Security Utility ---
function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Securely dispatches a message to the content script.
 * It waits for the nonce to be available on the window object (set by injector.js),
 * then includes it with the message payload for validation.
 * @param {object} detail - The message payload.
 */
function dispatchToCompanion(detail) {
    if (window.__MARIONETTE_NONCE__) {
        const secureDetail = { ...detail, nonce: window.__MARIONETTE_NONCE__ };
        window.dispatchEvent(new CustomEvent('marionette-send-message', { detail: secureDetail }));
    } else {
        // This might happen if the message is sent before injector.js has loaded.
        console.error("Marionette Companion: Nonce not available. Cannot send message.", detail);
    }
}


// --- Animated Background (No changes) ---
const c = document.getElementById("background-canvas");
const ctx = c.getContext("2d");
let animationFrameId;
let rainbowHue = 0;
const glitchColors = ['#ff00ff', '#00ffff', '#ffff00', '#ff0000', '#00ff00', '#0000ff'];
let rainDrops = [];
let scannerPosition = 0;
let scanStartTime = 0;
let lastFrameTime = 0;
const frameInterval = 50;
let stars = [];
const numStars = 100;
const starSpeed = 0.5;
const linkDistance = 150;
let time = 0;

function resizeCanvas() {
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    if (desktopSettings.backgroundMode === 'matrix') setupRain();
    if (desktopSettings.backgroundMode === 'constellation') setupConstellation();
}

function setupRain() {
    const isHorizontal = desktopSettings.rainDirection === 'left' || desktopSettings.rainDirection === 'right';
    const count = isHorizontal ? Math.floor(c.height / 12) : Math.floor(c.width / 12);
    rainDrops = [];
    for (let i = 0; i < count; i++) {
        if (isHorizontal) {
            rainDrops[i] = { x: desktopSettings.rainDirection === 'left' ? -Math.random() * c.width : c.width + Math.random() * c.width, y: i * 12, color: desktopSettings.matrixColor };
        } else {
            rainDrops[i] = { x: i * 12, y: Math.random() * -c.height, color: desktopSettings.matrixColor };
        }
    }
}

function setupConstellation() {
    stars = [];
    for (let i = 0; i < numStars; i++) {
        stars.push({
            x: Math.random() * c.width,
            y: Math.random() * c.height,
            vx: (Math.random() - 0.5) * starSpeed,
            vy: (Math.random() - 0.5) * starSpeed,
        });
    }
}

function drawBackground() {
    animationFrameId = requestAnimationFrame(drawBackground);
    switch (desktopSettings.backgroundMode) {
        case 'matrix':
            matrixRain();
            break;
        case 'constellation':
            drawConstellation();
            break;
        case 'synthwave':
            drawSynthwave();
            break;
        default:
            ctx.clearRect(0, 0, c.width, c.height);
    }
}

function matrixRain() {
    const currentTime = performance.now();
    if (currentTime - lastFrameTime < frameInterval) return;
    lastFrameTime = currentTime;

    ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = "12px monospace";
    rainbowHue = (rainbowHue + 0.5) % 360;

    if (desktopSettings.rainMode === 'scanning') {
        scannerPosition = (scannerPosition + 6) % (c.width + 50);
        for (let i = 0; i < c.height; i += 12) {
            ctx.fillStyle = desktopSettings.matrixColor;
            const text = String.fromCharCode(0x30A0 + Math.random() * 96);
            ctx.fillText(text, scannerPosition, i);
        }
        return;
    }

    for (let i = 0; i < rainDrops.length; i++) {
        let drop = rainDrops[i];
        let color = drop.color;

        switch (desktopSettings.rainMode) {
            case 'rave':
                color = `hsl(${rainbowHue}, 100%, 50%)`;
                break;
            case 'glitch':
                if (Math.random() < 0.005) drop.color = glitchColors[Math.floor(Math.random() * glitchColors.length)];
                color = drop.color;
                break;
            case 'rainbow':
                color = glitchColors[Math.floor(Math.random() * glitchColors.length)];
                break;
            default:
                color = desktopSettings.matrixColor;
                drop.color = color;
        }
        ctx.fillStyle = color;

        const text = String.fromCharCode(0x30A0 + Math.random() * 96);
        ctx.fillText(text, drop.x, drop.y);

        switch (desktopSettings.rainDirection) {
            case 'up':
                drop.y -= 12;
                if (drop.y < 0) drop.y = c.height + Math.random() * c.height;
                break;
            case 'left':
                drop.x += 12;
                if (drop.x > c.width) drop.x = 0 - Math.random() * c.width;
                break;
            case 'right':
                drop.x -= 12;
                if (drop.x < 0) drop.x = c.width + Math.random() * c.width;
                break;
            default:
                drop.y += 12;
                if (drop.y > c.height) drop.y = 0 - Math.random() * c.height;
        }
    }
}

function drawConstellation() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, c.width, c.height);

    stars.forEach(star => {
        star.x += star.vx;
        star.y += star.vy;
        if (star.x < 0 || star.x > c.width) star.vx *= -1;
        if (star.y < 0 || star.y > c.height) star.vy *= -1;
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(star.x, star.y, 2, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    for (let i = 0; i < numStars; i++) {
        for (let j = i + 1; j < numStars; j++) {
            const dist = Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y);
            if (dist < linkDistance) {
                ctx.beginPath();
                ctx.moveTo(stars[i].x, stars[i].y);
                ctx.lineTo(stars[j].x, stars[j].y);
                ctx.stroke();
            }
        }
    }
}

function drawSynthwave() {
    time += 0.01;
    const h = c.height;
    const w = c.width;
    const midY = h / 2;
    const gridCount = 20;
    ctx.fillStyle = '#0D0221';
    ctx.fillRect(0, 0, w, h);
    const sunY = midY - 50;
    const sunRadius = 100;
    const sunGradient = ctx.createRadialGradient(w / 2, sunY, sunRadius * 0.5, w / 2, sunY, sunRadius);
    sunGradient.addColorStop(0, '#FFD300');
    sunGradient.addColorStop(1, 'rgba(255, 211, 0, 0)');
    ctx.fillStyle = sunGradient;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#F92A82';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < gridCount; i++) {
        const p = (i / gridCount) + (time % (1 / gridCount));
        const y = midY + (p * p * h);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    for (let i = -gridCount; i <= gridCount; i++) {
        const p = i / gridCount;
        const x1 = w / 2 + p * w;
        const y1 = midY;
        const x2 = w / 2 + p * w * 5;
        const y2 = h;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
}

// --- Clock ---
function updateClock() {
    document.getElementById('clock').textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

// --- Window Management (No changes from previous version) ---
const WindowManager = {
    windows: new Map(),
    highestZ: 100,
    activeWorkspace: 1,
    getUserHomePath: function() {
        return `/home/${desktopSettings.username}`;
    },
    getUserDesktopPath: function() {
        return `/home/${desktopSettings.username}/Desktop`;
    },
    createWindow: function(appId, title, data = {}) {
        const isRemote = appId.startsWith('remote-');
        const windowId = isRemote ? `${appId}-${Date.now()}` : (data.filePath || (appId === 'terminal' && data.script ? 'hacker-terminal' : appId));

        if (!isRemote) {
            const existingWindow = Array.from(this.windows.entries()).find(([id, win]) => (data.filePath && win.path === data.filePath) || (!data.filePath && id === appId));
            if (existingWindow) {
                this.focusWindow(existingWindow[0]);
                return;
            }
        }

        if (this.windows.has(windowId)) {
            this.focusWindow(windowId);
            return;
        }

        const windowEl = document.createElement('div');
        windowEl.id = `window-${windowId}`;
        windowEl.className = 'app-window';
        windowEl.classList.add(`app-${appId}`);

        let width = '600px', height = '400px';
        if (appId === 'settings') { width = '450px'; height = '400px'; }
        if (appId === 'hashing-calculator') { width = '500px'; height = '350px'; }
        if (appId === 'steganography-tool' || appId === 'cryptool' || appId === 'regex-tester' || appId === 'add-webapp-dialog') {
            width = '500px'; height = '450px';
        }
        windowEl.style.width = width;
        windowEl.style.height = height;
        windowEl.style.top = `${Math.random() * 50 + 20}px`;
        windowEl.style.left = `${Math.random() * 100 + 50}px`;

        const titleBar = document.createElement('div');
        titleBar.className = 'window-title-bar';
        titleBar.innerHTML = `<span>${title}</span><div class="title-bar-controls"><button class="minimize-btn" title="Minimize"><i class="fa-solid fa-window-minimize"></i></button><button class="maximize-btn" title="Maximize"><i class="fa-regular fa-square"></i></button><button class="close-btn" title="Close">&times;</button></div>`;

        const content = document.createElement('div');
        content.className = 'window-content';

        const winData = {
            element: windowEl,
            isMinimized: false,
            oldSize: null,
            workspace: this.activeWorkspace,
            path: data.filePath,
            script: data.script
        };

        switch (appId) {
            case 'terminal':
                content.classList.add('terminal-content');
                this.setupTerminal(content, winData);
                break;
            case 'editor':
                this.setupEditor(content, winData);
                break;
            case 'file-browser':
                content.classList.add('file-browser-content');
                winData.currentPath = data.path || this.getUserDesktopPath();
                this.setupFileBrowser(content, winData);
                break;
            case 'remote-terminal':
                content.classList.add('terminal-content');
                this.setupRemoteTerminal(content, windowId);
                break;
            case 'remote-file-browser':
                content.classList.add('file-browser-content');
                winData.currentPath = data.path || '/';
                this.setupRemoteFileBrowser(content, winData, windowId);
                break;
            case 'settings': content.classList.add('settings-content'); this.setupSettings(content); break;
            case 'hashing-calculator': content.classList.add('hashing-content'); this.setupHashingCalculator(content); break;
            case 'steganography-tool': content.classList.add('steganography-content'); this.setupSteganographyTool(content); break;
            case 'cryptool': content.classList.add('cryptool-content'); this.setupCryptool(content); break;
            case 'regex-tester': content.classList.add('regex-content'); this.setupRegexTester(content); break;
            case 'add-webapp-dialog': this.setupAddWebAppDialog(content); break;
        }

        windowEl.appendChild(titleBar);
        windowEl.appendChild(content);
        document.getElementById('desktop').appendChild(windowEl);

        this.makeWindowDraggable(windowEl, titleBar);
        this.windows.set(windowId, winData);
        this.focusWindow(windowId);
        this.createTaskbarItem(windowId, title);

        titleBar.querySelector('.close-btn').addEventListener('click', (e) => { e.stopPropagation(); this.closeWindow(windowId); });
        titleBar.querySelector('.minimize-btn').addEventListener('click', (e) => { e.stopPropagation(); this.minimizeWindow(windowId); });
        titleBar.querySelector('.maximize-btn').addEventListener('click', (e) => { e.stopPropagation(); this.maximizeWindow(windowId); });
        windowEl.addEventListener('mousedown', () => this.focusWindow(windowId));
    },
    
    closeWindow(appId) {
        const win = this.windows.get(appId);
        if (win) {
            if (appId.startsWith('remote-terminal')) {
                dispatchToCompanion({ type: 'shell_close', window_id: appId });
            }
            win.element.remove();
            this.windows.delete(appId);
            document.getElementById(`task-item-${appId}`)?.remove();
        }
    },
    focusWindow(appId) {
        const winData = this.windows.get(appId);
        if (winData) {
            if (winData.workspace !== this.activeWorkspace) this.switchWorkspace(winData.workspace);
            if (winData.isMinimized) this.minimizeWindow(appId);
            this.highestZ++;
            winData.element.style.zIndex = this.highestZ;
        }
        document.querySelectorAll('.task-item').forEach(item => item.classList.remove('active'));
        document.getElementById(`task-item-${appId}`)?.classList.add('active');
    },
    minimizeWindow(appId) {
        const winData = this.windows.get(appId);
        if (!winData) return;
        winData.isMinimized = !winData.isMinimized;
        if (winData.workspace === this.activeWorkspace) winData.element.style.display = winData.isMinimized ? 'none' : 'flex';
        document.getElementById(`task-item-${appId}`)?.classList.toggle('minimized', winData.isMinimized);
        if (!winData.isMinimized) this.focusWindow(appId);
    },
    maximizeWindow(appId) {
        const winData = this.windows.get(appId);
        if (!winData) return;
        const desktop = document.getElementById('desktop'),
            winEl = winData.element;
        if (winData.oldSize) {
            winEl.style.top = winData.oldSize.top;
            winEl.style.left = winData.oldSize.left;
            winEl.style.width = winData.oldSize.width;
            winEl.style.height = winData.oldSize.height;
            winData.oldSize = null;
            winEl.querySelector('.maximize-btn i').className = 'fa-regular fa-square';
        } else {
            winData.oldSize = {
                top: winEl.style.top,
                left: winEl.style.left,
                width: winEl.style.width,
                height: winEl.style.height
            };
            winEl.style.top = '0px';
            winEl.style.left = '0px';
            winEl.style.width = desktop.clientWidth + 'px';
            winEl.style.height = desktop.clientHeight + 'px';
            winEl.querySelector('.maximize-btn i').className = 'fa-regular fa-clone';
        }
    },
    switchWorkspace(workspaceNum) {
        this.activeWorkspace = workspaceNum;
        document.querySelectorAll('#workspace-switcher .workspace-button').forEach(btn => btn.classList.toggle('active', btn.dataset.workspace == workspaceNum));

        this.windows.forEach((win, appId) => {
            const taskItem = document.getElementById(`task-item-${appId}`);
            const onThisWorkspace = win.workspace === this.activeWorkspace;
            win.element.style.display = onThisWorkspace && !win.isMinimized ? 'flex' : 'none';
            if (taskItem) taskItem.style.display = onThisWorkspace ? 'block' : 'none';
        });
    },
    makeWindowDraggable(element, handle) {
        let isDragging = false,
            offsetX, offsetY;
        const snapThreshold = 20;

        handle.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'I') return;
            const winData = Array.from(this.windows.entries()).find(([id, data]) => data.element === element) ?.[1];
            if (winData && winData.oldSize) return;
            isDragging = true;
            offsetX = e.clientX - element.offsetLeft;
            offsetY = e.clientY - element.offsetTop;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                let newX = e.clientX - offsetX;
                let newY = e.clientY - offsetY;
                const desktop = document.getElementById('desktop');

                if (e.clientX < snapThreshold) { // Snap left
                    element.style.left = '0px';
                    element.style.top = '0px';
                    element.style.width = (desktop.clientWidth / 2) + 'px';
                    element.style.height = desktop.clientHeight + 'px';
                } else if (e.clientX > window.innerWidth - snapThreshold) { // Snap right
                    element.style.left = (desktop.clientWidth / 2) + 'px';
                    element.style.top = '0px';
                    element.style.width = (desktop.clientWidth / 2) + 'px';
                    element.style.height = desktop.clientHeight + 'px';
                } else {
                    element.style.left = `${newX}px`;
                    element.style.top = `${newY}px`;
                }
            }
        });
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    },
    createTaskbarItem(appId, title) {
        const taskItem = document.createElement('div');
        taskItem.id = `task-item-${appId}`;
        taskItem.className = 'task-item';
        taskItem.textContent = title;
        taskItem.addEventListener('click', () => this.focusWindow(appId));
        document.getElementById('taskbar-items').appendChild(taskItem);
    },

    // --- Remote Apps ---
    setupRemoteTerminal(contentEl, windowId) {
        const outputEl = document.createElement('div');
        outputEl.className = 'terminal-output';
        
        const inputLine = document.createElement('div');
        inputLine.className = 'terminal-input-line';

        const promptEl = document.createElement('span');
        promptEl.className = 'terminal-prompt';

        const inputEl = document.createElement('input');
        inputEl.className = 'terminal-input';
        inputEl.type = 'text';

        inputLine.appendChild(promptEl);
        inputLine.appendChild(inputEl);
        
        contentEl.appendChild(outputEl);
        contentEl.appendChild(inputLine);

        const winData = this.windows.get(windowId);
        if (winData) {
            winData.promptEl = promptEl;
        }

        setTimeout(() => inputEl.focus(), 0);
        contentEl.addEventListener('click', () => inputEl.focus());

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const command = inputEl.value;
                inputEl.value = '';
                const html = promptEl.innerHTML + sanitizeHTML(command) + '<br>';
                outputEl.insertAdjacentHTML('beforeend', html);

                dispatchToCompanion({ type: 'shell_input', window_id: windowId, data: command + '\n' });
                promptEl.innerHTML = '';
                contentEl.scrollTop = contentEl.scrollHeight;
            }
        });
        
        dispatchToCompanion({ type: 'shell_create', window_id: windowId });
    },

    setupRemoteFileBrowser(contentEl, winData, windowId) {
        const path = winData.currentPath;
        contentEl.innerHTML = `<div class="file-browser-nav"><button id="fs-back-btn"><i class="fa-solid fa-arrow-left"></i></button><span>${path}</span></div><div class="file-browser-grid"><p>Loading...</p></div>`;

        dispatchToCompanion({ type: 'fs_ls', path: path, window_id: windowId });

        contentEl.querySelector('#fs-back-btn').onclick = () => {
            const newPath = path.substring(0, path.lastIndexOf('/'));
            winData.currentPath = newPath || '/';
            this.setupRemoteFileBrowser(contentEl, winData, windowId);
        };
    },

    // --- Simulated Apps ---
    setupTerminal(contentEl, winData) {
        const outputEl = document.createElement('div');
        outputEl.className = 'terminal-output';
        contentEl.appendChild(outputEl);

        let history = [];
        let historyIndex = -1;
        const prompt = `[${desktopSettings.username}@marionette]~$&nbsp;`;
        outputEl.innerHTML = `Welcome to Marionette Terminal<br>Enter 'help' for a list of commands.<br><br>`;
        const inputLine = document.createElement('div');
        inputLine.className = 'terminal-input-line';
        inputLine.innerHTML = `<span class="terminal-prompt">${prompt}</span>`;
        const inputEl = document.createElement('input');
        inputEl.className = 'terminal-input';
        inputEl.type = 'text';
        inputLine.appendChild(inputEl);
        contentEl.appendChild(inputLine);
        setTimeout(() => inputEl.focus(), 0);
        contentEl.addEventListener('click', () => inputEl.focus());
        inputEl.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const command = inputEl.value.trim();
                outputEl.innerHTML += `${prompt}${sanitizeHTML(command)}<br>`;
                if (command) {
                    history.push(command);
                    historyIndex = history.length;
                    await this.executeCommand(command, outputEl, inputEl);
                }
                inputEl.value = '';
                contentEl.scrollTop = contentEl.scrollHeight;
            } else if (e.key === 'ArrowUp' && history.length > 0) {
                historyIndex = Math.max(0, historyIndex - 1);
                inputEl.value = history[historyIndex];
            } else if (e.key === 'ArrowDown') {
                historyIndex++;
                inputEl.value = history[historyIndex] || '';
            }
        });
    },
    setupFileBrowser(contentEl, winData) {
        if (!winData) winData = this.windows.get('file-browser');
        let pathParts = winData.currentPath.split('/').filter(Boolean);

        let currentDir = fileSystem;
        try {
            pathParts.forEach(part => {
                currentDir = currentDir[part].children;
            });
        } catch (e) {
            winData.currentPath = this.getUserDesktopPath();
            currentDir = fileSystem.home.children[desktopSettings.username].children.Desktop.children;
        }

        if (winData.currentPath === this.getUserDesktopPath()) {
            document.querySelectorAll('#desktop .desktop-icon').forEach(icon => {
                const name = icon.dataset.name;
                if (!currentDir[name]) {
                    const type = icon.dataset.filetype;
                    const url = icon.dataset.url;
                    currentDir[name] = {
                        type,
                        content: '',
                        children: type === 'folder' ? {} : undefined,
                        url: url
                    };
                }
            });
        }

        contentEl.innerHTML = `<div class="file-browser-nav"><button id="fs-back-btn" ${winData.currentPath === '/' ? 'disabled' : ''}><i class="fa-solid fa-arrow-left"></i></button><span>${winData.currentPath}</span></div><div class="file-browser-grid"></div>`;
        const grid = contentEl.querySelector('.file-browser-grid');

        for (const name in currentDir) {
            const item = currentDir[name];
            const itemEl = document.createElement('div');
            itemEl.className = 'file-browser-item';
            itemEl.innerHTML = `<i class="fa-solid ${item.type === 'folder' ? 'fa-folder' : 'fa-file-lines'}"></i><p>${name}</p>`;

            itemEl.ondblclick = () => {
                if (item.type === 'folder') {
                    winData.currentPath = (winData.currentPath === '/' ? '' : winData.currentPath) + `/${name}`;
                    this.setupFileBrowser(contentEl, winData);
                } else {
                    this.createWindow('editor', name, {
                        filePath: `${winData.currentPath}/${name}`
                    });
                }
            };
            grid.appendChild(itemEl);
        }

        contentEl.querySelector('#fs-back-btn').onclick = () => {
            const newPath = winData.currentPath.substring(0, winData.currentPath.lastIndexOf('/'));
            winData.currentPath = newPath || '/';
            this.setupFileBrowser(contentEl, winData);
        };
    },
    setupEditor(contentEl, winData) {
        const pathParts = winData.path.split('/').filter(Boolean);
        const fileName = pathParts.pop();
        let parentDir = fileSystem;
        pathParts.forEach(part => {
            if (parentDir.children && parentDir.children[part]) {
                parentDir = parentDir.children[part];
            } else if (parentDir[part]) {
                 parentDir = parentDir[part];
            }
        });
        
        const file = parentDir.children ? parentDir.children[fileName] : parentDir[fileName];

        contentEl.classList.add('editor-container');
        contentEl.innerHTML = `
            <div class="editor-toolbar">
                <button id="save-btn" class="utility-button"><i class="fa-solid fa-save"></i> Save</button>
            </div>
            <textarea class="utility-textarea editor-textarea"></textarea>
        `;

        const textarea = contentEl.querySelector('.editor-textarea');
        textarea.value = file.content;

        contentEl.querySelector('#save-btn').onclick = () => {
            file.content = textarea.value;
            showNotification(`Saved ${fileName}`, 2000);
        };
    },
    setupSettings(contentEl) {
        contentEl.innerHTML = `
            <h4>System Theme</h4>
            <div id="theme-swatches" style="display: flex; gap: 10px;">
                <button data-theme="dark" class="utility-button">Dark</button>
                <button data-theme="light" class="utility-button">Light</button>
                <button data-theme="blue" class="utility-button">Blue</button>
            </div>
            <hr style="border-color: #444;">
            <h4>Background Effect</h4>
            <div id="background-mode-buttons" style="display: flex; flex-wrap: wrap; gap: 10px;">
                <button data-mode="matrix" class="utility-button">Matrix</button>
                <button data-mode="constellation" class="utility-button">Constellation</button>
                <button data-mode="synthwave" class="utility-button">Synthwave</button>
            </div>
            <div id="matrix-settings">
                <hr style="border-color: #444;">
                <h4>Matrix Settings</h4>
                <div id="rain-effect-buttons" style="display: flex; flex-wrap: wrap; gap: 10px;">
                    <button data-mode="default" class="utility-button">Default</button>
                    <button data-mode="glitch" class="utility-button">Glitch</button>
                    <button data-mode="rave" class="utility-button">Rave</button>
                    <button data-mode="rainbow" class="utility-button">Rainbow</button>
                    <button data-mode="scanning" class="utility-button">Scanning</button>
                </div>
                <div id="rain-direction-buttons" style="display: flex; gap: 10px; margin-top: 10px;">
                    <button data-direction="down" class="utility-button">Down</button>
                    <button data-direction="up" class="utility-button">Up</button>
                    <button data-direction="left" class="utility-button">Left</button>
                    <button data-direction="right" class="utility-button">Right</button>
                </div>
                <div id="rain-color-swatches" style="display: flex; gap: 10px; margin-top: 10px;"></div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="color" id="rain-color-picker" value="${desktopSettings.matrixColor}">
                    <input type="text" id="rain-color-input" class="utility-input" placeholder="#008F11" value="${desktopSettings.matrixColor}">
                </div>
            </div>`;

        const colorPicker = contentEl.querySelector('#rain-color-picker');
        const colorInput = contentEl.querySelector('#rain-color-input');
        const rainSwatches = contentEl.querySelector('#rain-color-swatches');

        const colors = {
            green: '#008F11',
            blue: '#00AEEF',
            red: '#F00',
            purple: '#800080'
        };
        for (const colorName in colors) {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = colors[colorName];
            swatch.onclick = () => {
                desktopSettings.matrixColor = colors[colorName];
                colorPicker.value = colors[colorName];
                colorInput.value = colors[colorName];
            };
            rainSwatches.appendChild(swatch);
        }

        colorPicker.oninput = (e) => {
            desktopSettings.matrixColor = e.target.value;
            colorInput.value = e.target.value;
        };
        colorInput.onchange = (e) => {
            desktopSettings.matrixColor = e.target.value;
            colorPicker.value = e.target.value;
        };

        contentEl.querySelectorAll('#theme-swatches button').forEach(button => {
            button.onclick = () => document.body.dataset.theme = button.dataset.theme;
        });

        contentEl.querySelectorAll('#background-mode-buttons button').forEach(button => {
            button.onclick = () => {
                desktopSettings.backgroundMode = button.dataset.mode;
                contentEl.querySelector('#matrix-settings').style.display = button.dataset.mode === 'matrix' ? 'block' : 'none';
                resizeCanvas();
            };
        });

        contentEl.querySelectorAll('#rain-effect-buttons button').forEach(button => {
            button.onclick = () => {
                desktopSettings.rainMode = button.dataset.mode;
                if (button.dataset.mode === 'scanning') {
                    scanStartTime = Date.now();
                }
            }
        });
        contentEl.querySelectorAll('#rain-direction-buttons button').forEach(button => {
            button.onclick = () => {
                desktopSettings.rainDirection = button.dataset.direction;
                setupRain();
            };
        });
        contentEl.querySelector('#matrix-settings').style.display = desktopSettings.backgroundMode === 'matrix' ? 'block' : 'none';
    },
    setupHashingCalculator(contentEl) {
        contentEl.innerHTML = `
            <label for="hash-input">Input Text:</label>
            <textarea id="hash-input" class="utility-textarea"></textarea>
            <div id="hash-output" class="utility-output">
                <div><strong>MD5:</strong> <span id="md5-val"></span></div>
                <div><strong>SHA-1:</strong> <span id="sha1-val"></span></div>
                <div><strong>SHA-256:</strong> <span id="sha256-val"></span></div>
            </div>`;

        const input = contentEl.querySelector('#hash-input');
        input.oninput = () => {
            const text = input.value;
            contentEl.querySelector('#md5-val').textContent = CryptoJS.MD5(text).toString();
            contentEl.querySelector('#sha1-val').textContent = CryptoJS.SHA1(text).toString();
            contentEl.querySelector('#sha256-val').textContent = CryptoJS.SHA256(text).toString();
        };
    },
    setupSteganographyTool(contentEl) {
        contentEl.innerHTML = `
            <label for="steg-cover">Cover Text:</label>
            <textarea id="steg-cover" class="utility-textarea"></textarea>
            <label for="steg-secret">Secret Message:</label>
            <textarea id="steg-secret" class="utility-textarea" placeholder="Message to hide..."></textarea>
            <button id="steg-encode-btn" class="utility-button">Encode</button>
            <hr style="border-color: #444; margin: 10px 0;">
            <label for="steg-decode-input">Text to Decode:</label>
            <textarea id="steg-decode-input" class="utility-textarea"></textarea>
            <button id="steg-decode-btn" class="utility-button">Decode</button>
            <div id="steg-output" class="utility-output"></div>`;

        contentEl.querySelector('#steg-encode-btn').onclick = () => {
            const cover = contentEl.querySelector('#steg-cover').value;
            const secret = contentEl.querySelector('#steg-secret').value;
            const encoded = Steganography.encode(cover, secret);
            contentEl.querySelector('#steg-decode-input').value = encoded;
        };
        contentEl.querySelector('#steg-decode-btn').onclick = () => {
            const text = contentEl.querySelector('#steg-decode-input').value;
            const decoded = Steganography.decode(text);
            contentEl.querySelector('#steg-output').textContent = `Decoded: ${decoded}`;
        };
    },
    setupCryptool(contentEl) {
        contentEl.innerHTML = `
            <label for="cryptool-input">Input:</label>
            <textarea id="cryptool-input" class="utility-textarea" style="height: 120px;"></textarea>
            
            <div style="display:flex; align-items: center; gap: 10px; margin-top:15px;">
                <label for="cryptool-operation" style="flex-shrink: 0;">Operation:</label>
                <select id="cryptool-operation" class="utility-input" style="height: 35px; flex-grow: 1;">
                    <option value="b64">Base64</option>
                    <option value="url">URL</option>
                    <option value="hex">Hex</option>
                    <option value="rot13">ROT13</option>
                </select>
                <label class="toggle-switch">
                    <input type="checkbox" id="cryptool-decode-toggle">
                    <span class="slider"></span>
                </label>
                <span id="cryptool-mode-label" style="width: 55px;">Encode</span>
            </div>

            <button id="cryptool-convert-btn" class="utility-button" style="margin-top:15px;">Convert</button>

            <label for="cryptool-output" style="margin-top: 15px;">Output:</label>
            <textarea id="cryptool-output" class="utility-textarea" style="height: 120px;" readonly></textarea>`;

        const input = contentEl.querySelector('#cryptool-input');
        const output = contentEl.querySelector('#cryptool-output');
        const operationSelect = contentEl.querySelector('#cryptool-operation');
        const decodeToggle = contentEl.querySelector('#cryptool-decode-toggle');
        const modeLabel = contentEl.querySelector('#cryptool-mode-label');
        const convertBtn = contentEl.querySelector('#cryptool-convert-btn');

        const updateUI = () => {
            const isRot13 = operationSelect.value === 'rot13';
            const isDecode = decodeToggle.checked;

            decodeToggle.style.visibility = isRot13 ? 'hidden' : 'visible';
            modeLabel.textContent = isRot13 ? '' : (isDecode ? 'Decode' : 'Encode');
            convertBtn.textContent = isRot13 ? 'Apply' : 'Convert';
        };

        operationSelect.onchange = updateUI;
        decodeToggle.onchange = updateUI;

        convertBtn.onclick = () => {
            const op = operationSelect.value;
            const val = input.value;
            const isDecode = decodeToggle.checked;

            if (op === 'rot13') {
                output.value = val.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() <= 'm' ? 13 : -13)));
                return;
            }

            if (isDecode) {
                switch (op) {
                    case 'b64':
                        try {
                            output.value = atob(val);
                        } catch (e) {
                            output.value = 'Error: Invalid Base64 string';
                        }
                        break;
                    case 'url':
                        output.value = decodeURIComponent(val);
                        break;
                    case 'hex':
                        try {
                            output.value = val.match(/.{1,2}/g).map(hex => String.fromCharCode(parseInt(hex, 16))).join('');
                        } catch (e) {
                            output.value = "Invalid Hex string"
                        }
                        break;
                }
            } else { // Encode
                switch (op) {
                    case 'b64':
                        output.value = btoa(val);
                        break;
                    case 'url':
                        output.value = encodeURIComponent(val);
                        break;
                    case 'hex':
                        output.value = [...val].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
                        break;
                }
            }
        };

        updateUI();
    },
    setupRegexTester(contentEl) {
        contentEl.innerHTML = `
            <label for="regex-presets">Presets:</label>
            <select id="regex-presets" class="utility-input" style="height: 35px; margin-bottom: 10px;">
                <option value="">Select a preset...</option>
                <option value="/^([\\w-\\.]+)@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.)|(([\\w-]+\\.)+))([a-zA-Z]{2,4}|[0-9]{1,3})(\\]?)$/g">Email</option>
                <option value="/https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b([-a-zA-Z0-9()@:%_\\+.~#?&//=]*)/g">URL</option>
                <option value="/\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b/g">IPv4 Address</option>
                <option value="/\\d{4}-\\d{2}-\\d{2}/g">Date (YYYY-MM-DD)</option>
            </select>
            <label for="regex-pattern">Regex Pattern:</label>
            <input type="text" id="regex-pattern" class="utility-input" placeholder="/pattern/flags">
            <label for="regex-test-string">Test String:</label>
            <textarea id="regex-test-string" class="utility-textarea"></textarea>
            <label for="regex-output">Result:</label>
            <div id="regex-output"></div>`;

        const patternInput = contentEl.querySelector('#regex-pattern');
        const stringInput = contentEl.querySelector('#regex-test-string');
        const outputDiv = contentEl.querySelector('#regex-output');
        const presets = contentEl.querySelector('#regex-presets');

        const runTest = () => {
            const pattern = patternInput.value;
            const str = stringInput.value;
            if (!pattern || !str) {
                outputDiv.innerHTML = '';
                return;
            }

            try {
                const match = pattern.match(new RegExp('^/(.*?)/([gimyusv]*)$'));
                if (!match) {
                    outputDiv.textContent = 'Invalid pattern format. Use /pattern/flags.';
                    return;
                }
                const [, p, f] = match;
                // Ensure the global flag is present for matchAll to work correctly
                const flags = f.includes('g') ? f : f + 'g';
                const regex = new RegExp(p, flags);

                // Clear previous results
                outputDiv.innerHTML = '';
                
                const matches = Array.from(str.matchAll(regex));

                if (matches.length === 0) {
                    outputDiv.textContent = 'No matches found.';
                    return;
                }

                let lastIndex = 0;
                matches.forEach(matchData => {
                    const [fullMatch] = matchData;
                    const matchIndex = matchData.index;

                    // Append the text before the match as a text node (safe)
                    if (matchIndex > lastIndex) {
                        outputDiv.appendChild(document.createTextNode(str.substring(lastIndex, matchIndex)));
                    }

                    // Create a span for the match and set its textContent (safe)
                    const span = document.createElement('span');
                    span.className = 'match';
                    span.textContent = fullMatch;
                    outputDiv.appendChild(span);

                    lastIndex = matchIndex + fullMatch.length;
                });

                // Append any remaining text after the last match as a text node (safe)
                if (lastIndex < str.length) {
                    outputDiv.appendChild(document.createTextNode(str.substring(lastIndex)));
                }

            } catch (e) {
                outputDiv.textContent = `Error: ${e.message}`;
            }
        };

        presets.onchange = () => {
            if (presets.value) {
                patternInput.value = presets.value;
                runTest();
            }
        };
        patternInput.oninput = runTest;
        stringInput.oninput = runTest;
    },
    setupAddWebAppDialog(contentEl) {
        contentEl.innerHTML = `
            <label for="webapp-name">Launcher Name:</label>
            <input type="text" id="webapp-name" class="utility-input" placeholder="e.g., My Music">
            <label for="webapp-url" style="margin-top: 15px;">URL:</label>
            <input type="url" id="webapp-url" class="utility-input" placeholder="https://spotify.com">
            <button id="add-webapp-btn" class="utility-button" style="margin-top: 15px;">Add Launcher</button>
        `;
        contentEl.querySelector('#add-webapp-btn').onclick = () => {
            const name = contentEl.querySelector('#webapp-name').value;
            const url = contentEl.querySelector('#webapp-url').value;
            if (name && url) {
                addWebApp(name, url);
                this.closeWindow('add-webapp-dialog');
            }
        };
    },
    async executeCommand(cmd, outputEl, inputEl) {
        const [command, ...args] = cmd.split(' ');
        let result = '';
        switch (command.toLowerCase()) {
            case 'help':
            case 'info':
                result = `Available commands:<br> - help/info: Show this help message<br> - date: Show current date<br> - whoami: Display current user<br> - ls: List desktop items<br> - neofetch: Display system info<br> - clear: Clear the terminal screen<br> - hash [algo] "[text]": Calculate hash (md5, sha1, sha256)<br> - steg encode "[cover]" "[secret]": Hide text<br> - steg decode "[text]": Reveal text<br> - base64 [encode|decode] "[text]"<br> - urlencode "[text]" / urldecode "[text]"<br> - hex [encode|decode] "[text]"<br> - rot13 "[text]"<br> - regex "/pattern/f" "[text]"<br> - grep "pattern" /path/to/file<br> - find /path -name "filename"<br> - curl [url]`;
                break;
            case 'date':
                result = new Date().toString();
                break;
            case 'whoami':
                result = desktopSettings.username;
                break;
            case 'echo':
                result = args.join(' ');
                break;
            case 'clear':
                outputEl.innerHTML = '';
                return;
            case 'ls':
                result = Object.keys(fileSystem.home.children[desktopSettings.username].children.Desktop.children).join('<br>');
                break;
            case 'grep':
                const grepParts = cmd.match(/"(.*?)"/);
                const grepPattern = grepParts ? grepParts[1] : null;
                const grepFilePath = args[args.length - 1];
                if (grepPattern && grepFilePath) {
                    const file = getFileByPath(grepFilePath);
                    if (file && file.type === 'file') {
                        const regex = new RegExp(grepPattern, 'g');
                        const lines = file.content.split('\n');
                        const matchingLines = lines.filter(line => line.match(regex));
                        
                        // --- XSS FIX: Build result using secure DOM methods ---
                        const resultFragment = document.createDocumentFragment();
                        matchingLines.forEach(line => {
                            const lineEl = document.createElement('div');
                            const parts = line.split(regex);
                            const matches = line.match(regex);
                            
                            parts.forEach((part, index) => {
                                if (part) {
                                    lineEl.appendChild(document.createTextNode(part));
                                }
                                if (index < parts.length - 1) {
                                    const matchEl = document.createElement('span');
                                    matchEl.className = 'grep-match';
                                    matchEl.textContent = matches[index];
                                    lineEl.appendChild(matchEl);
                                }
                            });
                            resultFragment.appendChild(lineEl);
                        });
                        outputEl.appendChild(resultFragment);
                        return; // Return early as we've already appended the result
                    } else {
                        result = `grep: ${grepFilePath}: No such file or directory`;
                    }
                } else {
                    result = 'Usage: grep "pattern" /path/to/file';
                }
                break;
            case 'neofetch':
                const ua = navigator.userAgent;
                let os = "Unknown OS";
                if (ua.indexOf("Win") != -1) os = "Windows";
                if (ua.indexOf("Mac") != -1) os = "MacOS";
                if (ua.indexOf("Linux") != -1) os = "Linux";
                if (ua.indexOf("Android") != -1) os = "Android";
                if (ua.indexOf("like Mac") != -1) os = "iOS";
                result = `<div style="display: flex; gap: 10px;"><pre style="color:#FF3333; margin:0;">
        .--.
       |o_o |
       |:_/ |
      //   \\ \\
     (|     | )
    / \\_   _/ \\
    \\___)=(___/
</pre><pre style="color:#71C5FF; margin:0;"><b>${desktopSettings.username}@marionette</b>
-----------------
<b>OS</b>: ${os}
<b>Host</b>: Browser VM 1.0
<b>Kernel</b>: ${navigator.platform}
<b>Browser</b>: ${navigator.vendor}
<b>Resolution</b>: ${screen.width}x${screen.height}
<b>CPU</b>: ${navigator.hardwareConcurrency}
<b>Language</b>: ${navigator.language}
</pre></div>`;
                break;
            default:
                result = `bash: command not found: ${command}`;
        }
        outputEl.innerHTML += result + '<br><br>';
    }
};

// ... (Rest of the file is unchanged) ...
const Steganography = {
    zero: '\u200B',
    one: '\u200C',
    toBinary: function(str) {
        return str.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join('');
    },
    fromBinary: function(bin) {
        return bin.match(/.{1,8}/g).map(b => String.fromCharCode(parseInt(b, 2))).join('');
    },
    encode: function(cover, secret) {
        const binarySecret = this.toBinary(secret);
        let result = '';
        let secretIndex = 0;
        for (let i = 0; i < cover.length; i++) {
            result += cover[i];
            if (secretIndex < binarySecret.length) {
                result += binarySecret[secretIndex] === '0' ? this.zero : this.one;
                secretIndex++;
            }
        }
        if (secretIndex < binarySecret.length) result += binarySecret.substring(secretIndex).replace(/0/g, this.zero).replace(/1/g, this.one);
        return result;
    },
    decode: function(text) {
        const binaryMessage = text.split('').filter(c => c === this.zero || c === this.one).map(c => c === this.zero ? '0' : '1').join('');
        return this.fromBinary(binaryMessage);
    }
};

function setupContextMenu() {
    const desktop = document.getElementById('desktop');
    const menu = document.getElementById('context-menu');

    desktop.addEventListener('contextmenu', e => {
        e.preventDefault();
        const target = e.target.closest('.desktop-icon');
        menu.innerHTML = '';

        const list = document.createElement('ul');
        if (target) {
            const openLi = document.createElement('li');
            openLi.innerHTML = `<i class="fa-solid fa-folder-open"></i> Open`;
            openLi.onclick = () => target.dispatchEvent(new Event('dblclick'));
            list.appendChild(openLi);

            const renameLi = document.createElement('li');
            renameLi.innerHTML = `<i class="fa-solid fa-i-cursor"></i> Rename`;
            renameLi.onclick = () => {
                const p = target.querySelector('p');
                const oldName = p.textContent;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = oldName;
                input.className = 'rename-input';
                p.replaceWith(input);
                input.focus();
                input.select();

                const finishRename = () => {
                    const newName = input.value.trim();
                    const desktopFs = fileSystem.home.children[desktopSettings.username].children.Desktop.children;
                    if (newName && newName !== oldName) {
                        if (desktopFs[newName]) {
                            showNotification(`Error: An item named "${newName}" already exists.`, 3000);
                            input.replaceWith(p);
                        } else {
                            desktopFs[newName] = desktopFs[oldName];
                            delete desktopFs[oldName];
                            target.dataset.name = newName;
                            p.textContent = newName;
                            input.replaceWith(p);
                        }
                    } else {
                        input.replaceWith(p);
                    }
                };

                input.addEventListener('blur', finishRename);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') finishRename();
                });
            };
            list.appendChild(renameLi);

            const deleteLi = document.createElement('li');
            deleteLi.innerHTML = `<i class="fa-solid fa-trash-can"></i> Delete`;
            deleteLi.onclick = () => {
                const name = target.dataset.name;
                delete fileSystem.home.children[desktopSettings.username].children.Desktop.children[name];
                target.remove();
            };
            list.appendChild(deleteLi);
        } else {
            const createFolderLi = document.createElement('li');
            createFolderLi.innerHTML = `<i class="fa-solid fa-folder-plus"></i> Create New Folder`;
            createFolderLi.onclick = createNewFolder;
            list.appendChild(createFolderLi);

            const createFileLi = document.createElement('li');
            createFileLi.innerHTML = `<i class="fa-regular fa-file"></i> Create New Text File`;
            createFileLi.onclick = createNewFile;
            list.appendChild(createFileLi);
        }
        menu.appendChild(list);

        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
    });

    window.addEventListener('click', () => {
        menu.style.display = 'none';
    });
}

let fileCounter = 0;

function createNewFile() {
    fileCounter++;
    const fileName = `new-file-${fileCounter}.txt`;
    const icon = createDesktopIcon(fileName, 'file');
    document.getElementById('desktop').appendChild(icon);
    makeDraggable(icon);

    fileSystem.home.children[desktopSettings.username].children.Desktop.children[fileName] = {
        type: 'file',
        content: ''
    };
}

let folderCount = 0;

function createNewFolder() {
    folderCount++;
    const folderName = `New Folder ${folderCount}`;
    const icon = createDesktopIcon(folderName, 'folder');
    document.getElementById('desktop').appendChild(icon);
    makeDraggable(icon);
    fileSystem.home.children[desktopSettings.username].children.Desktop.children[folderName] = {
        type: 'folder',
        children: {}
    };
}

function createDesktopIcon(name, type, url = null) {
    const icon = document.createElement('div');
    icon.className = 'desktop-icon';
    icon.dataset.name = name;
    icon.dataset.filetype = type;
    if (url) icon.dataset.url = url;

    const iconImage = type === 'webapp' ?
        `<img src="https://www.google.com/s2/favicons?domain=${url}&sz=64" onerror="this.onerror=null;this.src='https://placehold.co/48x48/cccccc/ffffff?text=%3F';">` :
        `<i class="fa-solid ${type === 'folder' ? 'fa-folder' : 'fa-file-lines'}"></i>`;

    icon.innerHTML = `${iconImage}<p>${sanitizeHTML(name)}</p>`;

    icon.ondblclick = () => {
        if (type === 'file') {
            WindowManager.createWindow('editor', name, {
                filePath: `${WindowManager.getUserDesktopPath()}/${name}`
            });
        } else if (type === 'webapp') {
            window.open(url, '_blank');
        } else if (type === 'folder') {
            WindowManager.createWindow('file-browser', name, {
                path: `${WindowManager.getUserDesktopPath()}/${name}`
            });
        }
    };
    return icon;
}

function addWebApp(name, url) {
    if (!url.startsWith('http:') && !url.startsWith('https:')) {
        showNotification('Error: Invalid URL. Only http/https allowed.', 3000);
        return;
    }
    desktopSettings.webApps.push({
        name,
        url
    });
    updateWebAppList();
    const icon = createDesktopIcon(name, 'webapp', url);
    document.getElementById('desktop').appendChild(icon);
    makeDraggable(icon);
}

function updateWebAppList() {
    const list = document.getElementById('webapp-list');
    const separator = document.getElementById('webapp-separator');
    list.innerHTML = '';
    if (desktopSettings.webApps.length > 0) {
        separator.style.display = 'block';
        desktopSettings.webApps.forEach(app => {
            const item = document.createElement('li');
            item.innerHTML = `<i class="fa-solid fa-globe"></i> ${sanitizeHTML(app.name)}`;
            item.onclick = () => window.open(app.url, '_blank');
            list.appendChild(item);
        });
    } else {
        separator.style.display = 'none';
    }
}

function setupPanelMenus() {
    const menuButtons = document.querySelectorAll('.panel-menu-container > .panel-menu');

    menuButtons.forEach(button => {
        button.addEventListener('click', e => {
            e.stopPropagation();
            const isVisible = button.classList.contains('menu-open');
            menuButtons.forEach(b => b.classList.remove('menu-open'));
            if (!isVisible) {
                button.classList.add('menu-open');
            }
        });

        button.addEventListener('mouseenter', e => {
            const anyMenuOpen = document.querySelector('.panel-menu.menu-open');
            if (anyMenuOpen && !button.classList.contains('menu-open')) {
                menuButtons.forEach(b => b.classList.remove('menu-open'));
                button.classList.add('menu-open');
            }
        });
    });

    document.getElementById('places-home').addEventListener('click', (e) => {
        e.stopPropagation();
        WindowManager.createWindow('file-browser', 'Home', { path: WindowManager.getUserHomePath() });
        menuButtons.forEach(b => b.classList.remove('menu-open'));
    });
    document.getElementById('places-desktop').addEventListener('click', (e) => {
        e.stopPropagation();
        WindowManager.createWindow('file-browser', 'Desktop', { path: WindowManager.getUserDesktopPath() });
        menuButtons.forEach(b => b.classList.remove('menu-open'));
    });

    document.querySelectorAll('li[data-app]').forEach(item => {
        item.addEventListener('click', (event) => {
            event.stopPropagation();
            const appId = item.getAttribute('data-app');
            const appTitle = item.textContent.trim();
            const appData = {
                path: item.getAttribute('data-path')
            };
            if (appId === 'logout') location.reload();
            else if (appId === 'save-state') saveState();
            else if (appId === 'load-state') loadState();
            else if (appId === 'add-webapp') {
                WindowManager.createWindow('add-webapp-dialog', 'Add Web Launcher');
            } else WindowManager.createWindow(appId, appTitle, appData);
            menuButtons.forEach(b => b.classList.remove('menu-open'));
        });
    });

    window.addEventListener('click', (e) => {
        if (!e.target.closest('.panel-menu')) {
            menuButtons.forEach(b => b.classList.remove('menu-open'));
        }
    });

    document.querySelectorAll('#workspace-switcher .workspace-button').forEach(btn => btn.addEventListener('click', () => WindowManager.switchWorkspace(parseInt(btn.dataset.workspace))));
}

function makeDraggable(element) {
    let isDragging = false,
        offsetX, offsetY;
    element.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        isDragging = true;
        element.style.position = 'absolute';
        offsetX = e.clientX - element.offsetLeft;
        offsetY = e.clientY - element.offsetTop;
        element.style.zIndex = ++WindowManager.highestZ;
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (isDragging) {
            element.style.left = `${e.clientX - offsetX}px`;
            element.style.top = `${e.clientY - offsetY}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

function setupTrash() {
    const trashBin = document.getElementById('trash-bin');
    trashBin.addEventListener('dragover', (e) => {
        e.preventDefault();
        trashBin.classList.add('drag-over');
    });
    trashBin.addEventListener('dragleave', () => {
        trashBin.classList.remove('drag-over');
    });
    trashBin.addEventListener('drop', (e) => {
        e.preventDefault();
        trashBin.classList.remove('drag-over');
        const name = e.dataTransfer.getData('text/plain');
        const icon = document.querySelector(`.desktop-icon[data-name="${name}"]`);
        if (icon) {
            icon.remove();
            delete fileSystem.home.children[desktopSettings.username].children.Desktop.children[name];
            desktopSettings.webApps = desktopSettings.webApps.filter(app => app.name !== name);
            updateWebAppList();
        }
    });
}

function initializeDesktop() {
    const savedState = localStorage.getItem('marionette_state');
    if (savedState) {
        applyState(JSON.parse(savedState));
    } else {
        fileSystem = {
            home: {
                type: 'folder',
                children: {
                    [desktopSettings.username]: {
                        type: 'folder',
                        children: {
                            'Desktop': { type: 'folder', children: {} },
                            'Documents': { type: 'folder', children: {} },
                        }
                    }
                }
            },
            bin: { type: 'folder', children: {} },
            etc: { type: 'folder', children: {} },
            usr: { type: 'folder', children: {} },
        };
        const homeIcon = createDesktopIcon("Home", "folder");
        homeIcon.style.top = '20px';
        homeIcon.style.left = '20px';
        document.getElementById('desktop').appendChild(homeIcon);
        fileSystem.home.children[desktopSettings.username].children.Desktop.children['Home'] = {
            type: 'folder',
            children: {}
        };
    }

    document.getElementById('login-screen').style.display = 'none';
    ['top-panel', 'desktop', 'bottom-panel', 'notification-center'].forEach(id => document.getElementById(id).style.display = 'flex');

    showNotification('Welcome to Marionette! You can save your session via the System menu.', 5000);

    resizeCanvas();
    requestAnimationFrame(drawBackground);
    updateClock();
    setInterval(updateClock, 1000);
    setupPanelMenus();
    setupContextMenu();
    setupTrash();
    setupSelectionBox();
    document.querySelectorAll('.desktop-icon').forEach(makeDraggable);
    updateWebAppList();

    setInterval(saveStateToLocalStorage, 10000);

    setupCompanionListeners();
}

function showNotification(message, duration) {
    const notificationCenter = document.getElementById('notification-center');
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = `<span>${sanitizeHTML(message)}</span><span class="notification-close" style="cursor: pointer;">&times;</span>`;

    const closeBtn = notification.querySelector('.notification-close');
    const timeoutId = setTimeout(() => {
        notification.classList.add('hide');
        setTimeout(() => notification.remove(), 500);
    }, duration);

    closeBtn.onclick = () => {
        clearTimeout(timeoutId);
        notification.classList.add('hide');
        setTimeout(() => notification.remove(), 500);
    };

    notificationCenter.appendChild(notification);
}

function gatherState() {
    const icons = [];
    document.querySelectorAll('.desktop-icon').forEach(icon => {
        icons.push({
            name: icon.dataset.name,
            filetype: icon.dataset.filetype,
            url: icon.dataset.url,
            top: icon.style.top,
            left: icon.style.left,
        });
    });
    return {
        desktopSettings,
        fileSystem,
        icons
    };
}

function applyState(state) {
    Object.assign(desktopSettings, state.desktopSettings);
    fileSystem = state.fileSystem;

    document.querySelectorAll('.desktop-icon').forEach(i => i.remove());
    if (state.icons) {
        state.icons.forEach(iconData => {
            if (iconData.filetype === 'webapp' && iconData.url && !iconData.url.startsWith('http:') && !iconData.url.startsWith('https:')) {
                console.warn(`Skipping loading invalid web app URL: ${iconData.url}`);
                return;
            }
            const icon = createDesktopIcon(iconData.name, iconData.filetype, iconData.url);
            icon.style.top = iconData.top;
            icon.style.left = iconData.left;
            document.getElementById('desktop').appendChild(icon);
            makeDraggable(icon);
        });
    }
    document.body.dataset.theme = desktopSettings.theme || 'dark';
    updateWebAppList();
}

function saveStateToLocalStorage() {
    const state = gatherState();
    localStorage.setItem('marionette_state', JSON.stringify(state));
}

function saveState() {
    const state = JSON.stringify(gatherState(), null, 2);
    const blob = new Blob([state], {
        type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marionette_config.json';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('State saved to config.json', 2000);
}

function loadState() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = readerEvent => {
            const content = readerEvent.target.result;
            try {
                const state = JSON.parse(content);
                applyState(state);
                showNotification('State loaded successfully!', 2000);
            } catch (error) {
                showNotification('Error loading state file.', 3000);
            }
        }
        reader.readAsText(file, 'UTF-8');
    }
    input.click();
}

function getFileByPath(path) {
    const parts = path.split('/').filter(Boolean);
    let current = fileSystem;
    for (const part of parts) {
        if (current.children && current.children[part]) {
            current = current.children[part];
        } else if (current[part]) {
            return current[part];
        } else {
            return null;
        }
    }
    return current;
}

function findInFileSystem(startPath, name, results) {
    let startNode = getFileByPath(startPath);
    if (!startNode || !startNode.children) return;

    function recurse(currentPath, currentNode) {
        for (const itemName in currentNode) {
            const item = currentNode[itemName];
            const fullPath = `${currentPath}/${itemName}`.replace('//', '/');
            if (itemName.includes(name)) {
                results.push(fullPath);
            }
            if (item.type === 'folder' && item.children) {
                recurse(fullPath, item.children);
            }
        }
    }
    recurse(startPath, startNode.children);
}

function setupSelectionBox() {
    const desktop = document.getElementById('desktop');
    const selectionBox = document.getElementById('selection-box');
    let isSelecting = false;
    let startX, startY;

    desktop.addEventListener('mousedown', (e) => {
        if (e.target === desktop) {
            isSelecting = true;
            startX = e.clientX;
            startY = e.clientY;
            selectionBox.style.left = `${startX}px`;
            selectionBox.style.top = `${startY}px`;
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
            selectionBox.style.display = 'block';

            document.querySelectorAll('.desktop-icon.selected').forEach(i => i.classList.remove('selected'));
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isSelecting) {
            const x = Math.min(e.clientX, startX);
            const y = Math.min(e.clientY, startY);
            const width = Math.abs(e.clientX - startX);
            const height = Math.abs(e.clientY - startY);
            selectionBox.style.left = `${x}px`;
            selectionBox.style.top = `${y}px`;
            selectionBox.style.width = `${width}px`;
            selectionBox.style.height = `${height}px`;
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isSelecting) {
            isSelecting = false;
            selectionBox.style.display = 'none';
            const boxRect = selectionBox.getBoundingClientRect();
            document.querySelectorAll('.desktop-icon').forEach(icon => {
                const iconRect = icon.getBoundingClientRect();
                if (boxRect.left < iconRect.right && boxRect.right > iconRect.left &&
                    boxRect.top < iconRect.bottom && boxRect.bottom > iconRect.top) {
                    icon.classList.add('selected');
                }
            });
        }
    });
}

function setupCompanionListeners() {
    console.log("Setting up Marionette Companion event listeners.");
    const ansi_up = new AnsiUp();
    // SECURITY FIX: Disable the linkify feature in ansi_up to prevent it from creating
    // clickable links from untrusted shell output.
    ansi_up.use_classes = true;
    ansi_up.linkify = false;


    const companionStatusIcon = document.createElement('i');
    companionStatusIcon.className = 'fa-solid fa-circle-xmark';
    companionStatusIcon.style.color = '#dc3545';
    companionStatusIcon.title = 'Companion: Disconnected';
    document.querySelector('.system-tray .tray-icons').prepend(companionStatusIcon);

    const remoteApps = document.querySelectorAll('.remote-app');
    const remoteSeparators = document.querySelectorAll('#remote-separator, #remote-places-separator');

    // SECURITY FIX: Create a reusable function to escape HTML special characters.
    const escapeHTML = (str) => {
        return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    };

    window.addEventListener('marionette-message', (event) => {
        const message = JSON.parse(event.detail);

        switch (message.type) {
            case 'marionette-connected':
                companionStatusIcon.className = 'fa-solid fa-circle-check';
                companionStatusIcon.style.color = '#28a745';
                companionStatusIcon.title = 'Companion: Connected';
                showNotification('Companion Connected', 2000);
                remoteApps.forEach(el => el.style.display = 'flex');
                remoteSeparators.forEach(el => el.style.display = 'block');
                break;

            case 'marionette-disconnected':
                companionStatusIcon.className = 'fa-solid fa-circle-xmark';
                companionStatusIcon.style.color = '#dc3545';
                companionStatusIcon.title = 'Companion: Disconnected';
                showNotification('Companion Disconnected', 2000);
                remoteApps.forEach(el => el.style.display = 'none');
                remoteSeparators.forEach(el => el.style.display = 'none');
                break;

            case 'marionette-error':
                showNotification(`Companion Error: ${message.message}`, 4000);
                break;

            case 'shell_output':
                const { window_id, data } = message;
                const winData = WindowManager.windows.get(window_id);
                if (winData && winData.element) {
                    const outputEl = winData.element.querySelector('.terminal-output');
                    const promptEl = winData.promptEl;
                    const contentEl = outputEl.parentElement;

                    if (outputEl && promptEl) {
                        const cleanedData = data.replace(/\x1b\][0-2];.*?\x07/g, '').replace(/\x1b\[\?2004[hl]/g, '');
                        
                        const lines = cleanedData.split('\n');
                        const newPrompt = lines.pop();
                        const completedLines = lines.join('\n');

                        if (completedLines) {
                            // SECURITY FIX: Escape HTML from shell output before converting ANSI to prevent XSS.
                            const safeHtml = ansi_up.ansi_to_html(escapeHTML(completedLines));
                            outputEl.insertAdjacentHTML('beforeend', safeHtml + '<br>');
                        }
                        
                        // Also sanitize the prompt, which can contain control characters
                        if (newPrompt.includes('\r')) {
                            const parts = newPrompt.split('\r');
                            promptEl.innerHTML = ansi_up.ansi_to_html(escapeHTML(parts.pop()));
                        } else {
                            promptEl.innerHTML += ansi_up.ansi_to_html(escapeHTML(newPrompt));
                        }
                        
                        contentEl.scrollTop = contentEl.scrollHeight;
                    }
                }
                break;

            case 'fs_ls_response':
                const { success, path, content, error, window_id: fs_window_id } = message;
                const fsWindowEl = document.getElementById(`window-${fs_window_id}`);
                if (!fsWindowEl) return;

                const fsWinData = WindowManager.windows.get(fs_window_id);
                if (!fsWinData) return;

                const contentEl = fsWinData.element.querySelector('.window-content');
                const grid = contentEl.querySelector('.file-browser-grid');
                grid.innerHTML = '';

                if (!success) {
                    grid.innerHTML = `<p>Error: ${sanitizeHTML(error)}</p>`;
                    return;
                }

                if (content.length === 0) {
                    grid.innerHTML = `<p>(Directory is empty)</p>`;
                } else {
                    content.forEach(item => {
                        const itemEl = document.createElement('div');
                        itemEl.className = 'file-browser-item';
                        itemEl.innerHTML = `<i class="fa-solid ${item.type === 'dir' ? 'fa-folder' : 'fa-file-lines'}"></i><p>${sanitizeHTML(item.name)}</p>`;
                        itemEl.ondblclick = () => {
                            if (item.type === 'dir') {
                                fsWinData.currentPath = (path === '/' ? '' : path) + `/${item.name}`;
                                WindowManager.setupRemoteFileBrowser(contentEl, fsWinData, fs_window_id);
                            } else {
                                showNotification(`Opening remote files is not yet implemented.`, 2000);
                            }
                        };
                        grid.appendChild(itemEl);
                    });
                }
                contentEl.querySelector('#fs-back-btn').disabled = (path === '/');
                break;
        }
    });
}


// --- App Initialization ---
document.getElementById('login-button').addEventListener('click', () => {
    const username = document.getElementById('username-input').value;
    if (username.trim()) {
        desktopSettings.username = sanitizeHTML(username.trim());
        localStorage.setItem('marionette_username', username.trim());
        initializeDesktop();
    }
});

const savedUsername = localStorage.getItem('marionette_username');
if (savedUsername) {
    document.getElementById('username-input').value = savedUsername;
}

document.getElementById('username-input').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') document.getElementById('login-button').click();
});
