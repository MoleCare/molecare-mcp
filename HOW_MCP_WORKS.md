# How MCP Works in MoleCare

## What is MCP?

**Model Context Protocol (MCP)** is a standardized way for AI assistants like Claude to interact with external systems. Think of it as giving Claude "hands" to reach into your infrastructure and get real information.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              YOUR WORKFLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────┐         ┌─────────────┐         ┌──────────────────────────┐ │
│   │   You   │ ──────► │   Claude    │ ──────► │     MCP Server           │ │
│   │         │         │             │         │     (molecare-mcp)       │ │
│   └─────────┘         └─────────────┘         └──────────────────────────┘ │
│       │                     │                           │                   │
│       │                     │                           ▼                   │
│       │                     │                 ┌──────────────────────────┐ │
│       │                     │                 │   Your Infrastructure    │ │
│       │                     │                 │   • EC2 Instances        │ │
│       │                     │                 │   • Web App              │ │
│       │                     │                 │   • Mobile API           │ │
│       │                     │                 │   • MLflow               │ │
│       │                     │                 │   • Kubernetes           │ │
│       │                     │                 │   • Databases            │ │
│       │                     │                 └──────────────────────────┘ │
│       │                     │                           │                   │
│       │                     │◄──────────────────────────┘                   │
│       │◄────────────────────┘                                               │
│                                                                             │
│   "The staging server       "I checked your EC2 instance i-0abc123.        │
│    seems slow"               CPU is at 85%. The ml-serving pod is          │
│                              also showing memory pressure. I recommend      │
│                              scaling up or checking the model batch size." │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## MCP Architecture in MoleCare

### Components

```
molecare-mcp/
├── src/
│   ├── index.ts              # MCP Server - registers tools, handles requests
│   ├── api/
│   │   ├── molecare-client.ts    # MoleCare backend API
│   │   ├── ec2-client.ts         # AWS EC2 monitoring
│   │   ├── mlflow-client.ts      # ML experiment tracking
│   │   ├── feast-client.ts       # Feature store
│   │   ├── cicd-client.ts        # GitHub Actions, deployments
│   │   ├── infrastructure-client.ts  # K8s, infrastructure
│   │   ├── app-client.ts         # Web & Mobile app monitoring
│   │   ├── database-client.ts    # PostgreSQL, Redis monitoring
│   │   └── ontology-client.ts    # Medical terminology
│   ├── utils/
│   │   ├── cache.ts          # In-memory caching (reduces API calls)
│   │   ├── validation.ts     # Input validation (prevents errors)
│   │   ├── logger.ts         # Structured logging (debugging)
│   │   └── health.ts         # Service health checks
│   └── resources/
│       └── medical-kb.ts     # Static medical knowledge
└── dist/                     # Compiled JavaScript
```

### Communication Flow

```
┌──────────────┐    stdio     ┌──────────────┐    HTTP/SDK    ┌──────────────┐
│    Claude    │◄────────────►│  MCP Server  │◄──────────────►│   Backend    │
│   Desktop    │   JSON-RPC   │  (Node.js)   │                │   Services   │
└──────────────┘              └──────────────┘                └──────────────┘
      │                              │
      │ 1. User asks question        │
      │ 2. Claude decides to         │
      │    call a tool               │
      │                              │
      │ ─────────────────────────────►
      │   CallToolRequest            │
      │   { tool: "get_ec2_health" } │
      │                              │ 3. Server calls AWS API
      │                              │ 4. Server formats response
      │ ◄─────────────────────────────
      │   CallToolResponse           │
      │   { status: "healthy"... }   │
      │                              │
      │ 5. Claude interprets         │
      │    and responds to user      │
```

## How Each Component Helps You

### 1. EC2 Monitoring (`ec2-client.ts`)

**What it does:** Monitors your MoleCare servers on AWS

**Tools:**
| Tool | Use Case |
|------|----------|
| `get_ec2_instances` | "Show me all running servers" |
| `get_ec2_health` | "Are there any AWS health issues?" |
| `get_ec2_metrics` | "Why is the server slow?" → Shows CPU/memory |
| `check_server_health` | "Is the API responding?" → Hits /health endpoint |

**Real scenario:**
```
You: "Production seems slow today"

Claude's internal process:
1. Calls get_ec2_instances → finds production instance i-0abc123
2. Calls get_ec2_metrics(i-0abc123) → CPU at 92%
3. Calls get_ec2_health(i-0abc123) → System status OK
4. Calls check_server_health(i-0abc123) → Response time 2.3s (usually 200ms)

Claude: "Your production EC2 instance (i-0abc123) has CPU at 92%, which is causing
slow response times (2.3s vs normal 200ms). The instance type is t3.medium.
Consider: 1) Scaling to t3.large, 2) Adding another instance behind the load
balancer, or 3) Checking what's consuming CPU (likely the ML inference endpoint)."
```

