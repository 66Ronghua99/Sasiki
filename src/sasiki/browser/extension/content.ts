
import { AXTreeManager, ElementFingerprint } from './axtree';
import { Sidebar } from './sidebar';
import { VisualHighlighter } from './visual_highlighter';

console.log("[Sasiki] Content script loaded.");

const axTreeManager = new AXTreeManager();
const sidebar = new Sidebar(axTreeManager);
const visualHighlighter = new VisualHighlighter();

// Mount invisible initially
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        sidebar.mount();
    });
} else {
    sidebar.mount();
}

// ============================================================================
// Recording State Management
// ============================================================================

interface RecordingState {
    isRecording: boolean;
    sessionId: string | undefined;
    tabId: number | undefined;
}

let recordingState: RecordingState = {
    isRecording: false,
    sessionId: undefined,
    tabId: undefined
};

// Recording listeners (attached only when recording)
let clickListener: ((e: MouseEvent) => void) | null = null;
let inputListener: ((e: Event) => void) | null = null;
let scrollListener: (() => void) | null = null;
let inputTimeout: number | null = null;
let scrollTimeout: number | null = null;

// Click tracking for navigation detection
interface RecentClickInfo {
    timestamp: number;
    fingerprint: ElementFingerprint;
}
let recentClick: RecentClickInfo | null = null;
const CLICK_NAVIGATION_THRESHOLD = 200; // ms - time window to consider a click as triggering navigation

// ============================================================================
// Initial State Check
// ============================================================================

// On load, check with background if we should be recording
chrome.runtime.sendMessage({ action: 'QUERY_RECORDING_STATE' }, (response) => {
    if (response?.isRecording) {
        recordingState = {
            isRecording: true,
            sessionId: response.sessionId,
            tabId: response.tabId
        };
        attachRecordingListeners();
        console.log('[Sasiki] Auto-started recording from background state');
    }
});

// ============================================================================
// Recording Functions
// ============================================================================

