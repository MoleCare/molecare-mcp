# MoleCare MCP Server

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple.svg)](https://modelcontextprotocol.io)

**Model Context Protocol (MCP) server** that gives Claude and other MCP clients access to:

1. **Dermatology knowledge** — ABCDE education, SNOMED CT / ICD-10 helpers, risk-factor prompts  
2. **Optional MoleCare API tools** — moles, trends, analysis (your backend + API key)  
3. **Optional MLOps / ops tools** — health checks, MLflow, feature store, infra (mock-first)

> **Not a medical device.** Outputs are educational and operational aids only. Do not use for diagnosis or treatment decisions.

Product site: [molecare.co.uk](https://www.molecare.co.uk/) · App: [iOS](https://apps.apple.com/us/app/molecare/id1448635328) · [Android](https://play.google.com/store/apps/details?id=com.mymolecare)

---

## Why this exists

MoleCare helps people **track moles over time** and prepare for clinician visits. This MCP server lets developers and operators:

- Query educational skin-health knowledge from Claude Desktop / Cursor  
- Prototype assistant flows against a MoleCare-compatible API  
- Explore MLOps tooling with **safe mock data** when no credentials are set  

---

## Quick start

```bash
git clone https://github.com/MoleCare/molecare-mcp.git
cd molecare-mcp
npm install
npm run build
npm start
```

Development (auto-reload):

```bash
npm run dev
```

Inspect tools:

```bash
npm run inspect
```

By default, many clients run in **mock mode** when backends / AWS credentials are missing (`NODE_ENV=development`).

---

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "molecare": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/molecare-mcp/dist/index.js"],
      "env": {
        "MOLECARE_API_URL": "http://localhost:8080/api",
        "MOLECARE_API_KEY": "your-local-api-key"
      }
    }
  }
}
```

Use **localhost** (or your own deployment). Do not paste production keys into config files that sync to cloud drives.

---

## Environment variables

All optional unless you want live backends.

| Variable | Purpose | Example |
|----------|---------|---------|
| `MOLECARE_API_URL` | MoleCare HTTP API | `http://localhost:8080/api` |
| `MOLECARE_API_KEY` | API bearer / key | `local-dev-key` |
| `ONTOLOGY_API_URL` | Ontology service | `http://localhost:8081` |
| `MLFLOW_TRACKING_URI` | MLflow | `http://localhost:5000` |
| `FEAST_REPO_PATH` / feature store URL | Feast | — |
| `AWS_REGION` | EC2 / CloudWatch clients | `us-east-1` |
| `GITHUB_TOKEN` | CI/CD tools | — |
| `PORT` | Optional HTTP `/health` | `3000` |

See [`.env.example`](./.env.example).

---

## Tools (overview)

### Medical / product
| Tool | Description |
|------|-------------|
| `get_user_moles` | List moles for a user id (API) |
| `get_mole_analysis` | Analysis payload for a mole |
| `get_mole_changes` | Change history |
| `get_user_risk_factors` | Risk profile |
| `search_medical_info` | Knowledge base search |
| `compare_moles` | Compare two moles |
| `lookup_medical_concept` | SNOMED lookup |
| `search_medical_concepts` | Search conditions |
| `map_snomed_to_icd10` | Code mapping |
| `assess_risk_from_factors` | Educational risk scoring |
| `classify_lesion_features` | ABCDE-style feature helper |

### Ops / MLOps (mock-friendly)
| Tool | Description |
|------|-------------|
| `get_system_health` | Aggregate health |
| `check_server_health` | API health probe |
| `get_mlflow_experiments` / `get_mlflow_runs` | Experiment tracking |
| `compare_model_runs` | Compare runs |
| `get_ec2_instances` / `get_ec2_metrics` | AWS (needs credentials) |
| `get_pipeline_runs` | CI summary |
| `get_feature_views` | Feature store |

Full list: run MCP Inspector or browse `src/index.ts`.

### Resources
- `molecare://knowledge/*` — ABCDE, Fitzpatrick, prevention, when to see a dermatologist  
- Ontology and ops catalogs (when enabled)

---

## Architecture

```
Claude / Cursor / MCP client
        │ stdio (JSON-RPC)
        ▼
  molecare-mcp
   ├─ medical KB (local)
   ├─ MoleCare API client (optional)
   ├─ ontology / MLflow / Feast clients (optional)
   └─ AWS / CI clients (optional, mock if unset)
        │
        └─ optional HTTP GET /health  (Docker / ECS)
```

---

## Docker

```bash
docker build -t molecare-mcp .
docker run --rm -p 3000:3000 molecare-mcp
curl http://localhost:3000/health
```

---

## Security

- Never commit `.env` files or API keys — see [SECURITY.md](./SECURITY.md) to report a vulnerability  
- Prefer mock mode for demos and screenshots  
- Tools that accept `userId` can return PHI **only if** you point them at a real backend with real auth — treat that as production  
- Rate-limit and auth belong on your API, not only on the MCP process  

---

## Medical disclaimer

MoleCare MCP provides **educational** information and developer tooling. It does **not** diagnose melanoma or any disease. Always consult a qualified clinician for medical concerns.

---

## Development

```bash
npm install
npm run build
npm run dev
npm run inspect
```

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) first — it covers the mock-first rule,
the clinical-safety boundary for anything touching medical content, and how to pick up a `good first issue`.

Please keep secrets out of examples and prefer localhost defaults.

---

## Related

- [Model Context Protocol](https://modelcontextprotocol.io)  
- [MoleCare](https://www.molecare.co.uk/)  
- [MoleCare-ML](https://github.com/MoleCare/MoleCare-ML) — melanoma classification service and training notebooks

---

## License

[Apache-2.0](./LICENSE) © MoleCare LTD