### 2. Web & Mobile App Monitoring (`app-client.ts`)

**What it does:** Monitors your user-facing applications

**Tools:**
| Tool | Use Case |
|------|----------|
| `get_web_app_status` | Check web app health, version, response time |
| `get_mobile_api_status` | Check mobile backend health |
| `get_app_metrics` | Error rates, active users, response times |
| `get_app_errors` | Recent errors and stack traces |
| `get_app_versions` | What versions are deployed |

**Real scenario:**
```
You: "Users are complaining the app is broken"

Claude's internal process:
1. Calls get_web_app_status → Status: degraded, error rate 15%
2. Calls get_app_errors("web", limit=5) → Finds 500 errors on /api/analyze
3. Calls get_mobile_api_status → Status: healthy (mobile not affected)

Claude: "The web app is experiencing issues - 15% error rate. The errors are
coming from the /api/analyze endpoint with 'Model inference timeout' errors.
Mobile API is unaffected. This suggests the ML model serving is overloaded.
Check: 1) ML serving pod resources, 2) Model batch queue depth."
```

### 3. MLflow Integration (`mlflow-client.ts`)

**What it does:** Tracks ML experiments and model versions

**Tools:**
| Tool | Use Case |
|------|----------|
| `get_mlflow_experiments` | List all ML experiments |
| `get_mlflow_runs` | Get runs for an experiment |
| `get_registered_models` | See all production models |
| `compare_model_runs` | Compare metrics between runs |

**Real scenario:**
```
You: "Is the new model better than what's in production?"

Claude's internal process:
1. Calls get_registered_models → finds "mole-classifier" model
2. Calls get_mlflow_runs(experiment_id) → gets last 5 runs
3. Calls compare_model_runs([run_prod, run_new])

Claude: "Comparing the new model (run abc123) with production (run xyz789):
- AUC: 0.94 vs 0.91 (+3.3% improvement)
- Inference time: 45ms vs 32ms (40% slower)
- False negative rate: 2.1% vs 2.8% (better for medical use)

The new model is more accurate but slower. For a medical application where
missing a potential melanoma is critical, the improved false negative rate
justifies the latency increase. Recommend deploying to staging first."
```

### 4. Feature Store (`feast-client.ts`)

**What it does:** Monitors ML features for model inference

**Tools:**
| Tool | Use Case |
|------|----------|
| `get_feature_views` | List all feature definitions |
| `get_feature_freshness` | Are features up to date? |
| `get_online_features` | Get features for a specific user |

**Real scenario:**
```
You: "Model predictions seem off lately"

Claude's internal process:
1. Calls get_feature_freshness → finds user_skin_history is 3 days stale
2. Calls get_feature_views → sees it should update hourly

Claude: "The user_skin_history feature is 3 days stale (should be hourly).
This explains prediction drift - the model isn't seeing recent user data.
Check the Feast materialization job in Airflow."
```

### 5. CI/CD Monitoring (`cicd-client.ts`)

**What it does:** Tracks deployments and pipeline status

**Tools:**
| Tool | Use Case |
|------|----------|
| `get_pipeline_runs` | GitHub Actions workflow status |
| `get_deployment_status` | What's deployed where |
| `get_releases` | Release history |

**Real scenario:**
```
You: "Can I deploy to production?"

Claude's internal process:
1. Calls get_pipeline_runs → all tests passing
2. Calls get_deployment_status("staging") → healthy for 2 days
3. Calls get_releases → sees staging has v2.3.1

Claude: "Yes, safe to deploy. All pipelines are green, staging (v2.3.1) has
been healthy for 2 days with no errors. Run: gh workflow run deploy-prod"
```

### 6. Infrastructure (`infrastructure-client.ts`)

**What it does:** Monitors Kubernetes, services

**Tools:**
| Tool | Use Case |
|------|----------|
| `get_kubernetes_status` | Pod health, resource usage |
| `get_database_status` | DB connections, basic health |
| `get_deployments` | K8s deployment status |

### 7. Database Monitoring (`database-client.ts`)

**What it does:** Deep monitoring of PostgreSQL and Redis databases

**Tools:**
| Tool | Use Case |
|------|----------|
| `get_database_metrics` | Query stats, storage, cache hit ratios |
| `get_slow_queries` | Find queries needing optimization |
| `get_table_stats` | Table sizes, row counts, vacuum status |
| `get_backup_history` | Backup status and history |
| `get_connection_pools` | Connection pool utilization |

