# MoleCare MCP Best Practices Guide

## 1. Performance Optimization

### 1.1 Tool Design Principles

**Keep tools focused and single-purpose:**
```typescript
// GOOD: Focused tool
"get_app_status" - Returns app health only

// BAD: Doing too much
"get_everything" - Returns apps, k8s, databases, models all at once
```

**Use appropriate granularity:**
- `get_app_status(appType: "ml-serving")` - Specific query
- `get_app_status()` - Overview when needed

### 1.2 Caching Strategy

Add caching for expensive operations in your clients:

```typescript
// Example: Add to infrastructure-client.ts
private cache = new Map<string, { data: any; timestamp: number }>();
private CACHE_TTL = 30000; // 30 seconds

private getCached<T>(key: string): T | null {
  const cached = this.cache.get(key);
  if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
    return cached.data as T;
  }
  return null;
}

private setCache(key: string, data: any): void {
  this.cache.set(key, { data, timestamp: Date.now() });
}
```

### 1.3 Connection Pooling

For database/API clients, reuse connections:
```typescript
// Already done in your clients - axios instances are reused
this.client = axios.create({
  baseURL: config.baseUrl,
  timeout: 10000,  // Always set timeouts!
});
```

## 2. Reliability Improvements

### 2.1 Error Handling

Always return structured errors that Claude can understand:

```typescript
// In tool handlers - already implemented
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      error: true,
      code: "RESOURCE_NOT_FOUND",
      message: "Feature view 'xyz' not found",
      suggestion: "Available views: user_features, mole_features"
    })
  }],
  isError: true
};
```

### 2.2 Graceful Degradation

Your mock data fallback is excellent for reliability:
```typescript
async listExperiments(): Promise<Experiment[]> {
  if (this.useMockData) {
    return this.getMockExperiments();  // Always works
  }
  try {
    const response = await this.client.get("/experiments");
    return response.data;
  } catch (error) {
    console.error("MLflow API error, using mock data:", error);
    return this.getMockExperiments();  // Fallback
  }
}
```

### 2.3 Health Checks

Your server already has a health endpoint. Add MCP-specific health:

```typescript
// Add to index.ts - health check for all clients
async function checkMCPHealth(): Promise<{
  overall: "healthy" | "degraded" | "unhealthy";
  services: Record<string, boolean>;
}> {
  const services: Record<string, boolean> = {};

  try {
    await mlflowClient.listExperiments();
    services.mlflow = true;
  } catch { services.mlflow = false; }

  try {
    await infraClient.getAllApplicationStatus();
    services.infrastructure = true;
  } catch { services.infrastructure = false; }

  // ... check other services

  const healthy = Object.values(services).filter(Boolean).length;
  const total = Object.values(services).length;

  return {
    overall: healthy === total ? "healthy" : healthy > 0 ? "degraded" : "unhealthy",
    services
  };
}
```

## 3. Claude Work Quality

### 3.1 Rich Tool Descriptions

Your descriptions are good. Enhance with examples:

```typescript
{
  name: "get_mlflow_runs",
  description: `Get MLflow runs for an experiment with metrics, parameters, and status.

Examples:
- Get all runs: experimentId="1"
- Filter by AUC: experimentId="1", filter="metrics.auc > 0.9"
- Best runs only: experimentId="1", filter="metrics.auc > 0.9 AND status = 'FINISHED'"`,
  inputSchema: { ... }
}
```

### 3.2 Contextual Responses

Add context to help Claude make decisions:

```typescript
// In get_pipeline_summary response
{
  period: "Last 7 days",
  summary: { ... },
  insight: summary.successRate >= 90
    ? "Pipeline health is excellent"
    : "Pipeline health needs attention",
  suggestedActions: summary.successRate < 70
    ? ["Check failed runs", "Review error patterns"]
    : []
}
```

### 3.3 Resource Organization

Your resources are well-organized. Use them for:
- **Architecture** - Claude understands system context
- **Runbooks** - Claude can suggest troubleshooting steps
- **Catalogs** - Claude knows what models/features exist

