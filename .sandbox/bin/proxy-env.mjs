export function buildProxySafeEnv(env) {
  const next = { ...env };
  delete next.http_proxy;
  delete next.https_proxy;
  delete next.HTTP_PROXY;
  delete next.HTTPS_PROXY;
  if (!next.NO_PROXY && !next.no_proxy) {
    next.NO_PROXY = "localhost,127.0.0.1,::1";
    next.no_proxy = "localhost,127.0.0.1,::1";
  } else if (!next.NO_PROXY && next.no_proxy) {
    next.NO_PROXY = next.no_proxy;
  } else if (!next.no_proxy && next.NO_PROXY) {
    next.no_proxy = next.NO_PROXY;
  }
  return next;
}

export function applyProxySafeEnv(env = process.env) {
  const next = buildProxySafeEnv(env);
  for (const [key, value] of Object.entries(next)) {
    env[key] = value;
  }
  for (const key of ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"]) {
    delete env[key];
  }
  return env;
}