**Real scenario:**
```
You: "The API is timing out on some requests"

Claude's internal process:
1. Calls get_database_metrics → sees high query count, cache hit ratio dropped to 85%
2. Calls get_slow_queries → finds SELECT * FROM mole_analyses taking 2.4s avg
3. Calls get_connection_pools → web-api pool has 2 waiting requests
4. Calls get_table_stats → mole_analyses has 12,000 dead tuples

Claude: "Found the issue. The mole_analyses table has slow queries (2.4s avg)
and 12,000 dead tuples causing index bloat. The web-api connection pool is
backing up with waiting requests. Recommendations:
1. Run VACUUM ANALYZE on mole_analyses
2. Add index on (user_id, created_at) for the slow query
3. Consider increasing pool size from 50 to 75"
```

### 8. App Monitoring (`app-client.ts`)

**What it does:** Monitors web app, mobile API, and app store status

**Tools:**
| Tool | Use Case |
|------|----------|
| `get_web_app_status` | Web app health and response time |
| `get_mobile_api_status` | Mobile backend health |
| `get_all_apps_status` | All apps in one call |
| `get_app_metrics` | Error rates, active users |
| `get_app_errors` | Recent errors with details |
| `get_app_versions` | Deployed versions per environment |
| `get_app_store_status` | iOS/Android store ratings |

**Real scenario:**
```
You: "Users are reporting crashes on iOS"

Claude's internal process:
1. Calls get_app_errors("mobile") → finds auth token refresh failures
2. Calls get_app_store_status → sees rating dropped from 4.7 to 4.3
3. Calls get_app_versions → iOS 3.2.1 deployed 2 days ago
4. Calls get_mobile_api_status → API healthy, 89ms response time

Claude: "The iOS crashes are due to authentication token refresh failures
(45 occurrences in last 4 hours). This started after iOS 3.2.1 deployed
2 days ago - correlates with the App Store rating drop. The mobile API
is healthy, so the issue is client-side token handling. Check the token
refresh logic in the 3.2.1 release."
```

## The Power of Combined Context

The real value is when Claude combines information from multiple sources:

```
You: "Why did user X get a false negative on their mole analysis?"

Claude combines:
1. get_user_moles(X) → Mole #3, analyzed 2 hours ago
2. get_mole_analysis(mole_3) → Risk score 0.15 (low)
3. get_feature_freshness → user features were stale
4. get_mlflow_runs → model version 2.1.0
5. get_model_version("mole-classifier", "2.1.0") → known issue with Type II skin

Claude: "User X's mole #3 was scored low risk (0.15) likely due to two factors:
1. Their user features were stale (last updated 5 days ago), so the model
   didn't have their recent sun exposure data
2. They have Type II skin, and model v2.1.0 has a known bias issue with
   lighter skin tones (fixed in v2.2.0 currently in staging)

Recommend: 1) Re-run analysis after feature refresh, 2) Flag for manual
dermatologist review given the known model limitation."
```

## Performance Optimizations

### Caching
```typescript
// Expensive calls are cached
const experiments = await cache.getOrFetch(
  "mlflow:experiments",
  () => mlflowClient.listExperiments(),
  CACHE_TTL.LONG  // 5 minutes
);
```

### Validation
```typescript
// Inputs are validated before API calls
const validation = validateInput(GetEC2MetricsSchema, args);
if (!validation.success) {
  return { error: validation.error };  // Fast fail, no wasted API call
}
```

### Logging
```typescript
// Every tool call is logged with timing
logger.toolCall({
  tool: "get_ec2_metrics",
  duration_ms: 234,
  success: true,
});
```

## Configuration

Your MCP server is configured in `.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "molecare": {
      "command": "node",
      "args": ["/path/to/molecare-mcp/dist/index.js"],
      "env": {
        "NODE_ENV": "development",
        "MOLECARE_API_URL": "http://localhost:8080/api",
        "MLFLOW_TRACKING_URI": "http://localhost:5000",
        "AWS_REGION": "us-east-1",
        "WEB_APP_URL": "http://localhost:3000",
        "MOBILE_API_URL": "http://localhost:8080/api"
      }
    }
  }
}
```

## Summary: How MCP Helps Your Daily Work

| Without MCP | With MCP |
|-------------|----------|
| "Check EC2" → Open AWS console, find instance, check metrics | "Is the server healthy?" → Instant answer with metrics |
| "Compare models" → Open MLflow, export CSVs, manually compare | "Is new model better?" → Automatic comparison with recommendation |
| "Debug user issue" → Query DB, check logs, correlate timestamps | "Why did user X get this result?" → Full context in one answer |
| "Safe to deploy?" → Check CI, staging, errors manually | "Can I deploy?" → Aggregated status from all systems |

**MCP transforms Claude from a code assistant into an operations partner who knows your systems.**
