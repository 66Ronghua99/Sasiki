import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { waitForCdpEndpointReady } from "./cdp-ready.mjs";

test("waitForCdpEndpointReady polls until /json/version becomes ready", async () => {
  let attempts = 0;
  const server = http.createServer((req, res) => {
    if (req.url !== "/json/version") {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    attempts += 1;
    if (attempts < 3) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not ready" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ webSocketDebuggerUrl: "ws://127.0.0.1/devtools/browser/test" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}`;

  try {
    const result = await waitForCdpEndpointReady(endpoint, {
      timeoutMs: 1_000,
      intervalMs: 20,
    });
    assert.equal(result.readyUrl, `${endpoint}/json/version`);
    assert.equal(attempts, 3);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("waitForCdpEndpointReady fails explicitly after timeout", async () => {
  const server = http.createServer((_, res) => {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "still starting" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}`;

  try {
    await assert.rejects(
      () =>
        waitForCdpEndpointReady(endpoint, {
          timeoutMs: 80,
          intervalMs: 20,
        }),
      /CDP endpoint not ready/
    );
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
