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
    traceId: string | null;
    startedAt: number | null;
    eventSeq: number;
    tabIds: Set<number>;
}

const globalRecording: GlobalRecordingState = {
    isRecording: false,
    sessionId: null,
    traceId: null,
    startedAt: null,
    eventSeq: 0,
    tabIds: new Set()
};

type RecordedActionType = 'click' | 'type' | 'select' | 'press' | 'submit' | 'navigate' | 'scroll' | 'tab_switch' | 'page_enter';

interface ExtensionActionPayload {
    type: RecordedActionType | string;
    timestamp?: number;
    eventId?: string;
    traceId?: string;
    sessionId?: string | null;
    parentEventId?: string;
    value?: string;
    valueBefore?: string;
    valueAfter?: string;
    inputMasked?: boolean;
    url?: string;
    triggersNavigation?: boolean;
    triggeredBy?: string;
    isSameTab?: boolean;
    targetHint?: unknown;
    rawTargetHint?: unknown;
    normalizedTargetHint?: unknown;
    trigger?: 'infinite_scroll' | 'lazy_load';
    loadedContentHint?: string;
    pageContext?: {
        url?: string;
        title?: string;
        tabId?: number;
        frameId?: string;
    };
}

function generateTraceId(sessionId: string): string {
    return `trace_${sessionId.replace(/[^a-zA-Z0-9_]/g, '')}`;
}

function nextEventId(): string {
    globalRecording.eventSeq += 1;
    const sessionSeed = (globalRecording.sessionId || 'sess').replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'sess';
    return `evt_${sessionSeed}_${globalRecording.eventSeq.toString().padStart(6, '0')}`;
}

function mapActionType(actionType: string): string {
    if (actionType === 'scroll_load') {
        return 'scroll';
    }
    const allowed: Record<string, string> = {
        click: 'click',
        type: 'type',
        select: 'select',
        press: 'press',
        submit: 'submit',
        navigate: 'navigate',
        scroll: 'scroll',
        tab_switch: 'tab_switch',
        page_enter: 'page_enter',
    };
    return allowed[actionType] || actionType;
}

function mapNavigationTriggeredBy(
    transitionType?: string
): 'direct' | 'click' | 'submit' | 'url_change' | 'redirect' {
    if (!transitionType) {
        return 'url_change';
    }
    if (transitionType === 'form_submit') {
        return 'submit';
    }
    if (transitionType === 'link') {
        return 'click';
    }
    if (transitionType === 'typed' || transitionType === 'generated' || transitionType === 'auto_bookmark' || transitionType === 'reload') {
        return 'direct';
    }
    if (transitionType === 'auto_subframe' || transitionType === 'manual_subframe') {
        return 'redirect';
    }
    return 'url_change';
}

function enrichActionPayload(payload: ExtensionActionPayload, tabId?: number): ExtensionActionPayload {
    const pageContext = {
        url: payload.pageContext?.url || payload.url || '',
        title: payload.pageContext?.title || '',
        tabId: payload.pageContext?.tabId ?? tabId,
        frameId: payload.pageContext?.frameId || 'main',
    };

    return {
        ...payload,
        type: mapActionType(payload.type || 'click'),
        timestamp: payload.timestamp || Date.now(),
        eventId: payload.eventId || nextEventId(),
        traceId: payload.traceId || globalRecording.traceId || undefined,
        sessionId: payload.sessionId || globalRecording.sessionId,
        pageContext,
        value: payload.value ?? payload.valueAfter,
    };
}

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
    globalRecording.traceId = generateTraceId(globalRecording.sessionId);
    globalRecording.startedAt = Date.now();
    globalRecording.eventSeq = 0;
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
            globalRecording.traceId = null;
            return;
        }
        
        // Wait for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Send start recording message
        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: 'START_RECORDING',
                sessionId: globalRecording.sessionId,
                traceId: globalRecording.traceId,
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
                    traceId: globalRecording.traceId,
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
    globalRecording.traceId = null;
    globalRecording.startedAt = null;
    globalRecording.eventSeq = 0;
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
        traceId: globalRecording.traceId,
        isTabSwitch: true
    }).catch(() => {});

    // Record tab switch action
    const tabSwitchPayload = enrichActionPayload({
        type: 'tab_switch',
        timestamp: Date.now(),
        pageContext: {
            url: tab.url,
            title: tab.title,
            tabId: activeInfo.tabId,
            frameId: 'main',
        },
    }, activeInfo.tabId);
    sendToWebSocket({
        type: 'action',
        payload: tabSwitchPayload
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
    const transitionDetails = details as chrome.webNavigation.WebNavigationTransitionCallbackDetails;
    const triggeredBy = mapNavigationTriggeredBy(transitionDetails.transitionType);

    // Record navigation action
    const navigatePayload = enrichActionPayload({
        type: 'navigate',
        timestamp: Date.now(),
        url: details.url,
        triggeredBy,
        isSameTab,
        pageContext: {
            url: details.url,
            title: '',
            tabId: details.tabId,
            frameId: 'main',
        },
    }, details.tabId);
    sendToWebSocket({
        type: 'action',
        payload: navigatePayload
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
            traceId: globalRecording.traceId,
            tabId: sender.tab?.id
        });
        return false;
    }

    // Handle action messages from content script
    if (message.type === 'action') {
        const payload = enrichActionPayload(
            (message.payload || {}) as ExtensionActionPayload,
            sender.tab?.id
        );

        // Forward to WebSocket
        sendToWebSocket({
            type: 'action',
            payload,
        });
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
