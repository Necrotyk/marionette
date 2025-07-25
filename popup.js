document.addEventListener('DOMContentLoaded', () => {
    // Main View Elements
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const statusDiv = document.getElementById('status');
    const serverAddressInput = document.getElementById('server-address');
    const authTokenInput = document.getElementById('auth-token'); // Corrected ID from original HTML
    const profileSelect = document.getElementById('profile-select');

    // Profile Management Buttons
    const addProfileBtn = document.getElementById('add-profile-btn');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const deleteProfileBtn = document.getElementById('delete-profile-btn');

    // Modal Elements
    const profileFormModal = document.getElementById('profile-form-modal');
    const profileFormTitle = document.getElementById('profile-form-title');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const cancelProfileBtn = document.getElementById('cancel-profile-btn');
    const editingProfileIdInput = document.getElementById('editing-profile-id');
    const profileNameInput = document.getElementById('profile-name');
    const profileAddressInput = document.getElementById('profile-address');
    const profileTokenInput = document.getElementById('profile-token');
    
    // Notification Element
    const notificationArea = document.getElementById('notification-area');
    let notificationTimeout;

    let profiles = [];
    let currentStatus = 'disconnected';

    // SECURITY FIX: Use chrome.storage.session instead of chrome.storage.local.
    // This ensures API keys are not persisted to disk, mitigating theft from a
    // compromised machine. The trade-off is that profiles must be re-created
    // if the browser is fully closed.
    const storage = chrome.storage.session;


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
        const data = await storage.get({ profiles: [] });
        profiles = data.profiles;
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
        if (profile) {
            profileFormTitle.textContent = 'Edit Profile';
            editingProfileIdInput.value = profile.id;
            profileNameInput.value = profile.name;
            // Strip protocol and port for user-friendly editing
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
        
        // --- FIX: Stricter URL Validation ---
        try {
            // Add a temporary protocol to parse schemeless inputs like "localhost"
            if (!/^(ws|wss):\/\//.test(address)) {
                address = 'wss://' + address;
            }
            
            const url = new URL(address);

            // Enforce ws or wss protocol
            if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
                throw new Error('Protocol must be ws:// or wss://');
            }

            // Add default port if not specified
            if (!url.port) {
                url.port = '9001';
            }
            
            // Use the cleaned, valid URL
            address = url.href;

        } catch (e) {
            showNotification(`Invalid address: ${e.message}`);
            return;
        }
        // --- End of Fix ---

        const profileData = {
            id: editingProfileIdInput.value || `profile_${Date.now()}`,
            name,
            address,
            token,
        };

        const existingIndex = profiles.findIndex(p => p.id === profileData.id);
        if (existingIndex > -1) {
            profiles[existingIndex] = profileData;
        } else {
            profiles.push(profileData);
        }

        await storage.set({ profiles });
        await loadProfiles();
        profileSelect.value = profileData.id;
        updateFormForSelectedProfile();
        closeProfileModal();
        showNotification("Profile saved!");
    }


    async function deleteProfile() {
        if (profiles.length === 0) return;
        const selectedId = profileSelect.value;
        profiles = profiles.filter(p => p.id !== selectedId);
        await storage.set({ profiles });
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
        await loadProfiles();
        const state = await chrome.runtime.sendMessage({ type: 'get-connection-status' });
        const status = state.connectionStatus || 'disconnected';
        updateUi(status);
        
        if (status === 'connected' && state.serverAddress) {
            const connectedProfile = profiles.find(p => p.address === state.serverAddress);
            if(connectedProfile) {
                profileSelect.value = connectedProfile.id;
                updateFormForSelectedProfile();
            }
        }
    }

    initialize();
});
