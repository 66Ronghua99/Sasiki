
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

// Smart scroll detection
let lastScrollHeight = 0;
let lastContentChildCount = 0;
let isScrollIntended = false;

// ============================================================================
// Unified Pending Actions Management
// ============================================================================

interface PendingActions {
    input: { timeout: number | null; target: HTMLElement | null };
    scroll: { timeout: number | null };
}

const pendingActions: PendingActions = {
    input: { timeout: null, target: null },
    scroll: { timeout: null }
};

/**
 * Force flush all pending actions (input and scroll)
 * Call this before critical events like click, navigate to ensure correct event order
 */
function flushAllPendingActions() {
    // Flush input
    if (pendingActions.input.timeout && pendingActions.input.target) {
        window.clearTimeout(pendingActions.input.timeout);
        recordInputAction(pendingActions.input.target);
        pendingActions.input = { timeout: null, target: null };
    }
    // Flush scroll - just clear the timeout, the scroll check will happen immediately
    if (pendingActions.scroll.timeout) {
        window.clearTimeout(pendingActions.scroll.timeout);
        checkForContentLoading();
        isScrollIntended = false;
        pendingActions.scroll.timeout = null;
    }
}

/**
 * Extracted input recording logic for reuse in debounce and flush
 * Supports both native input elements and contenteditable divs (e.g., Gemini, Notion)
 */
function recordInputAction(target: HTMLElement) {
    const refId = axTreeManager.getRefIdForElement(target);

    // Get value: native inputs use .value, contenteditable uses .textContent
    let value: string;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        value = (target as HTMLInputElement).value;
    } else if (target.isContentEditable) {
        value = target.textContent || '';
    } else {
        return; // Not an input element
    }

    if (refId) {
        const fingerprint = axTreeManager.getElementFingerprint(refId);
        recordAction({
            timestamp: Date.now(),
            type: 'type',
            targetHint: fingerprint!,
            value: value,
            pageContext: {
                url: window.location.href,
                title: document.title,
                tabId: recordingState.tabId
            }
        });
    } else {
        // Fallback: directly create fingerprint for input elements
        const isInputElement = tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
        if (isInputElement) {
            const fingerprint = axTreeManager.createFingerprintFromElement(target);
            recordAction({
                timestamp: Date.now(),
                type: 'type',
                targetHint: fingerprint,
                value: value,
                pageContext: {
                    url: window.location.href,
                    title: document.title,
                    tabId: recordingState.tabId
                }
            });
        }
    }
}

// Click tracking for navigation detection
interface RecentClickInfo {
    timestamp: number;
    fingerprint: ElementFingerprint;
}
let recentClick: RecentClickInfo | null = null;
const CLICK_NAVIGATION_THRESHOLD = 200; // ms - time window to consider a click as triggering navigation

// Pending navigation queue to ensure event order (click before navigate)
let pendingNavigate: RecordedAction | null = null;

const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'tab', 'option', 'checkbox', 'radio', 'switch', 'textbox', 'searchbox', 'combobox'
]);

interface ClickTargetResolution {
    targetHint: ElementFingerprint;
    rawTargetHint: ElementFingerprint;
    normalizedTargetHint: ElementFingerprint;
}

function isNativeInteractiveElement(element: Element): boolean {
    const tag = element.tagName.toLowerCase();
    if (tag === 'a' && element.hasAttribute('href')) return true;
    return tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'summary';
}

function getRoleAttr(element: Element): string | undefined {
    const role = element.getAttribute('role');
    return role || undefined;
}

function isInteractiveRole(role?: string): boolean {
    return !!(role && INTERACTIVE_ROLES.has(role));
}

function hasExplicitClickHandler(element: Element): boolean {
    const htmlElement = element as HTMLElement;
    return element.hasAttribute('onclick') ||
        element.hasAttribute('data-click') ||
        typeof htmlElement.onclick === 'function';
}

function hasFocusableTabIndex(element: Element): boolean {
    const tabindex = element.getAttribute('tabindex');
    return tabindex !== null && tabindex !== '-1';
}

function hasPointerCursor(element: Element): boolean {
    try {
        return window.getComputedStyle(element).cursor === 'pointer';
    } catch {
        return false;
    }
}

function hasSelfClickSignal(element: Element, role?: string): boolean {
    return isNativeInteractiveElement(element) ||
        isInteractiveRole(role) ||
        hasExplicitClickHandler(element) ||
        hasFocusableTabIndex(element);
}

