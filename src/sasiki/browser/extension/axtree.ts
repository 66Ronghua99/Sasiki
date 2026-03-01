
import { computeAccessibleName, getRole } from 'dom-accessibility-api';

export interface AXNode {
    refId?: number;              // Only interactive elements have refId
    role: string;
    name?: string;               // Semantic label (from accessible name or ancestor context)
    tagName?: string;            // Only for interactive elements
    attributes?: Record<string, string>;
    value?: string | null;
    children?: AXNode[];
}

/**
 * Element fingerprint for resilient element identification during replay.
 * Captures semantic and contextual information about an element.
 */
export interface ElementFingerprint {
    role: string;
    name: string;
    tagName: string;
    placeholder?: string;
    // Context for disambiguation
    parentRole?: string;
    siblingTexts: string[];
    // Additional identifying attributes for better recognition
    testId?: string;
    elementId?: string;
    classNames?: string[];
    className?: string;
}

// Compact node format: [refId, role, name, value?]
export type CompactAXNode = [number, string, string, string?];

// Extended format with bounds: [refId, role, name, value?, bounds?]
// bounds: [x, y, width, height] - useful for LLM to understand element positions
export type CompactAXNodeWithBounds = [number, string, string, string?, number[]?];

// Configuration for token optimization
const MAX_NAME_LENGTH = 80;  // Truncate long names to save tokens

/**
 * Truncate name to save tokens while preserving meaning
 */
function truncateName(name: string | undefined): string | undefined {
    if (!name) return undefined;
    if (name.length <= MAX_NAME_LENGTH) return name;
    return name.substring(0, MAX_NAME_LENGTH - 3) + '...';
}

// Technical data-* attributes to ignore
const TECHNICAL_DATA_ATTRS = [
    'data-v-', 'data-reactroot', 'data-reactid', 'data-testid',
    'data-cy', 'data-index', 'data-key', 'data-id', 'data-node-key'
];

// Keywords that suggest a data-* attribute contains semantic label
const SEMANTIC_DATA_KEYWORDS = /label|name|title|desc|text|field|heading|caption/i;

/**
 * Extract semantic label from data-* attributes
 */
function extractDataLabel(element: Element): string | null {
    for (const attr of Array.from(element.attributes)) {
        if (!attr.name.startsWith('data-')) continue;
        // Skip technical attributes
        if (TECHNICAL_DATA_ATTRS.some(tech => attr.name.startsWith(tech))) continue;
        // Check if attribute name suggests semantic value
        if (SEMANTIC_DATA_KEYWORDS.test(attr.name) && attr.value.trim()) {
            return attr.value.trim();
        }
    }
    return null;
}

/**
 * Get text from aria-labelledby referenced elements
 */
function getAriaLabelledByText(element: Element): string | null {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (!labelledBy) return null;

    const ids = labelledBy.split(/\s+/);
    const texts: string[] = [];
    for (const id of ids) {
        const labelEl = document.getElementById(id);
        if (labelEl) {
            const text = labelEl.textContent?.trim();
            if (text) texts.push(text);
        }
    }
    return texts.length > 0 ? texts.join(' ') : null;
}

/**
 * Get heading text from within a container element
 */
function getHeadingText(element: Element): string | null {
    const heading = element.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) {
        const text = heading.textContent?.trim();
        if (text && text.length < 100) return text;
    }
    return null;
}

/**
 * Get legend text from fieldset
 */
function getLegendText(element: Element): string | null {
    if (element.tagName.toLowerCase() === 'fieldset') {
        const legend = element.querySelector('legend');
        if (legend) {
            const text = legend.textContent?.trim();
            if (text) return text;
        }
    }
    return null;
}

/**
 * Comprehensive semantic label extraction with priority
 */
function getSemanticLabel(element: Element): string | null {
    return (
        element.getAttribute('aria-label') ||
        getAriaLabelledByText(element) ||
        extractDataLabel(element) ||
        getLegendText(element) ||
        getHeadingText(element) ||
        null
    );
}

export class AXTreeManager {
    private elementMap: Map<number, Element> = new Map();
    private elementToRefId: WeakMap<Element, number> = new WeakMap();
    private counter: number = 0;



    /**
     * Build a semantic tree that preserves ancestor context for interactive elements
     */
    public captureTree(root: Element): AXNode | null {
        this.elementMap.clear();
        this.counter = 0;
        const children = this.buildSemanticTree(root);
        if (children.length === 0) return null;
        if (children.length === 1) return children[0];
        return {
            role: 'tree',
            children: children
        };
    }

