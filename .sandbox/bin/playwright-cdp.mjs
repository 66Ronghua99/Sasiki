#!/usr/bin/env node
/**
 * Lightweight CDP observer based on Playwright connectOverCDP.
 * Captures current page status and can save screenshots for debugging.
 */
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultConfigPath = path.join(projectRoot, ".sandbox", "runtime.config.json");

const HELP_TEXT = `Sasiki CDP observer (Playwright connectOverCDP)

Usage:
  node .sandbox/bin/playwright-cdp.mjs status [--config <path>] [--out <screenshot>] [--title <label>]
  node .sandbox/bin/playwright-cdp.mjs watch --interval <ms> [--config <path>] [--max-steps <n>]
  node .sandbox/bin/playwright-cdp.mjs demo [--config <path>] [--preset tiktok-shop-customer-service|baidu-search-first-result] [--keyword <text>]

If cdp is not reachable, the command exits non-zero.
`;

    const command = process.argv[2] ?? "status";
if (!command || command === "--help" || command === "-h") {
  process.stdout.write(HELP_TEXT);
  process.exit(0);
}

const parsed = parseArgs(process.argv.slice(3));
const configPath = resolvePath(parsed.options.config ?? parsed.options.c);
const cdpEndpoint = resolveCdpEndpoint(configPath);

