/**
 * Shared command catalog for MCP tool modules.
 *
 * Each tool is a command (name, schema, cost, execute). A catalog holds the
 * commands, builds the MCP tool list and cost map from that one source, and
 * looks up a command by name.
 */

import type { ToolContext } from "../runtime.js";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ToolCommand<TDeps> {
  readonly definition: McpToolDefinition;
  readonly cost: number;
  execute(
    deps: TDeps,
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<McpToolResult>;
}

export function jsonResult(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function toolError(message: string): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: true, message }) }],
    isError: true,
  };
}

export class ToolCatalog<TDeps> {
  private readonly commands = new Map<string, ToolCommand<TDeps>>();

  constructor(
    private readonly deps: TDeps,
    commands: readonly ToolCommand<TDeps>[]
  ) {
    for (const command of commands) {
      this.commands.set(command.definition.name, command);
    }
  }

  get tools(): McpToolDefinition[] {
    return [...this.commands.values()].map((command) => command.definition);
  }

  get costs(): Record<string, number> {
    return Object.fromEntries(
      [...this.commands.values()].map((command) => [
        command.definition.name,
        command.cost,
      ])
    );
  }

  async dispatch(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<McpToolResult | undefined> {
    const command = this.commands.get(name);
    if (!command) return undefined;
    return command.execute(this.deps, args, ctx);
  }
}