## 4. Security Best Practices

### 4.1 Environment Variables

Never hardcode secrets. Your config is good:
```json
{
  "env": {
    "GITHUB_TOKEN": "USE_ENV_VAR_NOT_HERE",
    "MOLECARE_API_KEY": "USE_ENV_VAR_NOT_HERE"
  }
}
```

For secrets, use system environment variables or a secrets manager.

### 4.2 Rate Limiting

Already implemented - your rate limit service protects against abuse:
```typescript
const rateLimitResult = rateLimitService.tryConsume(userId, toolCost);
if (!rateLimitResult.allowed) {
  return { error: "RATE_LIMIT_EXCEEDED", ... };
}
```

### 4.3 Input Validation

Add Zod validation for tool inputs (you have zod installed):

```typescript
import { z } from "zod";

const GetMlflowRunsSchema = z.object({
  experimentId: z.string().min(1),
  filter: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(10)
});

// In handler:
case "get_mlflow_runs": {
  const parsed = GetMlflowRunsSchema.safeParse(args);
  if (!parsed.success) {
    return { error: true, message: parsed.error.message };
  }
  // ... use parsed.data
}
```

## 5. Development Workflow

### 5.1 Testing Tools

Use the MCP Inspector:
```bash
cd molecare-mcp
npm run inspect
```

### 5.2 Development Mode

Your mock data mode is perfect for development:
```typescript
this.useMockData = process.env.NODE_ENV !== "production";
```

### 5.3 Logging

Add structured logging for debugging:
```typescript
function logToolCall(name: string, args: any, duration: number, success: boolean) {
  console.error(JSON.stringify({
    type: "tool_call",
    name,
    args,
    duration_ms: duration,
    success,
    timestamp: new Date().toISOString()
  }));
}
```

## 6. Configuration Patterns

### 6.1 Environment-Specific Configs

Create multiple config files:
```
.claude/
  claude_desktop_config.json      # Development
  claude_desktop_config.prod.json # Production
```

### 6.2 Feature Flags

Add feature toggles for new/experimental tools:
```typescript
const FEATURES = {
  ENABLE_FEAST_TOOLS: process.env.ENABLE_FEAST_TOOLS === "true",
  ENABLE_ADVANCED_MLFLOW: process.env.ENABLE_ADVANCED_MLFLOW === "true"
};

// In tool list
...(FEATURES.ENABLE_FEAST_TOOLS ? [
  { name: "get_feature_views", ... }
] : [])
```

## 7. Monitoring & Observability

### 7.1 Metrics to Track

Add Prometheus metrics (optional enhancement):
- `mcp_tool_calls_total{tool="get_app_status", status="success"}`
- `mcp_tool_duration_seconds{tool="get_mlflow_runs"}`
- `mcp_rate_limit_hits_total{user_tier="free"}`

### 7.2 Health Dashboard

Consider adding a simple health dashboard endpoint:
```typescript
// GET /dashboard returns HTML with tool usage stats
```

## 8. Quick Reference

### Tool Categories & When to Use

| Category | Tools | Use When |
|----------|-------|----------|
| **Infrastructure** | get_app_status, get_kubernetes_status | "Is the system healthy?" |
| **CI/CD** | get_pipeline_runs, get_deployment_status | "Did my build pass?" |
| **MLflow** | get_mlflow_experiments, get_registered_models | "What's in production?" |
| **Feast** | get_feature_views, get_feature_freshness | "What features do we have?" |

### Common Workflows

**Pre-deployment check:**
1. `get_pipeline_runs` - Verify CI passed
2. `get_deployment_status` - Check current state
3. `get_registered_models` - Confirm model ready

**Debugging slowness:**
1. `get_app_status` - Find slow service
2. `get_kubernetes_status` - Check resource usage
3. `get_database_status` - Check DB connections

**Model comparison:**
1. `get_mlflow_experiments` - Find experiment
2. `get_mlflow_runs` - Get runs
3. `compare_model_runs` - Compare metrics