try {
  if (command === "watch") {
    const intervalMs = parseInt(parsed.options.interval ?? parsed.options.i ?? "2000", 10);
    const maxSteps = parseInt(parsed.options["max-steps"] ?? parsed.options.max ?? "0", 10);
    const count = Number.isFinite(maxSteps) && maxSteps > 0 ? maxSteps : Number.POSITIVE_INFINITY;
    const out = parsed.options.out || parsed.options.s;

    const payload = parseInt(process.env.CDP_WATCH_INTERVAL_MS ?? "", 10);
    const finalInterval = Number.isFinite(payload) && payload > 0 ? payload : intervalMs;

    for (let i = 1; i <= count; i += 1) {
      const stepOut = out ? appendStepSuffix(out, i) : "";
      await printSnapshot(cdpEndpoint, `watch:${i}`, stepOut);
      if (i < count) {
        await sleep(finalInterval);
      }
    }
    process.exit(0);
  }

  if (command === "status") {
    await printSnapshot(cdpEndpoint, parsed.options.title, parsed.options.out);
    process.exit(0);
  }

  if (command === "demo") {
    const preset = normalizePreset(parsed.options.preset);
    const keyword = (parsed.options.keyword ?? "咖啡豆").trim();
    const payload = await runDemo(cdpEndpoint, preset, keyword);
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exit(0);
  }

  throw new Error(`unknown command: ${command}`);
} catch (error) {
  process.stderr.write(`cdp inspect failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

async function printSnapshot(endpoint, title = "snapshot", outPath = "") {
  const playwright = await resolvePlaywrightModule();
  const browser = await connectBrowser(playwright, endpoint);
  try {
    const contexts = browser.contexts();
    const pageDetails = [];
    let activeContextIndex = -1;
    let activePageIndex = -1;
    for (let contextIndex = 0; contextIndex < contexts.length; contextIndex += 1) {
      const context = contexts[contextIndex];
      const pages = context.pages();
      for (let i = 0; i < pages.length; i += 1) {
        const page = pages[i];
        pageDetails.push({
          contextIndex,
          pageIndex: i,
          url: safeString(page.url?.() ?? ""),
          title: safeString(await safeTitle(page)),
        });
      }
    }
    const firstContext = contexts[0];
    const pagesFromFirstContext = firstContext ? firstContext.pages() : [];
    let active = pagesFromFirstContext.length > 0 ? pagesFromFirstContext.at(-1) : undefined;
    if (active && firstContext) {
      activeContextIndex = 0;
      activePageIndex = pagesFromFirstContext.length - 1;
    } else if (contexts.length > 0) {
      const lastContext = contexts.at(-1);
      const fallbackPages = lastContext?.pages() || [];
      if (fallbackPages.length > 0) {
        activeContextIndex = contexts.length - 1;
        activePageIndex = fallbackPages.length - 1;
        active = fallbackPages[activePageIndex];
      }
    }
    const payload = {
      title,
      capturedAt: new Date().toISOString(),
      endpoint,
      contextCount: contexts.length,
      pageCount: pageDetails.length,
      pages: pageDetails,
      active: active
        ? {
            contextIndex: activeContextIndex,
            pageIndex: activePageIndex,
            url: safeString(active?.url?.()),
            title: safeString(await safeTitle(active)),
          }
        : null,
    };
    if (outPath) {
      mkdirSync(path.dirname(outPath), { recursive: true });
      await active?.screenshot({ path: outPath, fullPage: true });
      payload.screenshot = outPath;
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

async function runDemo(endpoint, preset, keyword) {
  if (preset === "tiktok-shop-customer-service") {
    return runTikTokCustomerServiceDemo(endpoint);
  }

  const playwright = await resolvePlaywrightModule();
  const browser = await connectBrowser(playwright, endpoint);
  try {
    if (preset === "baidu-search-first-result") {
      return runBaiduSearchDemo(browser, endpoint, preset, keyword);
    }
    throw new Error(`unsupported demo preset: ${preset}`);
  } finally {
    await browser.close();
  }
}

async function runTikTokCustomerServiceDemo(endpoint) {
  const homeUrl = "https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN&register_libra=";
  const inboxUrl = "https://seller.tiktokshopglobalselling.com/chat/inbox/current";
  const homeTarget = await openUrlViaCdp(endpoint, homeUrl);
  await sleep(1800);
  let inboxTarget = null;

  const uiActions = {
    connectedByPlaywright: false,
    clickedCustomerEntry: false,
    usedDirectInboxFallback: false,
    clickedAssigned: false,
    clickedUnassigned: false,
    clickedUnread: false,
    clickLabels: [],
    assignedCount: null,
    unassignedCount: null,
    unreadCount: null,
    hasUnreadMessages: null,
    unreadAssessment: "",
    unreadIndicators: [],
    parseSource: "",
    error: "",
  };

  try {
    const playwright = await resolvePlaywrightModule();
    const browser = await connectBrowser(playwright, endpoint);
    try {
      let homePage = await findPageByUrl(browser, /\/homepage/i, 12000);
      if (!homePage) {
        homePage = await ensureActivePage(browser).catch(() => null);
      }
      if (homePage) {
        await homePage.bringToFront().catch(() => {});
        if (!/\/homepage/i.test(safeString(homePage.url()))) {
          await homePage.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        }
        await homePage.waitForTimeout(900);
        const entry = await clickUiToken(homePage, [
          "客户消息",
          "客服消息",
          "Customer Messages",
          "Messages",
          "Inbox",
        ]);
        if (entry) {
          uiActions.clickedCustomerEntry = true;
          uiActions.clickLabels.push(entry);
          await homePage.waitForTimeout(1600);
        }
      }

      let inboxPage = await findPageByUrl(browser, /\/chat\/inbox\/current/i, 6000);
      if (!inboxPage) {
        uiActions.usedDirectInboxFallback = true;
        const fallbackPage = homePage ?? (await ensureActivePage(browser).catch(() => null));
        if (fallbackPage) {
          await fallbackPage.bringToFront().catch(() => {});
          await fallbackPage.goto(inboxUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
          await fallbackPage.waitForTimeout(2200);
          inboxPage = fallbackPage;
        } else {
          inboxTarget = await openUrlViaCdp(endpoint, inboxUrl);
          await sleep(2200);
          inboxPage = await findPageByUrl(browser, /\/chat\/inbox\/current/i, 10000);
        }
      }

      if (inboxPage) {
        uiActions.connectedByPlaywright = true;
        await inboxPage.bringToFront().catch(() => {});
        await inboxPage.waitForTimeout(1200);

        const assigned = await clickUiToken(inboxPage, ["已分配", "Assigned"]);
        if (assigned) {
          uiActions.clickedAssigned = true;
          uiActions.clickLabels.push(assigned);
        }

        const unassigned = await clickUiToken(inboxPage, ["未分配", "Unassigned"]);
        if (unassigned) {
          uiActions.clickedUnassigned = true;
          uiActions.clickLabels.push(unassigned);
        }

        const unread = await clickUiToken(inboxPage, ["未读", "未读消息", "Unread", "Unread messages"]);
        if (unread) {
          uiActions.clickedUnread = true;
          uiActions.clickLabels.push(unread);
        }

        const pageText = await inboxPage.evaluate(() => document.body?.innerText ?? "");
        uiActions.parseSource = pageText.slice(0, 4000);
        uiActions.assignedCount = extractCount(pageText, ["已分配", "Assigned"]);
        uiActions.unassignedCount = extractCount(pageText, ["未分配", "Unassigned"]);
        uiActions.unreadCount = extractCount(pageText, ["未读", "未读消息", "Unread", "Unread messages"]);
        const unreadObservation = analyzeUnread(pageText);
        uiActions.hasUnreadMessages = unreadObservation.hasUnreadMessages;
        uiActions.unreadAssessment = unreadObservation.assessment;
        uiActions.unreadIndicators = unreadObservation.indicators;
      } else {
        uiActions.error = "playwright_connected_but_inbox_page_not_found";
      }
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (error) {
    uiActions.error = error instanceof Error ? error.message : String(error);
  }

  const targets = await listCdpTargets(endpoint);
  const urls = targets.map((item) => safeString(item.url)).filter(Boolean);
  const unreadKeywordPresent = targets.some((item) =>
    /未读|unread|unassigned|未分配/i.test(`${safeString(item.title)} ${safeString(item.url)}`)
  );
  const hasInboxTarget = urls.some((url) => /\/chat\/inbox\/current/i.test(url));
  if (!inboxTarget) {
    inboxTarget = targets.find((item) => /\/chat\/inbox\/current/i.test(safeString(item.url))) ?? null;
  }

  return {
    mode: "demo",
    preset: "tiktok-shop-customer-service",
    homeUrl,
    inboxUrl,
    homeTargetId: homeTarget?.id,
    inboxTargetId: inboxTarget?.id,
    hasInboxTarget,
    unreadKeywordPresent,
    uiActions: {
      connectedByPlaywright: uiActions.connectedByPlaywright,
      clickedCustomerEntry: uiActions.clickedCustomerEntry,
      usedDirectInboxFallback: uiActions.usedDirectInboxFallback,
      clickedAssigned: uiActions.clickedAssigned,
      clickedUnassigned: uiActions.clickedUnassigned,
      clickedUnread: uiActions.clickedUnread,
      clickLabels: uiActions.clickLabels,
      assignedCount: uiActions.assignedCount,
      unassignedCount: uiActions.unassignedCount,
      unreadCount: uiActions.unreadCount,
      hasUnreadMessages: uiActions.hasUnreadMessages,
      unreadAssessment: uiActions.unreadAssessment || undefined,
      unreadIndicators: uiActions.unreadIndicators,
      error: uiActions.error || undefined,
    },
    observedUrls: urls.slice(0, 12),
    completedAt: new Date().toISOString(),
  };
}

async function runBaiduSearchDemo(browser, endpoint, preset, keyword) {
  const page = await ensureActivePage(browser);
  await page.bringToFront();
  await page.goto("https://www.baidu.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  try {
    const input = await resolveVisibleLocator(page, [
      "input[name='wd']:visible",
      "#kw:visible",
      "textarea[name='wd']:visible",
    ], 10000);
    await input.fill(keyword);
    const submit = page.locator("input[type='submit'][value='百度一下']:visible").first();
    if ((await submit.count()) > 0) {
      await submit.click({ timeout: 10000 });
    } else {
      await page.keyboard.press("Enter");
    }
    await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
  } catch {
    await page.goto(`https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  }
  await page.waitForSelector("#content_left h3 a, h3.t a, .result h3 a", { timeout: 20000 });
  const firstResult = await resolveVisibleLocator(page, [
    "#content_left h3 a:visible",
    "h3.t a:visible",
    ".result h3 a:visible",
  ], 20000);
  await firstResult.waitFor({ state: "visible", timeout: 20000 });
  const title = (await firstResult.innerText()).trim();
  const href = ((await firstResult.getAttribute("href")) ?? "").trim();
  if (!href) {
    throw new Error("first result link href is empty");
  }
  await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  return {
    mode: "demo",
    endpoint,
    preset,
    keyword,
    clickedResultTitle: title,
    navigatedTo: page.url(),
    completedAt: new Date().toISOString(),
  };
}