function attachRecordingListeners() {
    if (clickListener || inputListener) {
        console.log('[Sasiki] Recording listeners already attached');
        return;
    }

    console.log('[Sasiki] Attaching recording listeners');

    // Click recording
    clickListener = (e: MouseEvent) => {
        const target = e.target as Element;
        const refId = axTreeManager.getRefIdForElement(target);

        if (refId) {
            const fingerprint = axTreeManager.getElementFingerprint(refId);

            // Track this click for navigation correlation
            recentClick = {
                timestamp: Date.now(),
                fingerprint: fingerprint!
            };

            // Delay the click recording to check if it triggers navigation
            setTimeout(() => {
                const currentUrl = window.location.href;
                const navigationOccurred = !!(recentClick &&
                    (Date.now() - recentClick.timestamp < CLICK_NAVIGATION_THRESHOLD));

                recordAction({
                    timestamp: recentClick?.timestamp || Date.now(),
                    type: 'click',
                    targetHint: fingerprint!,
                    triggersNavigation: navigationOccurred,
                    pageContext: {
                        url: currentUrl,
                        title: document.title,
                        tabId: recordingState.tabId
                    }
                });

                // Clear recent click after processing
                if (navigationOccurred) {
                    // Keep recentClick for MutationObserver to use
                    // It will be cleared after the navigation is recorded
                } else {
                    recentClick = null;
                }
            }, CLICK_NAVIGATION_THRESHOLD + 50);
        } else {
            // Fallback: try to find an interactive parent element (link, button, etc.)
            let elementToRecord: Element | null = target;
            let current: Element | null = target;
            let depth = 0;
            const maxDepth = 5;

            // Check if clicked element or any parent is a native interactive element
            while (current && depth < maxDepth) {
                const tag = current.tagName.toLowerCase();
                const isNativeLink = tag === 'a' && current.hasAttribute('href');
                const isNativeButton = tag === 'button';
                const isNativeInput = tag === 'input' || tag === 'textarea' || tag === 'select';
                const hasRole = current.getAttribute('role');
                const hasTabindex = current.hasAttribute('tabindex');

                if (isNativeLink || isNativeButton || isNativeInput || hasRole || hasTabindex) {
                    elementToRecord = current;
                    break;
                }

                current = current.parentElement;
                depth++;
            }

            if (elementToRecord) {
                // Create fingerprint directly from the element
                const fingerprint = axTreeManager.createFingerprintFromElement(elementToRecord);

                // Track this click for navigation correlation
                recentClick = {
                    timestamp: Date.now(),
                    fingerprint: fingerprint
                };

                // Delay the click recording to check if it triggers navigation
                setTimeout(() => {
                    const currentUrl = window.location.href;
                    const navigationOccurred = !!(recentClick &&
                        (Date.now() - recentClick.timestamp < CLICK_NAVIGATION_THRESHOLD));

                    recordAction({
                        timestamp: recentClick?.timestamp || Date.now(),
                        type: 'click',
                        targetHint: fingerprint,
                        triggersNavigation: navigationOccurred,
                        pageContext: {
                            url: currentUrl,
                            title: document.title,
                            tabId: recordingState.tabId
                        }
                    });

                    if (!navigationOccurred) {
                        recentClick = null;
                    }
                }, CLICK_NAVIGATION_THRESHOLD + 50);
            }
            // Silent skip for non-interactive elements
        }
    };
    document.addEventListener('click', clickListener, true); // use capture phase

    // Input recording (debounced)
    inputListener = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (inputTimeout) window.clearTimeout(inputTimeout);

        inputTimeout = window.setTimeout(() => {
            const refId = axTreeManager.getRefIdForElement(target);
            if (refId) {
                const fingerprint = axTreeManager.getElementFingerprint(refId);
                recordAction({
                    timestamp: Date.now(),
                    type: 'type',
                    targetHint: fingerprint!,
                    value: target.value,
                    pageContext: {
                        url: window.location.href,
                        title: document.title,
                        tabId: recordingState.tabId
                    }
                });
            }
        }, 500); // 500ms debounce
    };
    document.addEventListener('input', inputListener, true);

    // Scroll recording (throttled)
    scrollListener = () => {
        if (scrollTimeout) return;
        scrollTimeout = window.setTimeout(() => {
            scrollTimeout = null;
        }, 250);

        // Only record significant scrolls
        recordAction({
            timestamp: Date.now(),
            type: 'scroll',
            scrollDirection: 'user_scroll',
            pageContext: {
                url: window.location.href,
                title: document.title,
                tabId: recordingState.tabId
            }
        });
    };
    document.addEventListener('scroll', scrollListener, true);
}

function detachRecordingListeners() {
    console.log('[Sasiki] Detaching recording listeners');

    if (clickListener) {
        document.removeEventListener('click', clickListener, true);
        clickListener = null;
    }
    if (inputListener) {
        document.removeEventListener('input', inputListener, true);
        inputListener = null;
    }
    if (scrollListener) {
        document.removeEventListener('scroll', scrollListener, true);
        scrollListener = null;
    }
    if (inputTimeout) {
        window.clearTimeout(inputTimeout);
        inputTimeout = null;
    }
    if (scrollTimeout) {
        window.clearTimeout(scrollTimeout);
        scrollTimeout = null;
    }
}

interface RecordedAction {
    timestamp: number;
    type: string;
    targetHint?: ElementFingerprint;
    value?: string;
    url?: string;
    scrollDirection?: string;
    pageContext: {
        url: string;
        title: string;
        tabId?: number;
    };
    // Navigation tracking fields
    triggersNavigation?: boolean;
    triggeredBy?: 'click' | 'url_change' | 'redirect';
    isSameTab?: boolean;
}

