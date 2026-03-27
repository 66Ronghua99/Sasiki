import test from "node:test";
import assert from "node:assert/strict";

import { applyProxySafeEnv, buildProxySafeEnv } from "./proxy-env.mjs";

test("buildProxySafeEnv strips proxy vars and populates localhost no_proxy", () => {
  const env = buildProxySafeEnv({
    http_proxy: "http://127.0.0.1:10808",
    https_proxy: "http://127.0.0.1:10808",
  });

  assert.equal(env.http_proxy, undefined);
  assert.equal(env.https_proxy, undefined);
  assert.equal(env.HTTP_PROXY, undefined);
  assert.equal(env.HTTPS_PROXY, undefined);
  assert.equal(env.NO_PROXY, "localhost,127.0.0.1,::1");
  assert.equal(env.no_proxy, "localhost,127.0.0.1,::1");
});

test("applyProxySafeEnv mutates the provided env object", () => {
  const env = {
    HTTP_PROXY: "http://127.0.0.1:10808",
    no_proxy: "localhost,127.0.0.1,::1",
  };

  const result = applyProxySafeEnv(env);

  assert.equal(result, env);
  assert.equal(env.HTTP_PROXY, undefined);
  assert.equal(env.http_proxy, undefined);
  assert.equal(env.NO_PROXY, "localhost,127.0.0.1,::1");
  assert.equal(env.no_proxy, "localhost,127.0.0.1,::1");
});