    private buildSemanticTree(element: Element): AXNode[] {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || element.getAttribute('aria-hidden') === 'true') {
            return [];
        }

        const tag = element.tagName.toLowerCase();

        // Skip SVG internals
        const svgSkip = ['path', 'g', 'defs', 'clippath', 'lineargradient', 'radialgradient', 'stop', 'mask', 'use', 'symbol', 'circle', 'rect', 'ellipse', 'line', 'polygon', 'polyline', 'text', 'tspan', 'style'];
        if (svgSkip.includes(tag)) {
            return [];
        }

        const role = getRole(element);

        // Recursively get children first
        let children: AXNode[] = [];
        for (const child of Array.from(element.children)) {
            children.push(...this.buildSemanticTree(child));
        }

        // Interactive roles
        const interactiveRoles = [
            'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
            'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch',
            'slider', 'spinbutton', 'searchbox', 'scrollbar', 'progressbar'
        ];

        const isInteractive = role && interactiveRoles.includes(role);
        const hasTabindex = element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1';
        const isClickable = element.hasAttribute('onclick') || element.hasAttribute('data-click') ||
            (element as HTMLElement).onclick !== null;

        // Native interactive elements (regardless of ARIA role)
        const isNativeLink = tag === 'a' && element.hasAttribute('href');
        const isNativeButton = tag === 'button';
        const isNativeInput = tag === 'input' || tag === 'textarea' || tag === 'select';
        const isNativeInteractive = isNativeLink || isNativeButton || isNativeInput;

        const isInteractiveElement = isInteractive || hasTabindex || isClickable || isNativeInteractive;

        // Check if this element has semantic label
        const semanticLabel = getSemanticLabel(element);

        // If interactive element, create a node with refId
        if (isInteractiveElement) {
            let name = computeAccessibleName(element);
            if (!name) {
                name = this.getFallbackName(element);
            }

            this.counter++;
            const refId = this.counter;
            this.elementMap.set(refId, element);
            this.elementToRefId.set(element, refId);  // Set reverse lookup

            // Determine effective role
            let effectiveRole = role;
            if (!effectiveRole) {
                if (isNativeLink) effectiveRole = 'link';
                else if (isNativeButton) effectiveRole = 'button';
                else if (isNativeInput) effectiveRole = 'textbox';
                else effectiveRole = 'generic';
            }

            const node: AXNode = {
                refId: refId,
                role: effectiveRole,
                name: truncateName(name),  // Apply truncation to save tokens
                tagName: tag,
                attributes: this.getCompactAttributes(element),  // Use compact attributes
                value: (element as HTMLInputElement).value || undefined,
            };

            // Include children if they exist (nested interactive elements)
            if (children.length > 0) {
                node.children = children;
            }

            return [node];
        }

        // If has semantic label and has interactive descendants, keep as container
        if (semanticLabel && children.length > 0) {
            return [{
                role: role || 'group',
                name: truncateName(semanticLabel),  // Apply truncation
                children: children
            }];
        }