async function connectBrowser(playwright, endpoint) {
  const candidates = [endpoint];
  const wsEndpoint = await resolveWebSocketDebuggerEndpoint(endpoint);
  if (wsEndpoint && wsEndpoint !== endpoint) {
    candidates.push(wsEndpoint);
  }
  let lastError;
  for (const candidate of candidates) {
    try {
      const browser = await playwright.chromium.connectOverCDP(candidate);
      return browser;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `No usable CDP endpoint. Tried: ${candidates.join(", ")}. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function resolveWebSocketDebuggerEndpoint(endpoint) {
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/json/version`);
    const payload = await response.json();
    const candidate = payload?.webSocketDebuggerUrl;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  } catch {
    return "";
  }
  return "";
}

function resolvePath(candidate) {
  if (candidate?.trim()) {
    return path.resolve(projectRoot, candidate.trim());
  }
  return defaultConfigPath;
}

function resolveCdpEndpoint(configPath) {
  const config = loadRuntimeConfig(configPath);
  const endpoint = config?.cdp?.endpoint?.trim() || "http://127.0.0.1:9222";
  if (!endpoint) {
    throw new Error("missing cdp endpoint");
  }
  return endpoint;
}

function loadRuntimeConfig(configPath) {
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw);
}

async function resolvePlaywrightModule() {
  const requireFromRuntime = createRequire(path.join(projectRoot, "apps/agent-runtime", "package.json"));
  try {
    return requireFromRuntime("playwright-core");
  } catch (primary) {
    return requireFromRuntime("playwright");
  }
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const idx = arg.indexOf("=");
      if (idx > -1) {
        options[arg.slice(2, idx)] = arg.slice(idx + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          options[key] = next;
          i += 1;
        } else {
          options[key] = "true";
        }
      }
    } else if (arg.length === 2) {
      const key = arg[1];
      const valueOptions = ["c", "o", "i", "m", "p"];
      const next = argv[i + 1];
      if (valueOptions.includes(key) && next && !next.startsWith("-")) {
        options[key] = next;
        i += 1;
      } else {
        options[key] = "true";
      }
    } else if (arg.length > 2) {
      for (let j = 1; j < arg.length; j += 1) {
        options[arg[j]] = "true";
      }
    }
  }
  return { options, positionals };
}

