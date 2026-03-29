import { act } from "react";

type Listener = (event: SimpleDOMEvent) => void;

export class SimpleDOMEvent {
  defaultPrevented = false;
  target: SimpleNode | null = null;
  currentTarget: SimpleNode | null = null;
  propagationStopped = false;

  constructor(
    public readonly type: string,
    public readonly options: { bubbles?: boolean; cancelable?: boolean } = {},
  ) {}

  get bubbles(): boolean {
    return this.options.bubbles ?? false;
  }

  get cancelable(): boolean {
    return this.options.cancelable ?? false;
  }

  preventDefault(): void {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

class SimpleNode {
  parentNode: SimpleNode | null = null;
  ownerDocument: SimpleDocument | null = null;
  childNodes: SimpleNode[] = [];
  readonly listeners = new Map<string, { capture: Listener[]; bubble: Listener[] }>();

  constructor(public readonly nodeType: number) {}

  get textContent(): string {
    return "";
  }

  set textContent(_value: string) {
    // base nodes do not carry text directly
  }

  get firstChild(): SimpleNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): SimpleNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling(): SimpleNode | null {
    if (!this.parentNode) {
      return null;
    }
    const index = this.parentNode.childNodes.indexOf(this as SimpleNode);
    return this.parentNode.childNodes[index + 1] ?? null;
  }

  get previousSibling(): SimpleNode | null {
    if (!this.parentNode) {
      return null;
    }
    const index = this.parentNode.childNodes.indexOf(this as SimpleNode);
    return index > 0 ? this.parentNode.childNodes[index - 1] : null;
  }

  appendChild<T extends SimpleNode>(child: T): T {
    return this.insertBefore(child, null);
  }

  insertBefore<T extends SimpleNode>(child: T, before: SimpleNode | null): T {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this as unknown as SimpleNode;
    child.ownerDocument = this.ownerDocument;
    if (before === null) {
      this.childNodes.push(child);
      return child;
    }
    const index = this.childNodes.indexOf(before);
    if (index === -1) {
      this.childNodes.push(child);
      return child;
    }
    this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild<T extends SimpleNode>(child: T): T {
    const index = this.childNodes.indexOf(child);
    if (index === -1) {
      throw new Error("child not found");
    }
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  addEventListener(type: string, listener: Listener, options?: boolean | AddEventListenerOptions): void {
    const entry = this.listeners.get(type) ?? { capture: [], bubble: [] };
    if (typeof options === "boolean" ? options : options?.capture) {
      entry.capture.push(listener);
    } else {
      entry.bubble.push(listener);
    }
    this.listeners.set(type, entry);
  }

  removeEventListener(type: string, listener: Listener): void {
    const entry = this.listeners.get(type);
    if (!entry) {
      return;
    }
    entry.capture = entry.capture.filter((candidate) => candidate !== listener);
    entry.bubble = entry.bubble.filter((candidate) => candidate !== listener);
  }

  dispatchEvent(event: SimpleDOMEvent): boolean {
    const path: SimpleNode[] = [];
    let current: SimpleNode | null = this as unknown as SimpleNode;
    while (current) {
      path.push(current);
      current = current.parentNode;
    }

    event.target = this as unknown as SimpleNode;

    for (let index = path.length - 1; index >= 0; index -= 1) {
      if (event.propagationStopped) {
        break;
      }
      this.invokeListeners(path[index], event, "capture");
    }

    for (let index = 0; index < path.length; index += 1) {
      if (event.propagationStopped) {
        break;
      }
      this.invokeListeners(path[index], event, "bubble");
    }

    return !event.defaultPrevented;
  }

  protected invokeListeners(node: SimpleNode, event: SimpleDOMEvent, phase: "capture" | "bubble"): void {
    const entry = node.listeners.get(event.type);
    if (!entry) {
      return;
    }
    const listeners = phase === "capture" ? entry.capture : entry.bubble;
    for (const listener of listeners) {
      if (event.propagationStopped) {
        break;
      }
      event.currentTarget = node;
      listener(event);
    }
  }
}

export class SimpleTextNode extends SimpleNode {
  constructor(public data: string) {
    super(3);
  }

  get nodeValue(): string {
    return this.data;
  }

  set nodeValue(value: string) {
    this.data = value;
  }

  get textContent(): string {
    return this.data;
  }

  set textContent(value: string) {
    this.data = value;
  }
}

export class SimpleElement extends SimpleNode {
  readonly style: Record<string, string> & { setProperty(name: string, value: string): void; removeProperty(name: string): void };
  readonly attributes = new Map<string, string>();
  namespaceURI = "http://www.w3.org/1999/xhtml";
  selected = false;
  checked = false;
  disabled = false;
  private _value = "";

  constructor(public readonly tagName: string) {
    super(1);
    this.style = Object.assign(Object.create(null), {
      setProperty: (name: string, value: string) => {
        this.style[name] = value;
      },
      removeProperty: (name: string) => {
        delete this.style[name];
      },
    });
  }

  get nodeName(): string {
    return this.tagName.toUpperCase();
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = [];
    if (value !== "") {
      this.appendChild(new SimpleTextNode(value));
    }
  }

  get innerText(): string {
    return this.textContent;
  }

  get value(): string {
    if (this.tagName === "select") {
      const selectedOption = this.options.find((option) => option.selected);
      if (selectedOption) {
        return selectedOption.value;
      }
      return this._value;
    }

    return this._value;
  }

  set value(value: string) {
    this._value = String(value);
    if (this.tagName === "select") {
      for (const option of this.options) {
        option.selected = option.value === this._value;
      }
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
    if (name === "value") {
      this.value = String(value);
    }
    if (name === "disabled") {
      this.disabled = true;
    }
    if (name === "checked") {
      this.checked = true;
    }
    if (name === "selected") {
      this.selected = true;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === "disabled") {
      this.disabled = false;
    }
    if (name === "checked") {
      this.checked = false;
    }
    if (name === "selected") {
      this.selected = false;
    }
  }

  get options(): SimpleElement[] {
    return this.childNodes.filter((child): child is SimpleElement => child instanceof SimpleElement && child.tagName === "option");
  }
}

export class SimpleCommentNode extends SimpleNode {
  constructor(public data: string) {
    super(8);
  }

  get nodeValue(): string {
    return this.data;
  }

  set nodeValue(value: string) {
    this.data = value;
  }

  get nodeName(): string {
    return "#comment";
  }

  get textContent(): string {
    return this.data;
  }

  set textContent(value: string) {
    this.data = value;
  }
}

export class SimpleDocumentFragment extends SimpleNode {
  constructor() {
    super(11);
  }

  get nodeName(): string {
    return "#document-fragment";
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = [];
    if (value !== "") {
      this.appendChild(new SimpleTextNode(value));
    }
  }
}

export class SimpleDocument extends SimpleNode {
  readonly documentElement: SimpleElement;
  readonly body: SimpleElement;
  readonly defaultView: SimpleWindow;
  activeElement: SimpleElement | null = null;

  constructor() {
    super(9);
    this.documentElement = new SimpleElement("html");
    this.body = new SimpleElement("body");
    this.documentElement.ownerDocument = this;
    this.body.ownerDocument = this;
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.defaultView = new SimpleWindow(this);
  }

  get nodeName(): string {
    return "#document";
  }

  createElement(tagName: string): SimpleElement {
    const element = new SimpleElement(tagName);
    element.ownerDocument = this;
    return element;
  }

  createElementNS(_namespace: string, tagName: string): SimpleElement {
    return this.createElement(tagName);
  }

  createTextNode(data: string): SimpleTextNode {
    const node = new SimpleTextNode(data);
    node.ownerDocument = this;
    return node;
  }

  createComment(data: string): SimpleCommentNode {
    const node = new SimpleCommentNode(data);
    node.ownerDocument = this;
    return node;
  }

  createDocumentFragment(): SimpleDocumentFragment {
    const node = new SimpleDocumentFragment();
    node.ownerDocument = this;
    return node;
  }
}

class SimpleWindow {
  readonly Node = SimpleNode;
  readonly Element = SimpleElement;
  readonly HTMLElement = SimpleElement;
  readonly HTMLInputElement = SimpleElement;
  readonly HTMLSelectElement = SimpleElement;
  readonly HTMLTextAreaElement = SimpleElement;
  readonly HTMLButtonElement = SimpleElement;
  readonly HTMLFormElement = SimpleElement;
  readonly HTMLIFrameElement = SimpleElement;
  readonly Document = SimpleDocument;
  readonly Text = SimpleTextNode;
  readonly Event = SimpleDOMEvent;
  readonly navigator = { userAgent: "node.js" };
  readonly window = this;
  readonly self = this;

  constructor(public readonly document: SimpleDocument) {}

  getComputedStyle(): Record<string, string> {
    return {};
  }

  requestAnimationFrame(callback: FrameRequestCallback): number {
    return setTimeout(() => callback(Date.now()), 0) as unknown as number;
  }

  cancelAnimationFrame(handle: number): void {
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
  }

  addEventListener(): void {
    // no-op
  }

  removeEventListener(): void {
    // no-op
  }

  queueMicrotask(callback: VoidFunction): void {
    queueMicrotask(callback);
  }
}

export interface RendererHarness {
  document: SimpleDocument;
  window: SimpleWindow;
  container: SimpleElement;
  cleanup(): void;
}

export function setupRendererHarness(): RendererHarness {
  const document = new SimpleDocument();
  const window = document.defaultView;
  const container = document.createElement("div");
  document.body.appendChild(container);

  defineGlobal("navigator", window.navigator);
  defineGlobal("window", window);
  defineGlobal("document", document);
  defineGlobal("Node", SimpleNode);
  defineGlobal("Element", SimpleElement);
  defineGlobal("HTMLElement", SimpleElement);
  defineGlobal("HTMLInputElement", SimpleElement);
  defineGlobal("HTMLSelectElement", SimpleElement);
  defineGlobal("HTMLTextAreaElement", SimpleElement);
  defineGlobal("HTMLButtonElement", SimpleElement);
  defineGlobal("HTMLFormElement", SimpleElement);
  defineGlobal("HTMLIFrameElement", SimpleElement);
  defineGlobal("Text", SimpleTextNode);
  defineGlobal("Event", SimpleDOMEvent);
  defineGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  return {
    document,
    window,
    container,
    cleanup() {
      Reflect.deleteProperty(globalThis, "window");
      Reflect.deleteProperty(globalThis, "document");
      Reflect.deleteProperty(globalThis, "Node");
      Reflect.deleteProperty(globalThis, "Element");
      Reflect.deleteProperty(globalThis, "HTMLElement");
      Reflect.deleteProperty(globalThis, "HTMLInputElement");
      Reflect.deleteProperty(globalThis, "HTMLSelectElement");
      Reflect.deleteProperty(globalThis, "HTMLTextAreaElement");
      Reflect.deleteProperty(globalThis, "HTMLButtonElement");
      Reflect.deleteProperty(globalThis, "HTMLFormElement");
      Reflect.deleteProperty(globalThis, "HTMLIFrameElement");
      Reflect.deleteProperty(globalThis, "Text");
      Reflect.deleteProperty(globalThis, "Event");
      Reflect.deleteProperty(globalThis, "navigator");
      Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    },
  };
}

function defineGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

export async function renderWithHarness(render: () => void): Promise<void> {
  await act(async () => {
    render();
  });
}

export function findElementsByTag(root: SimpleNode, tagName: string): SimpleElement[] {
  const result: SimpleElement[] = [];
  visit(root, (node) => {
    if (node instanceof SimpleElement && node.tagName === tagName) {
      result.push(node);
    }
  });
  return result;
}

export function findElementByText(root: SimpleNode, text: string): SimpleElement | null {
  let found: SimpleElement | null = null;
  visit(root, (node) => {
    if (found || !(node instanceof SimpleElement)) {
      return;
    }
    if (node.textContent.includes(text)) {
      found = node;
    }
  });
  return found;
}

export function findButtonByText(root: SimpleNode, text: string): SimpleElement {
  const button = findElementsByTag(root, "button").find((element) => element.textContent.includes(text));
  if (!button) {
    throw new Error(`missing button containing text: ${text}`);
  }
  return button;
}

export function findInputById(root: SimpleNode, id: string): SimpleElement {
  const element = findElementsByTag(root, "input").find((candidate) => candidate.getAttribute("id") === id);
  if (!element) {
    throw new Error(`missing input #${id}`);
  }
  return element;
}

export function findSelectById(root: SimpleNode, id: string): SimpleElement {
  const element = findElementsByTag(root, "select").find((candidate) => candidate.getAttribute("id") === id);
  if (!element) {
    throw new Error(`missing select #${id}`);
  }
  return element;
}

export function click(element: SimpleElement): void {
  element.dispatchEvent(new SimpleDOMEvent("click", { bubbles: true, cancelable: true }));
}

export function changeValue(element: SimpleElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new SimpleDOMEvent("input", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new SimpleDOMEvent("change", { bubbles: true, cancelable: true }));
}

export function submitForm(form: SimpleElement): void {
  form.dispatchEvent(new SimpleDOMEvent("submit", { bubbles: true, cancelable: true }));
}

function visit(node: SimpleNode, visitor: (node: SimpleNode) => void): void {
  visitor(node);
  for (const child of node.childNodes as SimpleNode[]) {
    visit(child, visitor);
  }
}
