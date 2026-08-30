# MoleCare MCP Server

[![npm version](https://img.shields.io/npm/v/molecare-mcp)](https://www.npmjs.com/package/molecare-mcp)
[![npm downloads](https://img.shields.io/npm/dw/molecare-mcp)](https://www.npmjs.com/package/molecare-mcp)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple.svg)](https://modelcontextprotocol.io)
[![Contributors](https://img.shields.io/github/contributors/MoleCare/molecare-mcp)](https://github.com/MoleCare/molecare-mcp#contributors)

**Model Context Protocol (MCP) server** that gives Claude and other MCP clients access to:

1. **Dermatology knowledge** — ABCDE education, SNOMED CT / ICD-10 helpers, risk-factor prompts  
2. **Optional MoleCare API tools** — moles, trends, analysis (your backend + API key)  
3. **Optional MLOps / ops tools** — shipped as a *separate* binary, `molecare-ops-mcp` (mock-first)

> **Not a medical device.** Outputs are educational and operational aids only. Do not use for diagnosis or treatment decisions.

Product site: [molecare.co.uk](https://www.molecare.co.uk/) · App: [iOS](https://apps.apple.com/us/app/molecare/id1448635328) · [Android](https://play.google.com/store/apps/details?id=com.mymolecare)

<p align="center">
  <img src="docs/demo.gif" alt="npx -y molecare-mcp answering a SNOMED CT to ICD-10 lookup with no credentials configured" width="760">
</p>

<p align="center"><em>One command, no API key, no database. Real output from the published package.</em></p>

---

## Why this exists

MoleCare helps people **track moles over time** and prepare for clinician visits. This MCP server lets developers and operators:

- Query educational skin-health knowledge from Claude Desktop / Cursor  
- Prototype assistant flows against a MoleCare-compatible API  
- Explore MLOps tooling with **safe mock data** when no credentials are set  

---

## Quick start

No credentials, no database, no cloud account. Add this to your MCP client config
and restart it:

```json
{
  "mcpServers": {
    "molecare": {
      "command": "npx",
      "args": ["-y", "molecare-mcp"]
    }
  }
}
```

For Claude Desktop on macOS that file is
`~/Library/Application Support/Claude/claude_desktop_config.json`.

The dermatology knowledge tools work immediately — they read from a knowledge base
bundled in the package. Everything that talks to a backend returns clearly-labelled
mock data until you configure it, so you can explore the whole tool surface before
deciding whether you want any of it.

To try it without a client at all:

```bash
npx -y molecare-mcp
```

It starts and waits on stdio. No output means it is working.

---

## Connecting a real backend

Only needed if you are running a MoleCare-compatible API:

```json
{
  "mcpServers": {
    "molecare": {
      "command": "npx",
      "args": ["-y", "molecare-mcp"],
      "env": {
        "MOLECARE_API_URL": "http://localhost:8080/api",
        "MOLECARE_API_KEY": "your-local-api-key"
      }
    }
  }
}
```

Use **localhost** (or your own deployment). Do not paste production keys into config
files that sync to cloud drives.

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
| `MCP_HEALTH_PORT` | Bind an HTTP `/health` endpoint. Unset by default — stdio clients do not need it | `3000` |
| `PORT` | Same, for container health probes | `3000` |

See [`.env.example`](./.env.example).

---

## Tools

### Dermatology knowledge — no setup required

These are the reason most people install this. They answer from a bundled knowledge
base and need no API, no key, and no network.

| Tool | Description |
|------|-------------|
| `search_medical_info` | Search the dermatology knowledge base |
| `lookup_medical_concept` | Look up a SNOMED CT concept |
| `search_medical_concepts` | Search conditions by name or description |
| `map_snomed_to_icd10` | Map a SNOMED CT code to ICD-10 |
| `classify_lesion_features` | ABCDE-style feature descriptors for a lesion |
| `assess_risk_from_factors` | Educational risk scoring from stated risk factors |
| `get_condition_risk_factors` | Known risk factors for a condition |
| `get_condition_progression` | Typical progression stages for a condition |
| `get_malignant_conditions` | Malignant skin conditions with codes |

**Resources:** `molecare://knowledge/*` — ABCDE criteria, Fitzpatrick skin types,
prevention, when to see a dermatologist, SNOMED CT and ICD-10 references.

### MoleCare product data — needs an API

Returns labelled mock data until `MOLECARE_API_URL` is set.

| Tool | Description |
|------|-------------|
| `get_user_moles` | List moles for a user id |
| `get_mole_analysis` | Analysis payload for a mole |
| `get_mole_changes` | Change history for a mole |
| `get_user_risk_factors` | A user's risk profile |
| `compare_moles` | Compare two moles |

<details>
<summary><b>Operations and MLOps tooling</b> (39 tools — separate <code>molecare-ops-mcp</code> binary)</summary>

These exist because MoleCare operates this stack from an assistant. They are of
little use outside that context, and all of them return mock data unless the
matching backend is configured.

**They are not part of the `molecare-mcp` tool list.** Loading 39 infrastructure
tools that nobody outside MoleCare can use made it measurably harder for a model
to pick the right dermatology tool, so they live in their own server:

```json
{
  "mcpServers": {
    "molecare-ops": {
      "command": "npx",
      "args": ["-y", "-p", "molecare-mcp", "molecare-ops-mcp"]
    }
  }
}
```

| Area | Tools |
|------|-------|
| Health | `get_system_health`, `check_server_health`, `get_service_health`, `clear_cache` |
| MLflow | `get_mlflow_experiments`, `get_mlflow_runs`, `get_registered_models`, `get_model_version`, `compare_model_runs`, `get_training_runs` |
| Feature store | `get_feature_views`, `get_feature_view_details`, `get_feature_freshness`, `get_online_features`, `get_feature_store_stats` |
| CI/CD | `get_pipeline_runs`, `get_pipeline_summary`, `get_deployments`, `get_deployment_status`, `get_releases` |
| AWS | `get_ec2_instances`, `get_ec2_instance`, `get_ec2_health`, `get_ec2_metrics` |
| Apps | `get_app_status`, `get_web_app_status`, `get_mobile_api_status`, `get_all_apps_status`, `get_app_metrics`, `get_app_errors`, `get_app_versions`, `get_app_store_status` |
| Database | `get_database_status`, `get_database_metrics`, `get_slow_queries`, `get_table_stats`, `get_backup_history`, `get_connection_pools` |
| Kubernetes | `get_kubernetes_status` |

The AWS tools need `@aws-sdk/client-ec2` and `@aws-sdk/client-cloudwatch`, which are
**optional peer dependencies** — they are not installed by default, because they add
33 MB that nobody wanting the dermatology tools should have to download. Install them
yourself if you want live AWS data:

```bash
npm i @aws-sdk/client-ec2 @aws-sdk/client-cloudwatch
```

</details>

---

## Architecture

```
Claude / Cursor / MCP client
        │ stdio (JSON-RPC)
        ▼
  molecare-mcp                    molecare-ops-mcp
   ├─ medical KB (local)           ├─ MLflow / Feast clients
   ├─ MoleCare API client          ├─ AWS / CI / K8s clients
   └─ ontology client              └─ database / app clients
        │    (14 tools)                 │   (39 tools, internal)
        │                               │
        └───────────┬───────────────────┘
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
git clone https://github.com/MoleCare/molecare-mcp.git
cd molecare-mcp
npm install
npm run build
npm run dev      # auto-reload
npm run inspect  # browse tools in MCP Inspector
```

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) first — it covers the mock-first rule,
the clinical-safety boundary for anything touching medical content, and how to pick up a `good first issue`.

Please keep secrets out of examples and prefer localhost defaults.

---

## Related

> **Environment variables:** `.env.example` is the authoritative list (all 27 variables read by the source). Regenerate the ground truth with `grep -rhoE "process\.env\.[A-Z_0-9]+" src/`. `ONTOLOGY_API_URL` and `FEAST_REPO_PATH` are not read by any source file.

- [Model Context Protocol](https://modelcontextprotocol.io)  
- [MoleCare](https://www.molecare.co.uk/)  
- [MoleCare-ML](https://github.com/MoleCare/MoleCare-ML) — melanoma classification service and training notebooks

---

## Contributors

Thank you to everyone who has helped molecare-mcp.

<!-- readme: contributors,bots/- -start -->
<table>
	<tbody>
		<tr>
			<td align="center">
				<a href="https://github.com/YauhenBichel">
					<img src="https://avatars.githubusercontent.com/YauhenBichel?s=48" width="48" alt="Yauhen Bichel" />
					<br />
					<sub><b>Yauhen Bichel</b></sub>
				</a>
			</td>
			<td align="center">
				<a href="https://github.com/komallsingh">
					<img src="https://avatars.githubusercontent.com/komallsingh?s=48" width="48" alt="Komal Singh" />
					<br />
					<sub><b>Komal Singh</b></sub>
				</a>
			</td>
			<td align="center">
				<a href="https://github.com/kkkhs">
					<img src="https://avatars.githubusercontent.com/kkkhs?s=48" width="48" alt="Huangshuo Kuang" />
					<br />
					<sub><b>Huangshuo Kuang</b></sub>
				</a>
			</td>
			<td align="center">
				<a href="https://github.com/YuuGR1337">
					<img src="https://avatars.githubusercontent.com/YuuGR1337?s=48" width="48" alt="Elkero" />
					<br />
					<sub><b>Elkero</b></sub>
				</a>
			</td>
		</tr>
	</tbody>
</table>
<!-- readme: contributors,bots/- -end -->

The list is filled by [Contributors](./.github/workflows/contributors.yml) from
GitHub commits, bots omitted — never hand-maintained, because a stale list is
worse than none. [Contributor graph](https://github.com/MoleCare/molecare-mcp/graphs/contributors) ·
[good first issue](https://github.com/MoleCare/molecare-mcp/labels/good%20first%20issue)

## License

[Apache-2.0](./LICENSE) © MoleCare LTD