function recordAction(action: RecordedAction) {
    // Add session ID to every action
    const enrichedAction = {
        ...action,
        sessionId: recordingState.sessionId
    };

    console.log('[Sasiki] Recording action:', enrichedAction.type, enrichedAction.targetHint?.name || '');

    // Send to background script
    chrome.runtime.sendMessage({
        type: 'action',
        payload: enrichedAction
    });
}

// Navigation detection
let lastUrl = location.href;
new MutationObserver(() => {
    if (!recordingState.isRecording) return;
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
        const previousUrl = lastUrl;
        lastUrl = currentUrl;

        // Check if this navigation was triggered by a recent click
        const isClickTriggered = recentClick !== null &&
            (Date.now() - recentClick.timestamp < CLICK_NAVIGATION_THRESHOLD + 100);

        // Determine trigger source
        let triggeredBy: 'click' | 'url_change' | 'redirect';
        if (isClickTriggered) {
            triggeredBy = 'click';
        } else if (document.referrer && document.referrer.includes(previousUrl)) {
            triggeredBy = 'redirect';
        } else {
            triggeredBy = 'url_change';
        }

        recordAction({
            timestamp: Date.now(),
            type: 'navigate',
            url: currentUrl,
            triggeredBy: triggeredBy,
            isSameTab: true, // Content script runs in same tab
            pageContext: {
                url: currentUrl,
                title: document.title,
                tabId: recordingState.tabId
            }
        });

        // Clear recent click after navigation is recorded
        if (isClickTriggered) {
            recentClick = null;
        }
    }
}).observe(document, { subtree: true, childList: true });