function normalizePreset(raw) {
  const value = String(raw ?? "").trim();
  return value || "tiktok-shop-customer-service";
}

async function ensureActivePage(browser, timeoutMs = 12000) {
  const startedAt = Date.now();
  const limit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 12000;
  while (Date.now() - startedAt < limit) {
    for (const context of browser.contexts()) {
      const pages = context.pages();
      if (pages.length > 0) {
        return pages[pages.length - 1];
      }
    }
    await sleep(200);
  }
  throw new Error("unable to locate an active page from current CDP browser contexts");
}

async function resolveVisibleLocator(page, selectors, timeoutMs) {
  const startedAt = Date.now();
  const normalizedTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;
  while (Date.now() - startedAt < normalizedTimeout) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      const count = await locator.count();
      if (count > 0 && (await locator.isVisible().catch(() => false))) {
        return locator;
      }
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`unable to resolve visible locator from selectors: ${selectors.join(", ")}`);
}

async function findPageByUrl(browser, pattern, timeoutMs) {
  const startedAt = Date.now();
  const limit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000;
  while (Date.now() - startedAt < limit) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const url = safeString(page.url());
        if (pattern.test(url)) {
          return page;
        }
      }
    }
    await sleep(250);
  }
  return null;
}

async function clickUiToken(page, labels) {
  for (const label of labels) {
    const nameRegex = new RegExp(escapeRegex(label), "i");
    const strategies = [
      page.getByRole("tab", { name: nameRegex }).first(),
      page.getByRole("button", { name: nameRegex }).first(),
      page.getByRole("link", { name: nameRegex }).first(),
      page.getByText(nameRegex).first(),
      page.locator(`*:has-text("${escapeCssText(label)}")`).first(),
    ];
    for (const locator of strategies) {
      const count = await locator.count().catch(() => 0);
      if (count > 0 && (await locator.isVisible().catch(() => false))) {
        await locator.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(700);
        return label;
      }
    }
  }
  return "";
}

