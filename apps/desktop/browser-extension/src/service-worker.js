const CAPTURE_ENDPOINT = "http://127.0.0.1:55173/extension/capture";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "sasiki.capture.active") {
    return false;
  }

  void captureCurrentTabCookies()
    .then((result) => {
      sendResponse({ ok: true, result });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return true;
});

async function captureCurrentTabCookies() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab?.url) {
    throw new Error("No active tab URL available");
  }

  const url = new URL(activeTab.url);
  const site = resolveSite(url.hostname);
  if (!site) {
    throw new Error(`Unsupported site: ${url.hostname}`);
  }

  const cookies = await chrome.cookies.getAll({ domain: url.hostname });
  const response = await fetch(CAPTURE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      site,
      cookies,
      provenance: "browser-extension-popup",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sasiki capture failed: ${response.status} ${body}`.trim());
  }

  return response.json();
}

function resolveSite(hostname) {
  if (hostname.endsWith("tiktok.com")) {
    return "tiktok-shop";
  }

  return null;
}
