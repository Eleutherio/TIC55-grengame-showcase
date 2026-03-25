const envApiUrl = (import.meta.env.VITE_API_URL ?? "").trim();
const isLocalHost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

export const API_URL = envApiUrl || (isLocalHost ? `http://${window.location.hostname}:8000` : "");

export const API_CONFIG_ERROR =
  "Configuracao de API ausente em producao. Defina VITE_API_URL e gere novo deploy.";