// Message handler for commands from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Ping handler for connection health check
    if (message.action === 'PING') {
        sendResponse({ success: true, pong: true });
        return false;
    }

    // Recording control messages from background
    if (message.action === 'START_RECORDING') {
        recordingState = {
            isRecording: true,
            sessionId: message.sessionId,
            tabId: message.tabId || sender.tab?.id
        };
        attachRecordingListeners();

        // Record initial page state if this is a new tab
        if (message.isTabSwitch) {
            recordAction({
                type: 'page_enter',
                timestamp: Date.now(),
                pageContext: {
                    url: window.location.href,
                    title: document.title,
                    tabId: recordingState.tabId
                }
            });
        }

        sendResponse({ success: true, recording: true });
        return false;
    }

    if (message.action === 'STOP_RECORDING') {
        detachRecordingListeners();
        recordingState = { isRecording: false, sessionId: undefined, tabId: undefined };
        sendResponse({ success: true, recording: false });
        return false;
    }

    if (message.action === 'TOGGLE_SIDEBAR') {
        sidebar.toggle();
        return false;
    }

    if (message.action === 'GET_AX_TREE') {
        try {
            const tree = axTreeManager.captureTree(document.body);
            sendResponse({
                success: true,
                data: tree,
                url: window.location.href,
                title: document.title
            });
        } catch (e) {
            sendResponse({ success: false, error: String(e) });
        }
        return true; // Keep channel open for async response
    }

    // Compact format: [[refId, role, name, value?], ...]
    // Saves ~85% tokens compared to full tree
    if (message.action === 'GET_AX_TREE_COMPACT') {
        try {
            const compactTree = axTreeManager.captureCompactTree(document.body);
            sendResponse({
                success: true,
                data: compactTree,
                url: window.location.href,
                title: document.title,
                count: compactTree.length
            });
        } catch (e) {
            sendResponse({ success: false, error: String(e) });
        }
        return true;
    }

    // Multimodal enhancement: Get compact tree with visual highlights
    // Returns tree data after highlighting elements (screenshot taken by background)
    if (message.action === 'GET_COMPACT_TREE_WITH_HIGHLIGHTS') {
        // Use Promise-based pattern since listener callback isn't async
        (async () => {
            try {
                console.log('[ContentScript] GET_COMPACT_TREE_WITH_HIGHLIGHTS started');

                // Check document ready state
                if (document.readyState === 'loading') {
                    console.warn('[ContentScript] Document still loading, may cause issues');
                }

                // Single capture to ensure tree, boundsMap, and elementMap are consistent
                // Include bounds so LLM can understand element positions
                const { tree, boundsMap, elementMap } = axTreeManager.captureCompactTreeWithBounds(document.body);
                console.log(`[ContentScript] Captured ${tree.length} elements with bounds`);

                // Add visual highlights to all elements
                const highlightedCount = visualHighlighter.highlightElements(elementMap);
                console.log(`[ContentScript] Highlighted ${highlightedCount} elements`);

                // Wait for rendering to complete using RAF + setTimeout
                await new Promise(resolve =>
                    requestAnimationFrame(() => setTimeout(resolve, 50))
                );

                sendResponse({
                    success: true,
                    data: tree,
                    boundsMap: boundsMap,
                    url: window.location.href,
                    title: document.title,
                    count: tree.length,
                    highlightedCount
                });

                console.log('[ContentScript] Response sent with bounds map');
            } catch (e) {
                console.error('[ContentScript] Error:', e);
                sendResponse({ success: false, error: String(e) });
            }
        })();
        return true; // Keep channel open for async response
    }

    // Clear all visual highlights
    if (message.action === 'CLEAR_HIGHLIGHTS') {
        visualHighlighter.cleanup();
        sendResponse({ success: true });
        return false;
    }

    if (message.action === 'GET_PAGE_TEXT') {
        try {
            const params = message.params || {};
            const maxLength = params.maxLength || 8000;
            const selector = params.selector || null;

            const textContent = extractPageText(selector, maxLength);
            sendResponse({
                success: true,
                data: textContent,
                url: window.location.href,
                title: document.title
            });
        } catch (e) {
            sendResponse({ success: false, error: String(e) });
        }
        return true;
    }

    if (message.action === 'EXECUTE_ACTION') {
        const { type, refId, text } = message.params || {};
        try {
            const result = executeAction(type, refId, text);
            sendResponse({ success: true, result });
        } catch (e) {
            sendResponse({ success: false, error: String(e) });
        }
        return true;
    }

    // Wait for an element matching criteria to appear
    if (message.action === 'WAIT_FOR_ELEMENT') {
        const params = message.params || {};
        const timeout = params.timeout || 10000;
        const interval = params.interval || 500;
        const role = params.role;
        const nameContains = params.name;

        const startTime = Date.now();

        const checkElement = () => {
            const compactTree = axTreeManager.captureCompactTree(document.body);

            // Search for matching element
            for (const item of compactTree) {
                const [refId, itemRole, itemName] = item;

                const roleMatch = !role || itemRole === role;
                const nameMatch = !nameContains || (itemName && itemName.includes(nameContains));

                if (roleMatch && nameMatch) {
                    sendResponse({
                        success: true,
                        found: true,
                        element: { refId, role: itemRole, name: itemName },
                        waitTime: Date.now() - startTime
                    });
                    return;
                }
            }

            // Check timeout
            if (Date.now() - startTime >= timeout) {
                sendResponse({
                    success: true,
                    found: false,
                    error: `Element not found within ${timeout}ms`,
                    waitTime: timeout
                });
                return;
            }

            // Retry
            setTimeout(checkElement, interval);
        };

        checkElement();
        return true; // Keep channel open for async response
    }

    // Wait for page to finish loading
    if (message.action === 'WAIT_FOR_PAGE_LOAD') {
        const params = message.params || {};
        const timeout = params.timeout || 30000;
        const extraDelay = params.extraDelay || 500; // Extra delay for dynamic content

        const startTime = Date.now();

        const checkLoad = () => {
            if (document.readyState === 'complete') {
                // Wait extra delay for dynamic content
                setTimeout(() => {
                    sendResponse({
                        success: true,
                        loaded: true,
                        readyState: document.readyState,
                        url: window.location.href,
                        title: document.title,
                        waitTime: Date.now() - startTime
                    });
                }, extraDelay);
                return;
            }

            if (Date.now() - startTime >= timeout) {
                sendResponse({
                    success: true,
                    loaded: false,
                    readyState: document.readyState,
                    error: `Page did not load within ${timeout}ms`,
                    waitTime: timeout
                });
                return;
            }

            setTimeout(checkLoad, 100);
        };

        checkLoad();
        return true;
    }

    return false;
});

