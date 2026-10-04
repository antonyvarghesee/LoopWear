const REDIRECT_BASE = "https://loopwear.invalid";

/** Keep post-auth destinations on this app, including safe query strings. */
export function safeInternalPath(candidate: unknown): string {
  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return "/";
  }

  try {
    const url = new URL(candidate, REDIRECT_BASE);
    if (url.origin !== REDIRECT_BASE) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
