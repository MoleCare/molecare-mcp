/**
 * Shared MCP server runtime
 * =========================
 *
 * Both entrypoints — the public bridge (`index.ts`) and the internal ops
 * server (`ops.ts`) — need the same wrapper around every tool call:
 * input validation, per-user rate limiting, timing, and error shaping.
 * Keeping it here means the two servers cannot drift apart.
 */

import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { rateLimitService } from "./services/rate-limit-service.js";
import { validateInput, TOOL_SCHEMAS } from "./utils/validation.js";
import { logger, createTimer } from "./utils/logger.js";

/** A tool handler returns an MCP tool result. */
export interface ToolContext {
  userId: string;
  /** Milliseconds elapsed since the call started. */
  timer: () => number;
}

export type ToolDispatch = (
  name: string,
  args: Record<string, any>,
  ctx: ToolContext
) => Promise<any>;

function errorResult(code: string, message: string, tool: string) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: true, code, message, tool }),
      },
    ],
    isError: true,
  };
}

/**
 * Wire up ListTools and CallTool for a server, applying validation and
 * rate limiting before delegating to `dispatch`.
 */
export function registerTools(
  server: Server,
  tools: unknown[],
  toolCosts: Record<string, number>,
  dispatch: ToolDispatch
): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const timer = createTimer();

    // Extract user ID from request context or arguments
    const userId = (args?.userId as string) || "anonymous";

    // Validate input if schema exists
    const schema = TOOL_SCHEMAS[name];
    if (schema) {
      const validation = validateInput(schema, args);
      if (!validation.success) {
        logger.warn(`Validation failed for ${name}`, { error: validation.error });
        return errorResult("VALIDATION_ERROR", validation.error as string, name);
      }
    }

    // Check rate limit before executing tool (default cost 1)
    const rateLimitResult = rateLimitService.tryConsume(userId, toolCosts[name] || 1);

    if (!rateLimitResult.allowed) {
      logger.warn(`Rate limit exceeded for ${userId}`, { tool: name });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              code: "RATE_LIMIT_EXCEEDED",
              message: `Rate limit exceeded. You have ${rateLimitResult.remainingTokens} tokens remaining. Please try again in ${Math.ceil((rateLimitResult.retryAfterMs || 60000) / 1000)} seconds.`,
              retryAfterMs: rateLimitResult.retryAfterMs,
              remainingTokens: rateLimitResult.remainingTokens,
              resetTime: new Date(rateLimitResult.resetTime).toISOString(),
            }),
          },
        ],
        isError: true,
      };
    }

    try {
      return await dispatch(name, args as Record<string, any>, { userId, timer });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      logger.toolCall({
        tool: name,
        args: args as Record<string, unknown>,
        duration_ms: timer(),
        success: false,
        error: errorMessage,
        userId,
      });

      return errorResult("TOOL_ERROR", errorMessage, name);
    }
  });
}

/**
 * Start the server over stdio, optionally exposing a health endpoint.
 *
 * The health port only binds when explicitly configured. Desktop MCP clients
 * run over stdio and have no use for it, and binding by default would collide
 * with whatever the user already has on that port.
 */
export async function startServer(server: Server, label: string): Promise<void> {
  console.error(`Starting ${label}...`);

  const configuredPort = process.env.MCP_HEALTH_PORT || process.env.PORT;
  if (configuredPort) {
    const port = parseInt(configuredPort, 10);
    const healthServer = createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    // A health endpoint is never worth taking the MCP server down for.
    healthServer.on("error", (error) => {
      console.error(`Health check endpoint unavailable on port ${port}: ${error}`);
    });
    healthServer.listen(port, () => {
      console.error(`Health check endpoint listening on port ${port}`);
    });
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${label} running`);
}