        // Otherwise, hoist children up (skip this node)
        return children;
    }

    public getElement(refId: number): Element | undefined {
        return this.elementMap.get(refId);
    }

    /**
     * Get refId for a given element (reverse lookup).
     * Also checks ancestors in case the click target was a child element.
     */
    public getRefIdForElement(element: Element): number | undefined {
        // Check element itself
        if (this.elementToRefId.has(element)) {
            return this.elementToRefId.get(element);
        }
        // Check ancestors (for clicks on child elements)
        let current: Element | null = element;
        while (current) {
            if (this.elementToRefId.has(current)) {
                return this.elementToRefId.get(current);
            }
            current = current.parentElement;
        }
        return undefined;
    }

    /**
     * Extract element fingerprint for resilient element identification.
     * This is used for recording actions and replay matching.
     */
    public getElementFingerprint(refId: number): ElementFingerprint | null {
        const element = this.elementMap.get(refId);
        if (!element) return null;
        return this.createFingerprintFromElement(element);
    }

    /**
     * Create fingerprint directly from an element (without requiring refId).
     * Useful for recording clicks on elements not yet in the AX tree.
     * Enhanced version with better name extraction and context capture.
     */
    public createFingerprintFromElement(element: Element): ElementFingerprint {
        // Determine effective role
        let role = getRole(element);
        if (!role) {
            const tag = element.tagName.toLowerCase();
            if (tag === 'a' && element.hasAttribute('href')) role = 'link';
            else if (tag === 'button') role = 'button';
            else if (tag === 'input' || tag === 'textarea' || tag === 'select') role = 'textbox';
            else if (tag === 'img' || tag === 'svg') role = 'img';
            else role = 'generic';
        }

        // Get enhanced name with multiple fallback strategies
        let name = this.getEnhancedName(element);

        // Get parent context (traverse up to find semantic role)
        const parentRole = this.getNearestParentRole(element);

        // Get sibling texts with expanded search
        const siblings = this.getSiblingContext(element);

        // Get additional identifying attributes
        const attrs = this.getIdentifyingAttributes(element);

        return {
            role,
            name: name || '',
            tagName: element.tagName.toLowerCase(),
            placeholder: element.getAttribute('placeholder') || undefined,
            parentRole,
            siblingTexts: siblings,
            ...attrs
        };
    }

    /**
     * Enhanced name extraction with multiple fallback strategies for modern web apps.
     * Handles divs/spans used as buttons, SVG icons, and other non-semantic elements.
     */
    private getEnhancedName(element: Element): string {
        // 1. Try standard accessible name first
        let name = computeAccessibleName(element);
        if (name && name.trim()) return name.trim();

        // 2. Try existing fallback method
        name = this.getFallbackName(element);
        if (name && name.trim()) return name.trim();

        const tag = element.tagName.toLowerCase();

        // 3. For images and SVGs, check alt or title
        if (tag === 'img') {
            const alt = element.getAttribute('alt');
            if (alt) return alt;
        }

        if (tag === 'svg') {
            // Check for title element inside SVG
            const title = element.querySelector('title');
            if (title?.textContent) return title.textContent.trim();
            // Check aria-label on SVG
            const ariaLabel = element.getAttribute('aria-label');
            if (ariaLabel) return ariaLabel;
        }

        // 4. Check for image children with alt text (common for icon buttons)
        const imgChild = element.querySelector('img[alt]');
        if (imgChild) {
            const alt = imgChild.getAttribute('alt');
            if (alt) return alt;
        }

        // 5. Check for SVG children
        const svgChild = element.querySelector('svg');
        if (svgChild) {
            const title = svgChild.querySelector('title');
            if (title?.textContent) return title.textContent.trim();
        }

        // 6. Extract from CSS class names (e.g., "btn-submit", "icon-search")
        const classHint = this.extractNameFromClasses(element);
        if (classHint) return classHint;

        // 7. For links, extract meaningful text from href
        if (tag === 'a') {
            const href = element.getAttribute('href');
            if (href && href !== '#' && !href.startsWith('javascript:')) {
                // Extract last path segment as hint
                const segments = href.split('/').filter(s => s);
                if (segments.length > 0) {
                    const lastSegment = segments[segments.length - 1];
                    // Remove query params and hash
                    const clean = lastSegment.split('?')[0].split('#')[0];
                    if (clean && clean.length < 30) return clean;
                }
            }
        }

        // 8. Get truncated text content for generic elements
        if (tag === 'div' || tag === 'span') {
            const text = element.textContent?.trim();
            if (text && text.length > 0) {
                // Limit length but provide some context
                if (text.length <= 30) return text;
                return text.substring(0, 27) + '...';
            }
        }

        return '';
    }

    /**
     * Extract potential name hints from CSS class names.
     * E.g., "btn-submit" -> "submit", "icon-search" -> "search"
     */
    private extractNameFromClasses(element: Element): string | null {
        const className = element.className;
        if (!className || typeof className !== 'string') return null;

        const classes = className.toLowerCase();
        
        // Common patterns that indicate purpose
        const patterns = [
            { regex: /btn-([a-z-]+)/, prefix: '' },
            { regex: /button-([a-z-]+)/, prefix: '' },
            { regex: /icon-([a-z-]+)/, prefix: '' },
            { regex: /nav-([a-z-]+)/, prefix: '' },
            { regex: /tab-([a-z-]+)/, prefix: '' },
            { regex: /menu-([a-z-]+)/, prefix: '' },
            { regex: /action-([a-z-]+)/, prefix: '' },
        ];

        for (const pattern of patterns) {
            const match = classes.match(pattern.regex);
            if (match) {
                return match[1].replace(/-/g, ' ');
            }
        }

        return null;
    }

    /**
     * Get the nearest parent element with a semantic role.
     * Traverses up the DOM tree to find context.
     */
    private getNearestParentRole(element: Element): string | undefined {
        let current = element.parentElement;
        let depth = 0;
        const maxDepth = 5;

        while (current && depth < maxDepth) {
            const role = getRole(current);
            if (role) return role;

            // Check for semantic HTML tags
            const tag = current.tagName.toLowerCase();
            if (['nav', 'header', 'footer', 'main', 'aside', 'form'].includes(tag)) {
                return tag;
            }
            if (tag === 'button') return 'button';
            if (tag === 'a') return 'link';

            current = current.parentElement;
            depth++;
        }

        return undefined;
    }

    /**
     * Get sibling context with expanded search scope.
     * Includes siblings from parent containers and nearby text.
     */
    private getSiblingContext(element: Element): string[] {
        const siblings: string[] = [];
        const seen = new Set<string>();

        // Helper to add unique text
        const addText = (text: string) => {
            const trimmed = text.trim();
            if (trimmed && trimmed.length < 50 && trimmed.length > 0 && !seen.has(trimmed)) {
                seen.add(trimmed);
                siblings.push(trimmed);
            }
        };

        // 1. Check direct siblings
        const parent = element.parentElement;
        if (parent) {
            for (const sibling of Array.from(parent.children)) {
                if (sibling === element) continue;
                const text = sibling.textContent?.trim();
                if (text) addText(text);
                if (siblings.length >= 3) return siblings;
            }
        }

        // 2. Check grandparent level (useful for grid layouts)
        const grandparent = parent?.parentElement;
        if (grandparent) {
            for (const sibling of Array.from(grandparent.children)) {
                if (sibling === parent) continue;
                const text = sibling.textContent?.trim();
                if (text) addText(text);
                if (siblings.length >= 3) return siblings;
            }
        }

        // 3. Check for preceding siblings with labels
        let prev = element.previousElementSibling;
        let count = 0;
        while (prev && count < 3) {
            const text = prev.textContent?.trim();
            if (text) addText(text);
            prev = prev.previousElementSibling;
            count++;
        }

        return siblings;
    }

    /**
     * Get additional identifying attributes for better element recognition.
     */
    private getIdentifyingAttributes(element: Element): {
        testId?: string;
        elementId?: string;
        classNames?: string[];
        className?: string;
    } {
        const attrs: {
            testId?: string;
            elementId?: string;
            classNames?: string[];
            className?: string;
        } = {};

        // Check for test ids (common in React, Vue apps)
        const testId = element.getAttribute('data-testid') ||
                      element.getAttribute('data-test-id') ||
                      element.getAttribute('data-cy') ||
                      element.getAttribute('data-qa');
        if (testId) attrs.testId = testId;

        // Include element id if it's meaningful (not auto-generated)
        const id = element.getAttribute('id');
        if (id && !id.match(/^\d+$/) && !id.includes('react') && !id.includes('vue')) {
            attrs.elementId = id;
        }

        // Include key class names (filter out framework classes)
        const className = element.className;
        if (className && typeof className === 'string') {
            const classes = className.split(/\s+/)
                .filter(c => c.length > 2)
                .filter(c => !c.startsWith('css-'))
                .filter(c => !c.startsWith('style_'))
                .filter(c => !c.match(/^[_-]/))
                .slice(0, 3);
            if (classes.length > 0) {
                attrs.classNames = classes;
                attrs.className = classes[0];
            }
        }

        return attrs;
    }

    /**
     * Capture a compact flat list of interactive elements
     * Format: [[refId, role, name, value?], ...]
     * Much smaller than full tree - saves ~85% tokens
     */
    public captureCompactTree(root: Element): CompactAXNode[] {
        return this.captureCompactTreeWithMap(root).tree;
    }

    /**
     * Capture compact tree and return both tree and element map
     * Single call ensures tree and elementMap are consistent
     * Avoids elementMap being cleared between separate capture calls
     */
    public captureCompactTreeWithMap(root: Element): {
        tree: CompactAXNode[];
        elementMap: Map<number, Element>;
    } {
        this.elementMap.clear();
        this.counter = 0;

        const result: CompactAXNode[] = [];
        this.collectInteractiveElements(root, result);

        // Return tree and a copy of elementMap to ensure consistency
        return {
            tree: result,
            elementMap: new Map(this.elementMap)
        };
    }

    /**
     * Capture compact tree with element bounds for coordinate-aware LLM interactions.
     * Returns both the compact tree, bounds map, and element map for highlighting.
     * This allows LLM to understand element positions without needing a screenshot.
     */
    public captureCompactTreeWithBounds(root: Element): {
        tree: CompactAXNode[];
        boundsMap: Record<number, { x: number; y: number; width: number; height: number }>;
        elementMap: Map<number, Element>;
    } {
        // First get the tree with element map
        const { tree, elementMap } = this.captureCompactTreeWithMap(root);

        // Calculate bounds for each element
        const boundsMap: Record<number, { x: number; y: number; width: number; height: number }> = {};

        elementMap.forEach((element, refId) => {
            const rect = element.getBoundingClientRect();
            // Only include visible elements
            if (rect.width > 0 && rect.height > 0) {
                boundsMap[refId] = {
                    x: Math.round(rect.left),
                    y: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                };
            }
        });

        return { tree, boundsMap, elementMap };
    }

    private collectInteractiveElements(element: Element, result: CompactAXNode[]): void {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || element.getAttribute('aria-hidden') === 'true') {
            return;
        }

        const tag = element.tagName.toLowerCase();

        // Skip SVG internals
        const svgSkip = ['path', 'g', 'defs', 'clippath', 'lineargradient', 'radialgradient', 'stop', 'mask', 'use', 'symbol', 'circle', 'rect', 'ellipse', 'line', 'polygon', 'polyline', 'text', 'tspan', 'style'];
        if (svgSkip.includes(tag)) {
            return;
        }

        const role = getRole(element);

        // Interactive roles
        const interactiveRoles = [
            'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
            'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch',
            'slider', 'spinbutton', 'searchbox', 'scrollbar', 'progressbar'
        ];

        const isInteractive = role && interactiveRoles.includes(role);
        const hasTabindex = element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1';
        const isClickable = element.hasAttribute('onclick') || element.hasAttribute('data-click') ||
            (element as HTMLElement).onclick !== null;

        // Native interactive elements (regardless of ARIA role)
        const isNativeLink = tag === 'a' && element.hasAttribute('href');
        const isNativeButton = tag === 'button';
        const isNativeInput = tag === 'input' || tag === 'textarea' || tag === 'select';
        const isNativeInteractive = isNativeLink || isNativeButton || isNativeInput;

        if (isInteractive || hasTabindex || isClickable || isNativeInteractive) {
            let name = computeAccessibleName(element);
            if (!name) {
                name = this.getFallbackName(element);
            }

            this.counter++;
            const refId = this.counter;
            this.elementMap.set(refId, element);
            this.elementToRefId.set(element, refId);  // Set reverse lookup

            const value = (element as HTMLInputElement).value;
            const truncatedName = truncateName(name) || '';

            // Determine effective role
            let effectiveRole = role;
            if (!effectiveRole) {
                if (isNativeLink) effectiveRole = 'link';
                else if (isNativeButton) effectiveRole = 'button';
                else if (isNativeInput) effectiveRole = 'textbox';
                else effectiveRole = 'generic';
            }

            if (value) {
                result.push([refId, effectiveRole, truncatedName, value]);
            } else {
                result.push([refId, effectiveRole, truncatedName]);
            }
        }

        // Recurse into children
        for (const child of Array.from(element.children)) {
            this.collectInteractiveElements(child, result);
        }
    }

    /**
     * Get only essential attributes to reduce token usage
     */
    private getCompactAttributes(element: Element): Record<string, string> | undefined {
        const attrs: Record<string, string> = {};

        // Only include attributes that help with interaction, skip redundant ones
        const importantAttrs = ['aria-expanded', 'aria-checked', 'aria-selected', 'aria-disabled', 'disabled', 'type', 'placeholder'];

        for (const attrName of importantAttrs) {
            const value = element.getAttribute(attrName);
            if (value !== null) {
                attrs[attrName] = value;
            }
        }

        return Object.keys(attrs).length > 0 ? attrs : undefined;
    }

    /**
     * Fallback strategies to extract a meaningful name when computeAccessibleName fails.
     */
    private getFallbackName(element: Element): string {
        const tag = element.tagName.toLowerCase();

        // 0. Check for data-* attributes that contain label info (common in form frameworks)
        const dataAttrs = ['data-form-field-i18n-name', 'data-label', 'data-field-label', 'data-name'];
        for (const attr of dataAttrs) {
            // Check on element itself
            let value = element.getAttribute(attr);
            if (value) return value;

            // Check on parent/ancestor elements
            const ancestor = element.closest(`[${attr}]`);
            if (ancestor) {
                value = ancestor.getAttribute(attr);
                if (value) return value;
            }
        }

        // 0.5 Look for label in ancestor containers with label-like class names
        const labelClasses = ['label', 'form-label', 'formily-item-label', 'field-label', 'input-label', 'ant-form-item-label'];
        let current: Element | null = element.parentElement;
        let depth = 0;
        while (current && depth < 5) {
            // Check sibling elements with label-like classes
            for (const sibling of Array.from(current.children)) {
                if (sibling === element || sibling.contains(element)) continue;
                const sibClasses = sibling.className?.toString()?.toLowerCase() || '';
                const hasLabelClass = labelClasses.some(cls => sibClasses.includes(cls));
                if (hasLabelClass || sibling.tagName === 'LABEL') {
                    const text = sibling.textContent?.trim();
                    if (text && text.length < 100) {
                        return text.replace(/[*:：\s]+$/, '').trim();
                    }
                }
            }
            current = current.parentElement;
            depth++;
        }

        // 1. Check for placeholder attribute (common for inputs)
        const placeholder = element.getAttribute('placeholder');
        if (placeholder) {
            return placeholder;
        }

        // 2. Check for title attribute
        const title = element.getAttribute('title');
        if (title) {
            return title;
        }

        // 3. For inputs, try to find associated label
        if (tag === 'input' || tag === 'select' || tag === 'textarea') {
            const id = element.getAttribute('id');
            if (id) {
                const label = document.querySelector(`label[for="${id}"]`);
                if (label) {
                    return label.textContent?.trim() || '';
                }
            }

            // Check if wrapped in a label
            const parentLabel = element.closest('label');
            if (parentLabel) {
                // Get text content excluding the input itself
                const clone = parentLabel.cloneNode(true) as HTMLElement;
                clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
                const labelText = clone.textContent?.trim();
                if (labelText) {
                    return labelText;
                }
            }

            // Look for preceding sibling or nearby text that might be label
            const prevSibling = element.previousElementSibling;
            if (prevSibling && (prevSibling.tagName === 'LABEL' || prevSibling.tagName === 'SPAN' || prevSibling.tagName === 'DIV')) {
                const text = prevSibling.textContent?.trim();
                if (text && text.length < 50) {
                    return text.replace(/[*:：]$/, '').trim(); // Remove trailing * or :
                }
            }

            // Check parent container for label-like text
            const parent = element.parentElement;
            if (parent) {
                // Look for label-like siblings in parent
                for (const sibling of Array.from(parent.children)) {
                    if (sibling === element) continue;
                    const siblingTag = sibling.tagName.toLowerCase();
                    if (['label', 'span', 'div', 'p'].includes(siblingTag)) {
                        const text = sibling.textContent?.trim();
                        if (text && text.length < 50 && !text.includes('\n')) {
                            return text.replace(/[*:：]$/, '').trim();
                        }
                    }
                }
            }
        }

        // 4. For buttons without name, check for icon description or inner text
        if (tag === 'button' || element.getAttribute('role') === 'button') {
            // Check for aria-label on child icons
            const icon = element.querySelector('[aria-label], [title]');
            if (icon) {
                return icon.getAttribute('aria-label') || icon.getAttribute('title') || '';
            }

            // Get visible text
            const text = element.textContent?.trim();
            if (text && text.length < 100) {
                return text;
            }
        }

        // 5. For links, get href as last resort context
        if (tag === 'a') {
            const href = element.getAttribute('href');
            const text = element.textContent?.trim();
            if (text) return text;
            if (href && !href.startsWith('javascript:')) {
                // Extract filename or last path segment
                try {
                    const url = new URL(href, window.location.href);
                    const path = url.pathname.split('/').filter(s => s).pop();
                    if (path) return path;
                } catch {
                    // Ignore URL parse errors
                }
            }
        }

        return '';
    }

    private getAttributes(element: Element): Record<string, string> {
        const attrs: Record<string, string> = {};
        const allowList = ['type', 'placeholder', 'alt', 'title', 'aria-label', 'aria-checked', 'aria-expanded', 'aria-selected', 'disabled', 'readonly', 'name', 'id'];

        for (const name of allowList) {
            const val = element.getAttribute(name);
            if (val !== null) {
                attrs[name] = val;
            }
        }
        return attrs;
    }
}