function scoreClickCandidate(
    element: Element,
    depth: number,
    fingerprint: ElementFingerprint
): number {
    const role = getRoleAttr(element) || fingerprint.role;
    const tag = element.tagName.toLowerCase();
    const hasName = !!(fingerprint.name && fingerprint.name.trim());

    let score = 0;

    if (isNativeInteractiveElement(element)) score += 4;
    if (isInteractiveRole(role)) score += 3;
    if (hasExplicitClickHandler(element)) score += 3;
    if (hasFocusableTabIndex(element)) score += 2;
    if (hasPointerCursor(element)) score += 1;
    if (hasName) score += 1;
    if (element.getAttribute('aria-label') || element.getAttribute('title')) score += 1;
    if (tag === 'a' && element.hasAttribute('href')) score += 1;

    // Penalize leaf icon nodes unless they have explicit click signals themselves.
    if ((tag === 'svg' || tag === 'path' || tag === 'g' || tag === 'use') && !hasSelfClickSignal(element, role)) {
        score -= 3;
    }

    // Prefer nearby targets if scores are similar.
    score -= depth * 0.5;
    return score;
}

function resolveClickTarget(target: Element): ClickTargetResolution {
    const maxDepth = 6;
    const candidates: Array<{
        element: Element;
        depth: number;
        fingerprint: ElementFingerprint;
        score: number;
    }> = [];

    let current: Element | null = target;
    let depth = 0;
    while (current && depth <= maxDepth) {
        const fingerprint = axTreeManager.createFingerprintFromElement(current);
        const score = scoreClickCandidate(current, depth, fingerprint);
        candidates.push({ element: current, depth, fingerprint, score });
        current = current.parentElement;
        depth++;
    }

    const raw = candidates[0];
    let best = raw;
    for (const candidate of candidates) {
        if (candidate.score > best.score + 0.2) {
            best = candidate;
            continue;
        }
        if (Math.abs(candidate.score - best.score) <= 0.2 && candidate.depth < best.depth) {
            best = candidate;
        }
    }

    const normalized = best.fingerprint;

    return {
        targetHint: normalized,
        rawTargetHint: raw.fingerprint,
        normalizedTargetHint: normalized,
    };
}

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
        // Force flush any pending input/scroll actions to ensure correct event order
        // This ensures input -> click -> navigate sequence is preserved
        flushAllPendingActions();

        const target = e.target;
        if (!(target instanceof Element)) return;

        // Keep raw click target while also providing a normalized actionable target.
        const clickTarget = resolveClickTarget(target);

        // Track this click for navigation correlation
        recentClick = {
            timestamp: Date.now(),
            fingerprint: clickTarget.targetHint
        };

        // Delay the click recording to check if it triggers navigation
        setTimeout(() => {
            const currentUrl = window.location.href;
            const navigationOccurred = !!(recentClick &&
                (Date.now() - recentClick.timestamp < CLICK_NAVIGATION_THRESHOLD));

            recordAction({
                timestamp: recentClick?.timestamp || Date.now(),
                type: 'click',
                targetHint: clickTarget.targetHint,
                rawTargetHint: clickTarget.rawTargetHint,
                normalizedTargetHint: clickTarget.normalizedTargetHint,
                triggersNavigation: navigationOccurred,
                pageContext: {
                    url: currentUrl,
                    title: document.title,
                    tabId: recordingState.tabId
                }
            });

            // Flush any pending navigation to ensure click comes before navigate
            flushPendingNavigate();

            // Clear recent click after processing
            if (!navigationOccurred) {
                recentClick = null;
            }
        }, CLICK_NAVIGATION_THRESHOLD + 50);
    };
    document.addEventListener('click', clickListener, true); // use capture phase

    // Input recording (debounced)
    // Supports both native input elements and contenteditable divs
    inputListener = (e: Event) => {
        const target = e.target as HTMLElement;

        // Check if element is editable (native input or contenteditable)
        const tag = target.tagName.toLowerCase();
        const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;

        if (!isEditable) return;

        // Clear old pending timeout
        if (pendingActions.input.timeout) {
            window.clearTimeout(pendingActions.input.timeout);
        }

        // Set new pending action with 2000ms debounce
        // This reduces intermediate state recording for normal typing
        pendingActions.input.target = target;
        pendingActions.input.timeout = window.setTimeout(() => {
            recordInputAction(target);
            pendingActions.input = { timeout: null, target: null };
        }, 2000); // 2000ms debounce - records only when user pauses typing
    };
    document.addEventListener('input', inputListener, true);

    // Additional listener for contenteditable elements that may not trigger 'input' reliably
    document.addEventListener('keyup', inputListener, true);

    // Force flush trigger: blur event (user leaves input field)
    document.addEventListener('blur', (e) => {
        const target = e.target as HTMLElement;
        if (target === pendingActions.input.target) {
            flushAllPendingActions();
        }
    }, true);

    // Force flush trigger: Enter key (form submission)
    document.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && pendingActions.input.target) {
            flushAllPendingActions();
        }
    }, true);

    // Smart scroll detection - only record when scroll triggers content loading
    attachSmartScrollDetection();
}

/**
 * Smart scroll detection: only records scroll events that trigger meaningful content changes
 * Useful for infinite scroll pages (e.g., 小红书/Xiaohongshu, Twitter)
 */
