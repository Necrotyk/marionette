document.addEventListener('DOMContentLoaded', () => {
    // Main View Elements
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const statusDiv = document.getElementById('status');
    const serverAddressInput = document.getElementById('server-address');
    const authTokenInput = document.getElementById('auth-token');
    const profileSelect = document.getElementById('profile-select');

    // Profile Management Buttons
    const addProfileBtn = document.getElementById('add-profile-btn');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const deleteProfileBtn = document.getElementById('delete-profile-btn');

    // Profile Modal Elements
    const profileFormModal = document.getElementById('profile-form-modal');
    const profileFormTitle = document.getElementById('profile-form-title');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const cancelProfileBtn = document.getElementById('cancel-profile-btn');
    const editingProfileIdInput = document.getElementById('editing-profile-id');
    const profileNameInput = document.getElementById('profile-name');
    const profileAddressInput = document.getElementById('profile-address');
    const profileTokenInput = document.getElementById('profile-token');

    // Master Password Modal Elements
    const passwordModal = document.getElementById('password-modal');
    const passwordInput = document.getElementById('master-password');
    const unlockBtn = document.getElementById('unlock-btn');
    const passwordError = document.getElementById('password-error');
    
    // Notification Element
    const notificationArea = document.getElementById('notification-area');
    let notificationTimeout;

    let profiles = [];
    let currentStatus = 'disconnected';
    let sessionKey = null; 

    const storage = chrome.storage.local;

    // --- Crypto Helper Functions ---

    /**
     * Derives a cryptographic key from a user password and a salt.
     * @param {string} password The user's master password.
     * @param {Uint8Array} salt A random salt.
     * @returns {Promise<CryptoKey>} A key suitable for AES-GCM.
     */
    async function deriveKey(password, salt) {
        const enc = new TextEncoder();
        const baseKey = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256",
            },
            baseKey,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    }

    /**
     * Encrypts a string using the derived session key.
     * @param {string} data The plaintext string to encrypt.
     * @param {CryptoKey} key The AES-GCM key.
     * @returns {Promise<string>} A base64-encoded string containing the IV and ciphertext.
     */
    async function encrypt(data, key) {
        if (!key) throw new Error("Encryption key is not available.");
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            enc.encode(data)
        );

        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);
        return btoa(String.fromCharCode.apply(null, combined));
    }

    /**
     * Decrypts a base64-encoded string using the derived session key.
     * @param {string} encryptedData The base64-encoded encrypted data.
     * @param {CryptoKey} key The AES-GCM key.
     * @returns {Promise<string>} The decrypted plaintext string.
     */
    async function decrypt(encryptedData, key) {
        if (!key) throw new Error("Decryption key is not available.");
        try {
            const data = atob(encryptedData);
            const combined = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) {
                combined[i] = data.charCodeAt(i);
            }

            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);

            const decrypted = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                key,
                ciphertext
            );
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Decryption failed:", e);
            throw new Error("Decryption failed. Incorrect password?");
        }
    }


    // --- Notification System ---
    function showNotification(message, duration = 3000) {
        clearTimeout(notificationTimeout);
        notificationArea.textContent = message;
        notificationArea.classList.add('show');
        notificationTimeout = setTimeout(() => {
            notificationArea.classList.remove('show');
        }, duration);
    }

    // --- Profile Management ---
    async function loadProfiles() {
        if (!sessionKey) {
            passwordModal.classList.add('visible');
            return;
        }
        const data = await storage.get({ profiles: [] });
        
        const decryptedProfiles = [];
        for (const profile of data.profiles) {
            try {
                const decryptedToken = await decrypt(profile.token, sessionKey);
                decryptedProfiles.push({ ...profile, token: decryptedToken });
            } catch (e) {
                 console.error(`Failed to decrypt profile "${profile.name}". It may be corrupt or was saved with a different password.`);
                 // Intentionally skip adding the profile to avoid showing encrypted data or breaking the UI.
            }
        }
        profiles = decryptedProfiles;

        profileSelect.innerHTML = '';
        if (profiles.length === 0) {
            profileSelect.innerHTML = '<option>No profiles. Add one.</option>';
            editProfileBtn.disabled = true;
            deleteProfileBtn.disabled = true;
            connectBtn.disabled = true;
            serverAddressInput.value = '';
            authTokenInput.value = '';
        } else {
            profiles.forEach(profile => {
                const option = document.createElement('option');
                option.value = profile.id;
                option.textContent = profile.name;
                profileSelect.appendChild(option);
            });
            editProfileBtn.disabled = false;
            deleteProfileBtn.disabled = false;
            connectBtn.disabled = false;
            updateFormForSelectedProfile();
        }
    }

    function updateFormForSelectedProfile() {
        if (profiles.length === 0) {
            serverAddressInput.value = '';
            authTokenInput.value = '';
            return;
        }
        const selectedId = profileSelect.value;
        const selectedProfile = profiles.find(p => p.id === selectedId);
        if (selectedProfile) {
            serverAddressInput.value = selectedProfile.address;
            authTokenInput.value = selectedProfile.token;
        }
    }

    function openProfileModal(profile = null) {
        if (!sessionKey) {
            showNotification("Unlock profiles before editing.", 3000);
            return;
        }
        if (profile) {
            profileFormTitle.textContent = 'Edit Profile';
            editingProfileIdInput.value = profile.id;
            profileNameInput.value = profile.name;
            profileAddressInput.value = profile.address.replace(/^wss?:\/\//, '').replace(/:\d+$/, '');
            profileTokenInput.value = profile.token;
        } else {
            profileFormTitle.textContent = 'Add New Profile';
            editingProfileIdInput.value = '';
            profileNameInput.value = '';
            profileAddressInput.value = '';
            profileTokenInput.value = '';
        }
        profileFormModal.classList.add('visible');
    }

    function closeProfileModal() {
        profileFormModal.classList.remove('visible');
    }

    async function saveProfile() {
        const name = profileNameInput.value.trim();
        let address = profileAddressInput.value.trim();
        const token = profileTokenInput.value.trim();

        if (!name || !address || !token) {
            showNotification("All fields are required.");
            return;
        }
        
        try {
            if (!/^(ws|wss):\/\//.test(address)) {
                address = 'wss://' + address;
            }
            const url = new URL(address);
            if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
                throw new Error('Protocol must be ws:// or wss://');
            }
            if (!url.port) {
                url.port = '9001';
            }
            address = url.href;
        } catch (e) {
            showNotification(`Invalid address: ${e.message}`);
            return;
        }

        const encryptedToken = await encrypt(token, sessionKey);

        const profileData = {
            id: editingProfileIdInput.value || `profile_${Date.now()}`,
            name,
            address,
            token: encryptedToken,
        };

        const rawData = await storage.get({ profiles: [] });
        const rawProfiles = rawData.profiles;
        const existingIndex = rawProfiles.findIndex(p => p.id === profileData.id);

        if (existingIndex > -1) {
            rawProfiles[existingIndex] = profileData;
        } else {
            rawProfiles.push(profileData);
        }

        await storage.set({ profiles: rawProfiles });
        await loadProfiles();
        profileSelect.value = profileData.id;
        updateFormForSelectedProfile();
        closeProfileModal();
        showNotification("Profile saved securely!");
    }


    async function deleteProfile() {
        if (profiles.length === 0) return;
        const selectedId = profileSelect.value;
        
        const rawData = await storage.get({ profiles: [] });
        const remainingProfiles = rawData.profiles.filter(p => p.id !== selectedId);

        await storage.set({ profiles: remainingProfiles });
        await loadProfiles();
        updateFormForSelectedProfile();
        showNotification("Profile deleted.");
    }
    
    // --- Connection Management ---
    function updateUi(status, reason = '') {
        currentStatus = status;
        statusDiv.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        statusDiv.className = `status ${status}`;

        if (status === 'connected') {
            document.getElementById('connection-form').style.display = 'none';
            disconnectBtn.style.display = 'flex';
        } else {
            document.getElementById('connection-form').style.display = 'block';
            disconnectBtn.style.display = 'none';
            if (status === 'disconnected' && reason === 'auth_fail') {
                showNotification("Connection failed: Invalid Auth Token.");
            } else if (status === 'disconnected' && reason) {
                showNotification("Connection failed. Check agent and URL.");
            }
        }
    }

    // --- Password Handling ---
    async function handleUnlock() {
        const password = passwordInput.value;
        if (!password) {
            passwordError.textContent = "Password cannot be empty.";
            return;
        }
        passwordError.textContent = "";
        unlockBtn.disabled = true;
        unlockBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Unlocking...';

        try {
            let { salt, check } = await storage.get(["salt", "check"]);
            
            if (!salt || !check) {
                // First time setup: create salt, derive key, encrypt a check value, and store them.
                const newSalt = crypto.getRandomValues(new Uint8Array(16));
                const newKey = await deriveKey(password, newSalt);
                const newCheck = await encrypt("marionette-check", newKey);

                await storage.set({ 
                    salt: Array.from(newSalt),
                    check: newCheck
                });

                sessionKey = newKey;
                passwordModal.classList.remove('visible');
                showNotification("Password set successfully!", 2000);
                await loadProfiles();
            } else {
                // Existing user: verify password by deriving key and decrypting the check value.
                const storedSalt = new Uint8Array(salt);
                const derivedKey = await deriveKey(password, storedSalt);
                const decryptedCheck = await decrypt(check, derivedKey);

                if (decryptedCheck === "marionette-check") {
                    sessionKey = derivedKey;
                    passwordModal.classList.remove('visible');
                    await loadProfiles();
                } else {
                    passwordError.textContent = "Incorrect password.";
                }
            }
        } catch (e) {
            console.error("Unlock failed:", e);
            passwordError.textContent = "Incorrect password. Please try again.";
        } finally {
            unlockBtn.disabled = false;
            unlockBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Unlock';
        }
    }

    // --- Event Listeners ---
    profileSelect.addEventListener('change', updateFormForSelectedProfile);
    addProfileBtn.addEventListener('click', () => openProfileModal());
    editProfileBtn.addEventListener('click', () => {
        if (profiles.length > 0) {
            const selectedProfile = profiles.find(p => p.id === profileSelect.value);
            openProfileModal(selectedProfile);
        }
    });
    deleteProfileBtn.addEventListener('click', deleteProfile);
    saveProfileBtn.addEventListener('click', saveProfile);
    cancelProfileBtn.addEventListener('click', closeProfileModal);
    unlockBtn.addEventListener('click', handleUnlock);
    passwordInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleUnlock();
    });

    connectBtn.addEventListener('click', () => {
        const address = serverAddressInput.value;
        const token = authTokenInput.value;
        if (!address || !token || currentStatus === 'connected') return;
        
        chrome.runtime.sendMessage({ type: 'connect', address, token });
        updateUi('connecting');
    });

    disconnectBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'disconnect' });
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'statusUpdate') {
            updateUi(message.status, message.reason);
        }
    });

    // --- Initial Load ---
    async function initialize() {
        passwordModal.classList.add('visible');
        passwordInput.focus();

        const state = await chrome.runtime.sendMessage({ type: 'get-connection-status' });
        const status = state.connectionStatus || 'disconnected';
        updateUi(status);
    }

    initialize();
});
