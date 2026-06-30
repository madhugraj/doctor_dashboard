const normalizeApiRoot = (value?: string) => String(value || "").replace(/\/$/, "");

const isLocalFrontendHost = () =>
  typeof window !== "undefined"
  && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

const configuredApiRoot = normalizeApiRoot(import.meta.env.VITE_API_URL || "");
const localBackendOrigin = () => {
  if (typeof window === "undefined" || !isLocalFrontendHost()) return "";
  let configured: URL | null = null;
  try {
    configured = configuredApiRoot ? new URL(configuredApiRoot) : null;
  } catch {
    configured = null;
  }
  const port = configured?.port || "8001";
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
};

// In local browser development, prefer same-origin requests and let Vite proxy
// them to the backend. This keeps cookie auth working on localhost.
export const API_ROOT = isLocalFrontendHost() ? "" : configuredApiRoot;
export const BACKEND_ORIGIN = API_ROOT
  || (typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "");

// WebSockets bypass Vite's HTTP proxy. In local dev, keep the browser hostname
// so host-scoped auth cookies set on localhost or 127.0.0.1 are sent.
export const WS_ORIGIN = localBackendOrigin()
  || configuredApiRoot
  || (typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "");
export const API_BASE = `${API_ROOT}/api`;
