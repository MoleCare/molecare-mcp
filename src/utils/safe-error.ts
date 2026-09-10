/**
 * Turn a thrown value into something safe to log.
 *
 * An Axios error carries the whole request on `error.config`, and that includes
 * `headers.Authorization`. Passing one to `console.error` prints the bearer
 * token. An MCP server's stderr is read by its client and is routinely shown in
 * a debug pane, so that is a credential in someone else's log file.
 *
 * Verified before this existed: with MOLECARE_API_KEY set to a canary and the
 * backend unreachable, the key appeared twice in stderr as
 * `Authorization: 'Bearer <key>'`.
 *
 * This keeps the parts that help someone debug — status, method, path — and
 * drops everything that could carry a secret or patient data: headers, request
 * body, response body, and the query string.
 */
import axios from "axios";

/** How much of a message is worth keeping before it is just noise. */
const MAX_MESSAGE = 200;

function safePath(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    // Absolute URL: keep origin and path, drop the query, which is where ids
    // and tokens end up.
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // Relative URL, or not a URL at all. Keep everything before the query.
    return url.split("?")[0];
  }
}

/**
 * A one-line description of a failure, safe to print.
 *
 * Never returns the error object itself, so a call site cannot accidentally
 * hand the whole thing to a logger that will expand it.
 */
export function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const parts: string[] = [];
    const status = error.response?.status;
    if (status) {
      parts.push(`HTTP ${status}`);
    } else if (error.code) {
      // ECONNREFUSED, ETIMEDOUT and friends.
      parts.push(error.code);
    } else {
      parts.push("no response");
    }

    const method = error.config?.method?.toUpperCase();
    const path = safePath(error.config?.url);
    if (method && path) parts.push(`${method} ${path}`);
    else if (path) parts.push(path);

    return parts.join(" ");
  }

  if (error instanceof Error) {
    return error.message.slice(0, MAX_MESSAGE);
  }

  // A thrown string, number or object. Never spread it: an object could be a
  // response body.
  return typeof error === "string" ? error.slice(0, MAX_MESSAGE) : "unknown error";
}

/**
 * For a fatal error at start-up, where a stack trace is worth having.
 *
 * A plain Error keeps its stack, because nothing in it came off the wire. An
 * Axios error is described rather than printed, for the reason above: its
 * config carries the Authorization header.
 */
export function describeFatal(error: unknown): string {
  if (axios.isAxiosError(error)) return describeError(error);
  if (error instanceof Error) return error.stack ?? error.message;
  return describeError(error);
}
