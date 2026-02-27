
/**
 * Visual Highlighter - Adds highlight overlays for interactive elements
 *
 * Creates cornflower blue borders with refId labels for screenshot visualization.
 * Used by multimodal LLMs to understand element positions.
 */

export class VisualHighlighter {
    private highlights: HTMLElement[] = [];
    private container: HTMLElement | null = null;

    /**
     * Highlight all elements in the provided elementMap
     * @param elementMap Map of refId to Element from AXTreeManager
     * @returns Number of elements highlighted
     */
    highlightElements(elementMap: Map<number, Element>): number {
        this.cleanup();

        // Check if document.body is available
        if (!document.body) {
            console.warn('[VisualHighlighter] document.body not available');
            return 0;
        }

        // Check if elementMap is empty
        if (!elementMap || elementMap.size === 0) {
            console.warn('[VisualHighlighter] No elements to highlight');
            return 0;
        }

        // Create container for all highlights
        this.container = document.createElement('div');
        this.container.id = 'axtree-highlights-container';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 2147483646;
        `;

        let highlightedCount = 0;

        elementMap.forEach((element, refId) => {
            const rect = element.getBoundingClientRect();

            // Skip elements outside viewport or with zero size
            if (rect.width === 0 || rect.height === 0) return;
            if (rect.bottom < 0 || rect.top > window.innerHeight) return;
            if (rect.right < 0 || rect.left > window.innerWidth) return;

            const highlight = this.createHighlightBox(refId, rect);
            this.container!.appendChild(highlight);
            this.highlights.push(highlight);
            highlightedCount++;
        });

        // Only append if we have highlights
        if (this.highlights.length > 0) {
            document.body.appendChild(this.container);
        }

        return highlightedCount;
    }

    /**
     * Create a single highlight box with label
     */
    private createHighlightBox(refId: number, rect: DOMRect): HTMLElement {
        const box = document.createElement('div');

        // Cornflower blue with transparency for soft appearance
        const borderColor = 'rgba(100, 149, 237, 0.8)';
        const bgColor = 'rgba(100, 149, 237, 0.08)';

        // Use inline styles to avoid CSP issues
        box.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            border: 2px solid ${borderColor};
            background: ${bgColor};
            pointer-events: none;
            z-index: 2147483646;
            box-sizing: border-box;
        `;

        // Create refId label
        const label = document.createElement('span');
        label.textContent = String(refId);
        label.style.cssText = `
            position: absolute;
            top: 0;
            right: 0;
            background: rgba(100, 149, 237, 0.9);
            color: white;
            font-size: 11px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 0 0 0 4px;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1;
        `;

        // For very small elements, move label outside to avoid complete occlusion
        if (rect.width < 40) {
            label.style.left = '-20px';
            label.style.top = '0';
            label.style.right = 'auto';
            label.style.borderRadius = '0 4px 4px 0';
        }

        box.appendChild(label);
        return box;
    }

    /**
     * Remove all highlight overlays from the page
     */
    cleanup(): void {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        this.highlights = [];
    }

    /**
     * Get count of currently highlighted elements
     */
    getHighlightCount(): number {
        return this.highlights.length;
    }
}
