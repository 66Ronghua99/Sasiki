/**
 * Background Service Worker for Sasiki Extension
 *
 * Handles:
 * - WebSocket communication with Python backend
 * - Global recording state across all tabs
 * - Tab event monitoring for cross-page recording
 * - Message forwarding between content scripts and WebSocket
 */

// ============================================================================
// Configuration
// ============================================================================

const WS_URL = 'ws://localhost:8766';

const CONFIG = {
    WS_RECONNECT_DELAY: 3000,       // 3 seconds
    WS_MAX_RECONNECT_ATTEMPTS: 10,
};

// ============================================================================
// Logging
// ============================================================================

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;
    if (data) {
        console[level.toLowerCase() as 'info' | 'warn' | 'error' | 'debug'](`${prefix} ${message}`, data);
    } else {
        console[level.toLowerCase() as 'info' | 'warn' | 'error' | 'debug'](`${prefix} ${message}`);
    }
}

// ============================================================================
// Global Recording State (shared across all tabs)
// ============================================================================

interface GlobalRecordingState {
    isRecording: boolean;
    sessionId: string | null;
    startedAt: number | null;
    tabIds: Set<number>;
}

const globalRecording: GlobalRecordingState = {
    isRecording: false,
    sessionId: null,
    startedAt: null,
    tabIds: new Set()
};

// ============================================================================
// WebSocket Connection
// ============================================================================

let ws: WebSocket | null = null;
let wsReconnectAttempts = 0;
let wsReconnectTimer: number | null = null;

function connectWebSocket() {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
        log('DEBUG', 'WebSocket already connected or connecting');
        return;
    }

    try {
        log('INFO', `Connecting to WebSocket at ${WS_URL}`);
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            log('INFO', 'WebSocket connected');
            wsReconnectAttempts = 0;

            // Register as extension
            ws?.send(JSON.stringify({
                type: 'register',
                client: 'extension',
                version: '1.0'
            }));
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            } catch (e) {
                log('ERROR', 'Failed to parse WebSocket message:', e);
            }
        };

        ws.onclose = () => {
            log('WARN', 'WebSocket closed');
            ws = null;
            scheduleReconnect();
        };

        ws.onerror = (err) => {
            log('ERROR', 'WebSocket error:', err);
        };

    } catch (e) {
        log('ERROR', 'Failed to create WebSocket:', e);
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
    }

    if (wsReconnectAttempts >= CONFIG.WS_MAX_RECONNECT_ATTEMPTS) {
        log('ERROR', `Max reconnect attempts (${CONFIG.WS_MAX_RECONNECT_ATTEMPTS}) reached`);
        return;
    }

    wsReconnectAttempts++;
    log('INFO', `Scheduling reconnect in ${CONFIG.WS_RECONNECT_DELAY}ms (attempt ${wsReconnectAttempts})`);

    wsReconnectTimer = setTimeout(connectWebSocket, CONFIG.WS_RECONNECT_DELAY) as unknown as number;
}

function sendToWebSocket(message: any) {
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        log('WARN', 'WebSocket not connected, cannot send message');
    }
}

async function handleWebSocketMessage(message: any) {
    log('DEBUG', 'Received from WebSocket:', message);

    if (message.type === 'control') {
        const payload = message.payload || message;
        const command = payload.command;
        const sessionId = payload.session_id || payload.sessionId;

        if (command === 'START_RECORDING' || command === 'start') {
            await startRecording(sessionId);
        } else if (command === 'STOP_RECORDING' || command === 'stop') {
            await stopRecording();
        } else if (command === 'PAUSE_RECORDING') {
            // TODO: Implement pause
            log('INFO', 'Pause recording not yet implemented');
        }
    }
}

// ============================================================================
// Recording Management
// ============================================================================