function analyzeUnread(text) {
  const normalized = safeString(text);
  const count = extractCount(normalized, ["未读", "未读消息", "Unread", "Unread messages"]);
  const indicators = [];
  if (/暂无未读|没有未读|no unread/i.test(normalized)) {
    indicators.push("explicit-empty");
  }
  const positiveMatch = normalized.match(/(?:未读|unread)[^0-9]{0,8}([1-9]\d*)|([1-9]\d*)[^0-9]{0,8}(?:未读|unread)/i);
  if (positiveMatch) {
    indicators.push(`positive-pattern:${positiveMatch[0].trim().slice(0, 40)}`);
  }
  let hasUnreadMessages = false;
  let assessment = "no-unread-signal";
  if (count !== null) {
    hasUnreadMessages = count > 0;
    assessment = "count-based";
  } else if (indicators.includes("explicit-empty")) {
    hasUnreadMessages = false;
    assessment = "explicit-empty";
  } else if (indicators.some((item) => item.startsWith("positive-pattern:"))) {
    hasUnreadMessages = true;
    assessment = "positive-pattern";
  } else {
    indicators.push("no-unread-signal-found");
  }
  return {
    hasUnreadMessages,
    assessment,
    indicators: indicators.slice(0, 6),
  };
}

function extractCount(text, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`${escaped}\\s*[(:：]?\\s*(\\d+)\\s*[)]?`, "i"),
      new RegExp(`(\\d+)\\s*[条]?[未读]?\\s*${escaped}`, "i"),
    ];
    for (const regex of patterns) {
      const match = regex.exec(text);
      if (match && Number.isFinite(Number.parseInt(match[1], 10))) {
        return Number.parseInt(match[1], 10);
      }
    }
  }
  return null;
}

function escapeRegex(value) {
  return safeString(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeCssText(value) {
  return safeString(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function openUrlViaCdp(endpoint, url) {
  const normalized = endpoint.replace(/\/$/, "");
  const payloadPath = `/json/new?${encodeURIComponent(url)}`;
  const candidates = [
    { method: "PUT", url: `${normalized}${payloadPath}` },
    { method: "GET", url: `${normalized}${payloadPath}` },
  ];
  let lastError = "";
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, { method: candidate.method });
      if (!response.ok) {
        lastError = `${candidate.method} ${candidate.url} -> ${response.status}`;
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`unable to open URL via CDP: ${url}; last error: ${lastError}`);
}

async function listCdpTargets(endpoint) {
  const normalized = endpoint.replace(/\/$/, "");
  const response = await fetch(`${normalized}/json/list`);
  if (!response.ok) {
    throw new Error(`failed to list CDP targets: ${response.status}`);
  }
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function appendStepSuffix(outPath, step) {
  const normalized = safeString(outPath).trim();
  if (!normalized) {
    return "";
  }
  if (normalized.endsWith(".png")) {
    return normalized.replace(/\.png$/, `-${step}.png`);
  }
  return `${normalized}-${step}`;
}

function sleep(ms) {
  const normalized = Number.isFinite(ms) && ms > 0 ? Math.trunc(ms) : 1000;
  return new Promise((resolve) => setTimeout(resolve, normalized));
}

async function safeTitle(page) {
  if (!page?.title) {
    return "";
  }
  try {
    return await page.title();
  } catch {
    return "";
  }
}
