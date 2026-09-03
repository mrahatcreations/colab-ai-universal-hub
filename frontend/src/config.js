// Default Colab Cloudflare API Endpoint
export const DEFAULT_API_BASE = "https://colabapi.lunisphere.com";

export function getApiBase() {
  return localStorage.getItem("colab_api_base") || DEFAULT_API_BASE;
}

export function setApiBase(url) {
  if (url) {
    localStorage.setItem("colab_api_base", url.trim().replace(/\/+$/, ""));
  }
}