async function startRecording(sessionId?: string) {
    if (globalRecording.isRecording) {
        log('WARN', 'Recording already in progress');
        return;
    }

    globalRecording.isRecording = true;
    globalRecording.sessionId = sessionId || generateSessionId();
    globalRecording.startedAt = Date.now();
    globalRecording.tabIds.clear();

    log('INFO', `Recording started: ${globalRecording.sessionId}`);

    // Get current active tab and start recording there
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
        globalRecording.tabIds.add(tab.id);
        
        // Ensure content script is injected
        const injected = await ensureContentScriptInjected(tab.id);
        if (!injected) {
            log('ERROR', 'Failed to inject content script, recording aborted');
            globalRecording.isRecording = false;
            globalRecording.sessionId = null;
            return;
        }
        
        // Wait for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Send start recording message
        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: 'START_RECORDING',
                sessionId: globalRecording.sessionId,
                tabId: tab.id
            });
        } catch (err) {
            log('WARN', 'Failed to start recording in tab, retrying...');
            // Retry injection once
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['dist/content.js']
                });
                await new Promise(resolve => setTimeout(resolve, 200));
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'START_RECORDING',
                    sessionId: globalRecording.sessionId,
                    tabId: tab.id
                });
            } catch (retryErr) {
                log('ERROR', 'Retry failed, recording may not work in this tab');
            }
        }
    } else {
        log('WARN', 'No active tab found to start recording');
    }

    // Notify Python backend
    sendToWebSocket({
        type: 'control',
        payload: {
            command: 'start',
            session_id: globalRecording.sessionId,
            timestamp: Date.now()
        }
    });
}

async function stopRecording() {
    if (!globalRecording.isRecording) {
        log('WARN', 'No recording in progress');
        return;
    }

    log('INFO', `Stopping recording: ${globalRecording.sessionId}`);

    // Stop recording in all tabs
    for (const tabId of globalRecording.tabIds) {
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'STOP_RECORDING' });
        } catch {
            // Tab may be closed
        }
    }

    // Notify Python backend
    sendToWebSocket({
        type: 'control',
        payload: {
            command: 'stop',
            session_id: globalRecording.sessionId,
            timestamp: Date.now(),
            duration: Date.now() - (globalRecording.startedAt || 0)
        }
    });

    // Reset state
    globalRecording.isRecording = false;
    globalRecording.sessionId = null;
    globalRecording.startedAt = null;
    globalRecording.tabIds.clear();
}

function generateSessionId(): string {
    return 'rec_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
}

// ============================================================================
// Tab Event Listeners (for cross-page recording)
// ============================================================================

// Listen for tab activation (switching between tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (!globalRecording.isRecording) return;

    // Add tab to recording session
    globalRecording.tabIds.add(activeInfo.tabId);

    // Inject content script if needed
    await ensureContentScriptInjected(activeInfo.tabId);

    // Get tab info
    const tab = await chrome.tabs.get(activeInfo.tabId);

    // Notify content script to start recording
    chrome.tabs.sendMessage(activeInfo.tabId, {
        action: 'START_RECORDING',
        sessionId: globalRecording.sessionId,
        isTabSwitch: true
    }).catch(() => {});

    // Record tab switch action
    sendToWebSocket({
        type: 'action',
        payload: {
            type: 'tab_switch',
            timestamp: Date.now(),
            sessionId: globalRecording.sessionId,
            pageContext: {
                url: tab.url,
                title: tab.title,
                tabId: activeInfo.tabId
            }
        }
    });
});

// Listen for new tabs
chrome.tabs.onCreated.addListener((tab) => {
    if (!globalRecording.isRecording) return;
    if (tab.id) {
        globalRecording.tabIds.add(tab.id);
    }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
    globalRecording.tabIds.delete(tabId);
});

// Track navigation history per tab to determine if it's same-tab navigation
const tabNavigationHistory = new Map<number, string>();