function attachSmartScrollDetection() {
    // Initialize baseline measurements
    lastScrollHeight = document.body.scrollHeight;
    lastContentChildCount = getMainContentChildCount();

    // Listen for scroll intent (wheel for desktop, touchmove for mobile)
    const handleScrollIntent = () => {
        if (!recordingState.isRecording) return;

        isScrollIntended = true;

        // Clear previous pending scroll timeout
        if (pendingActions.scroll.timeout) {
            window.clearTimeout(pendingActions.scroll.timeout);
        }

        // Wait for scroll to settle (500ms debounce)
        pendingActions.scroll.timeout = window.setTimeout(() => {
            checkForContentLoading();
            isScrollIntended = false;
            pendingActions.scroll.timeout = null;
        }, 500);
    };

    document.addEventListener('wheel', handleScrollIntent, { passive: true, capture: true });
    document.addEventListener('touchmove', handleScrollIntent, { passive: true, capture: true });

    // Also listen for scroll events that might be triggered by other means
    // but use a much longer debounce and only record if content changed
    let scrollCheckTimeout: number | null = null;
    document.addEventListener('scroll', () => {
        if (!recordingState.isRecording) return;

        if (scrollCheckTimeout) return;

        scrollCheckTimeout = window.setTimeout(() => {
            scrollCheckTimeout = null;
            // Only check if we haven't already captured via wheel/touchmove
            if (!isScrollIntended) {
                checkForContentLoading();
            }
        }, 1000); // Longer debounce for generic scrolls
    }, true);

    // Store references for cleanup (we'll use a different approach)
    (window as any).__sasikiScrollHandlers = {
        wheel: handleScrollIntent,
        touchmove: handleScrollIntent
    };
}

/**
 * Get the main content area's child count for detecting content additions
 */
function getMainContentChildCount(): number {
    // Try to find main content area
    const contentSelectors = [
        'main',
        '[role="main"]',
        '#content',
        '.content',
        'article',
        '[role="feed"]',
        '.feed',
        '.list',
        '[role="list"]'
    ];

    for (const selector of contentSelectors) {
        const el = document.querySelector(selector);
        if (el && el.children.length > 0) {
            return el.children.length;
        }
    }

    // Fallback: use body
    return document.body.children.length;
}

/**
 * Check if scroll triggered meaningful content loading
 */
function checkForContentLoading() {
    const currentScrollHeight = document.body.scrollHeight;
    const currentChildCount = getMainContentChildCount();

    // Detect significant changes
    const heightIncreased = currentScrollHeight > lastScrollHeight + 100; // 100px threshold
    const contentAdded = currentChildCount > lastContentChildCount;

    if (heightIncreased || contentAdded) {
        // Determine the type of loading
        let triggerType: 'infinite_scroll' | 'lazy_load' = 'lazy_load';
        let contentHint = '';

        if (contentAdded && currentChildCount > lastContentChildCount + 2) {
            triggerType = 'infinite_scroll';
            contentHint = `Added ${currentChildCount - lastContentChildCount} items`;
        } else if (heightIncreased) {
            triggerType = 'lazy_load';
            contentHint = `Height increased by ${currentScrollHeight - lastScrollHeight}px`;
        }

        // Record the scroll_load event
        recordAction({
            timestamp: Date.now(),
            type: 'scroll_load',
            trigger: triggerType,
            loadedContentHint: contentHint,
            pageContext: {
                url: window.location.href,
                title: document.title,
                tabId: recordingState.tabId
            }
        });

        console.log('[Sasiki] Smart scroll detected:', triggerType, contentHint);

        // Update baselines for next detection
        lastScrollHeight = currentScrollHeight;
        lastContentChildCount = currentChildCount;
    }
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

    // Clear all pending actions
    if (pendingActions.input.timeout) {
        window.clearTimeout(pendingActions.input.timeout);
    }
    pendingActions.input = { timeout: null, target: null };

    if (pendingActions.scroll.timeout) {
        window.clearTimeout(pendingActions.scroll.timeout);
    }
    pendingActions.scroll = { timeout: null };

    // Clean up smart scroll detection
    const handlers = (window as any).__sasikiScrollHandlers;
    if (handlers) {
        document.removeEventListener('wheel', handlers.wheel, { capture: true });
        document.removeEventListener('touchmove', handlers.touchmove, { capture: true });
        delete (window as any).__sasikiScrollHandlers;
    }

    isScrollIntended = false;
}

interface RecordedAction {
    timestamp: number;
    type: string;
    targetHint?: ElementFingerprint;
    rawTargetHint?: ElementFingerprint;
    normalizedTargetHint?: ElementFingerprint;
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
    // Smart scroll fields
    trigger?: 'infinite_scroll' | 'lazy_load';
    loadedContentHint?: string;
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

// Flush pending navigation after click is recorded (ensures click comes before navigate)
function flushPendingNavigate() {
    if (pendingNavigate) {
        recordAction(pendingNavigate);
        pendingNavigate = null;
    }
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

        const navigateAction: RecordedAction = {
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
        };

        if (isClickTriggered) {
            // Queue the navigation - it will be recorded after the click
            pendingNavigate = navigateAction;
        } else {
            // Non-click navigation - record immediately
            recordAction(navigateAction);
        }

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
