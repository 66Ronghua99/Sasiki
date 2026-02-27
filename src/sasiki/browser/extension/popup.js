/**
 * Popup script for Sasiki Recorder extension
 */

// UI Elements
const startBtn = document.getElementById('btn-start');
const stopBtn = document.getElementById('btn-stop');
const statusDiv = document.getElementById('status');
const connectionDot = document.getElementById('connection-dot');
const connectionText = document.getElementById('connection-text');

// State
let isRecording = false;

// Update UI based on recording state
function updateUI() {
    if (isRecording) {
        statusDiv.textContent = 'Recording in progress...';
        statusDiv.className = 'status recording';
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        statusDiv.textContent = 'Ready to record';
        statusDiv.className = 'status idle';
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

// Check connection status
async function checkConnection() {
    try {
        const status = await chrome.runtime.sendMessage({ action: 'QUERY_RECORDING_STATE' });
        isRecording = status?.isRecording || false;
        updateUI();

        // Check background connection status
        const bgStatus = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'GET_WS_STATUS' }, (response) => {
                resolve(response || { connected: false });
            });
        });

        if (bgStatus.connected) {
            connectionDot.className = 'dot connected';
            connectionText.textContent = 'Connected to server';
        } else {
            connectionDot.className = 'dot disconnected';
            connectionText.textContent = 'Disconnected from server';
        }
    } catch (e) {
        connectionDot.className = 'dot disconnected';
        connectionText.textContent = 'Extension error';
    }
}

// Start recording
startBtn.addEventListener('click', async () => {
    try {
        await chrome.runtime.sendMessage({
            action: 'START_RECORDING',
            fromPopup: true
        });
        isRecording = true;
        updateUI();
    } catch (e) {
        console.error('Failed to start recording:', e);
        statusDiv.textContent = 'Error starting recording';
    }
});

// Stop recording
stopBtn.addEventListener('click', async () => {
    try {
        await chrome.runtime.sendMessage({
            action: 'STOP_RECORDING',
            fromPopup: true
        });
        isRecording = false;
        updateUI();
    } catch (e) {
        console.error('Failed to stop recording:', e);
        statusDiv.textContent = 'Error stopping recording';
    }
});

// Initialize
checkConnection();