// Listen for navigation (URL changes within same tab)
chrome.webNavigation?.onCompleted.addListener((details) => {
    if (!globalRecording.isRecording) return;
    if (details.frameId !== 0) return; // Only main frame

    // Add tab to recording
    globalRecording.tabIds.add(details.tabId);

    // Determine if this is same-tab navigation
    const previousUrl = tabNavigationHistory.get(details.tabId);
    const isSameTab = previousUrl !== undefined;

    // Update navigation history
    tabNavigationHistory.set(details.tabId, details.url);

    // Determine trigger source
    // Note: Background script can't reliably detect click-triggered vs URL-change
    // Content script will override this with more accurate info
    let triggeredBy: 'url_change' | 'redirect' = 'url_change';
    // Type assertion for transitionType which exists on WebNavigationTransitionCallbackDetails
    const transitionDetails = details as chrome.webNavigation.WebNavigationTransitionCallbackDetails;
    if (transitionDetails.transitionType === 'auto_subframe' ||
        transitionDetails.transitionType === 'form_submit' ||
        transitionDetails.transitionType === 'link') {
        triggeredBy = 'redirect';
    }

    // Record navigation action
    sendToWebSocket({
        type: 'action',
        payload: {
            type: 'navigate',
            timestamp: Date.now(),
            sessionId: globalRecording.sessionId,
            url: details.url,
            triggeredBy: triggeredBy,
            isSameTab: isSameTab,
            pageContext: {
                url: details.url,
                tabId: details.tabId
            }
        }
    });
}, { url: [{ schemes: ['http', 'https'] }] });

// Clean up navigation history when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    tabNavigationHistory.delete(tabId);
});

// ============================================================================
// Content Script Management
// ============================================================================

async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
    try {
        // Try to ping the content script
        await chrome.tabs.sendMessage(tabId, { action: 'PING' });
        return true;
    } catch {
        // Content script not loaded, try to inject it
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['dist/content.js']
            });
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Verify injection succeeded
            try {
                await chrome.tabs.sendMessage(tabId, { action: 'PING' });
                return true;
            } catch {
                return false;
            }
        } catch {
            return false;
        }
    }
}

// ============================================================================
// Message Handling
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle state queries from content scripts
    if (message.action === 'QUERY_RECORDING_STATE') {
        sendResponse({
            isRecording: globalRecording.isRecording,
            sessionId: globalRecording.sessionId,
            tabId: sender.tab?.id
        });
        return false;
    }

    // Handle action messages from content script
    if (message.type === 'action') {
        // Add session ID and tab info to the action
        const enrichedMessage = {
            ...message,
            sessionId: globalRecording.sessionId,
            tabId: sender.tab?.id,
            timestamp: Date.now()
        };

        // Forward to WebSocket
        sendToWebSocket(enrichedMessage);
        return false;
    }

    // Handle actions forwarded from sidebar/popup
    if (message.action === 'START_RECORDING' && message.fromPopup) {
        startRecording(message.sessionId);
        sendResponse({ success: true });
        return false;
    }

    if (message.action === 'STOP_RECORDING' && message.fromPopup) {
        stopRecording();
        sendResponse({ success: true });
        return false;
    }

    // Handle status query from popup
    if (message.action === 'GET_WS_STATUS') {
        sendResponse({
            connected: ws?.readyState === WebSocket.OPEN,
            recording: globalRecording.isRecording,
            sessionId: globalRecording.sessionId
        });
        return false;
    }

    return false;
});

// Handle extension action click (toggle sidebar)
chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_SIDEBAR" }).catch(err => {
            log('WARN', 'Could not send message to tab:', err);
        });
    }
});

// ============================================================================
// Initialization
// ============================================================================

log('INFO', 'Background script loaded');
connectWebSocket();

// Expose status for debugging
(globalThis as any).getStatus = () => ({
    wsConnected: ws?.readyState === WebSocket.OPEN,
    recording: globalRecording,
    wsReconnectAttempts
});