/**
 * Extract readable text content from the page
 * Useful for reading email body, article content, etc.
 */
function extractPageText(selector: string | null, maxLength: number): { text: string; truncated: boolean } {
    let root: Element = document.body;

    if (selector) {
        const selected = document.querySelector(selector);
        if (selected) {
            root = selected;
        }
    }

    // Common content selectors for various sites
    const contentSelectors = [
        // Gmail email body
        '[role="main"] .a3s.aiL',
        '[role="main"] .ii.gt',
        // Generic article content
        'article',
        '[role="article"]',
        'main',
        '[role="main"]',
        '.content',
        '#content',
    ];

    // Try to find main content area
    let contentRoot = root;
    if (!selector) {
        for (const sel of contentSelectors) {
            const found = root.querySelector(sel);
            if (found && found.textContent && found.textContent.trim().length > 100) {
                contentRoot = found;
                break;
            }
        }
    }

    // Extract text, preserving some structure
    const textParts: string[] = [];

    function extractText(element: Element, depth: number = 0): void {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
            return;
        }

        const tag = element.tagName.toLowerCase();

        // Skip certain elements
        const skipTags = ['script', 'style', 'noscript', 'svg', 'img', 'video', 'audio', 'iframe'];
        if (skipTags.includes(tag)) {
            return;
        }

        // Block-level elements that should have line breaks
        const blockTags = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'section', 'article', 'header', 'footer', 'br', 'hr'];

        // Add heading markers
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            const text = element.textContent?.trim();
            if (text) {
                const level = parseInt(tag[1]);
                const prefix = '#'.repeat(level);
                textParts.push(`\n${prefix} ${text}\n`);
                return;
            }
        }

        // Process children
        let hasChildElements = false;
        for (const child of Array.from(element.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent?.trim();
                if (text) {
                    textParts.push(text);
                }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                hasChildElements = true;
                extractText(child as Element, depth + 1);
            }
        }

        // Add line break after block elements
        if (blockTags.includes(tag) && textParts.length > 0) {
            const lastPart = textParts[textParts.length - 1];
            if (lastPart && !lastPart.endsWith('\n')) {
                textParts.push('\n');
            }
        }
    }

    extractText(contentRoot);

    // Clean up the text
    let fullText = textParts
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const truncated = fullText.length > maxLength;
    if (truncated) {
        fullText = fullText.substring(0, maxLength) + '...';
    }

    return { text: fullText, truncated };
}

// Flatten AXTree by removing children nesting
function flattenTree(nodes: any[]): any[] {
    const result: any[] = [];
    function traverse(nodeList: any[]) {
        for (const node of nodeList) {
            const { children, ...flatNode } = node;
            result.push(flatNode);
            if (children) {
                traverse(children);
            }
        }
    }
    traverse(nodes);
    return result;
}

// Execute browser actions by refId
function executeAction(type: string, refId: number | null, text?: string): any {
    // Handle global actions that don't require a specific element
    if (type === 'keypress') {
        if (!text) {
            throw new Error('Key is required for keypress action');
        }
        return sendKeypress(text);
    }

    if (type === 'scroll_page') {
        const direction = text || 'down';
        if (direction === 'up') {
            window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
        } else if (direction === 'down') {
            window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
        } else if (direction === 'top') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (direction === 'bottom') {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
        return { scrolled: true, direction };
    }

    // Element-specific actions require refId
    if (refId === null || refId === undefined) {
        throw new Error(`refId is required for action type: ${type}`);
    }

    const element = axTreeManager.getElement(refId);
    if (!element) {
        throw new Error(`Element with refId ${refId} not found`);
    }

    const htmlElement = element as HTMLElement;

    switch (type) {
        case 'click':
            htmlElement.click();
            return { clicked: true, refId };

        case 'type':
            if (!text) {
                throw new Error('Text is required for type action');
            }
            if (htmlElement.tagName === 'INPUT' || htmlElement.tagName === 'TEXTAREA') {
                (htmlElement as HTMLInputElement).value = text;
                htmlElement.dispatchEvent(new Event('input', { bubbles: true }));
                htmlElement.dispatchEvent(new Event('change', { bubbles: true }));
                return { typed: true, refId, text };
            } else {
                throw new Error(`Element ${refId} is not an input or textarea`);
            }

        case 'focus':
            htmlElement.focus();
            return { focused: true, refId };

        case 'scroll':
            htmlElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return { scrolled: true, refId };

        case 'hover':
            htmlElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            htmlElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            return { hovered: true, refId };

        case 'clear':
            if (htmlElement.tagName === 'INPUT' || htmlElement.tagName === 'TEXTAREA') {
                (htmlElement as HTMLInputElement).value = '';
                htmlElement.dispatchEvent(new Event('input', { bubbles: true }));
                htmlElement.dispatchEvent(new Event('change', { bubbles: true }));
                return { cleared: true, refId };
            } else {
                throw new Error(`Element ${refId} is not an input or textarea`);
            }

        default:
            throw new Error(`Unknown action type: ${type}`);
    }
}

// Send keyboard events
function sendKeypress(key: string): any {
    const keyMap: Record<string, { key: string; code: string; keyCode: number }> = {
        'enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
        'escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
        'tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
        'backspace': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
        'delete': { key: 'Delete', code: 'Delete', keyCode: 46 },
        'arrowup': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
        'arrowdown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
        'arrowleft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
        'arrowright': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
        'space': { key: ' ', code: 'Space', keyCode: 32 },
        'home': { key: 'Home', code: 'Home', keyCode: 36 },
        'end': { key: 'End', code: 'End', keyCode: 35 },
        'pageup': { key: 'PageUp', code: 'PageUp', keyCode: 33 },
        'pagedown': { key: 'PageDown', code: 'PageDown', keyCode: 34 },
    };

    const keyLower = key.toLowerCase();
    const keyInfo = keyMap[keyLower] || { key: key, code: `Key${key.toUpperCase()}`, keyCode: key.charCodeAt(0) };

    const target = document.activeElement || document.body;

    const keydownEvent = new KeyboardEvent('keydown', {
        key: keyInfo.key,
        code: keyInfo.code,
        keyCode: keyInfo.keyCode,
        which: keyInfo.keyCode,
        bubbles: true,
        cancelable: true
    });

    const keypressEvent = new KeyboardEvent('keypress', {
        key: keyInfo.key,
        code: keyInfo.code,
        keyCode: keyInfo.keyCode,
        which: keyInfo.keyCode,
        bubbles: true,
        cancelable: true
    });

    const keyupEvent = new KeyboardEvent('keyup', {
        key: keyInfo.key,
        code: keyInfo.code,
        keyCode: keyInfo.keyCode,
        which: keyInfo.keyCode,
        bubbles: true,
        cancelable: true
    });

    target.dispatchEvent(keydownEvent);
    target.dispatchEvent(keypressEvent);
    target.dispatchEvent(keyupEvent);

    return { keypress: true, key: keyInfo.key, target: (target as HTMLElement).tagName };
}

// Expose functions for manual debugging in console
(window as any).getAXTree = () => {
    sidebar.refresh();
    const tree = axTreeManager.captureTree(document.body);
    console.log(JSON.stringify(tree, null, 2));
    return tree;
};

(window as any).getElement = (refId: number) => {
    return axTreeManager.getElement(refId);
};

(window as any).executeAction = executeAction;
