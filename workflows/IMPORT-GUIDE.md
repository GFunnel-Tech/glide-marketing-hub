# EMM Platform — n8n Workflow Import Guide

## Overview

This directory contains 12 n8n workflow JSON files + 1 shared config file for the Expert Mortgage Marketing platform backend.

## Files

| File | Workflow | Webhook Path | Description |
|------|----------|-------------|-------------|
| `00-client-mapping.json` | — | — | Shared client mapping config (reference only) |
| `01-meta-ads-sync.json` | Meta Ads Sync | `/webhook/meta-ads-sync` | Pulls campaign data from Meta Graph API |
| `02-ghl-pipeline-sync.json` | GHL Pipeline Sync | `/webhook/ghl-sync` | Pulls pipeline/lead data from GoHighLevel |
| `03-sync-all-accounts.json` | Sync All Accounts | `/webhook/sync-all` | Loops all clients through WF1 + WF2 |
| `04-manus-audit.json` | Manus Audit | `/webhook/manus-audit` | Claude-powered account audit |
| `05-form-swap.json` | Form Swap | `/webhook/form-swap` | Creates simplified 3-question lead form |
| `06-budget-scale.json` | Budget Scale | `/webhook/budget-scale` | 20% budget scaling with safety checks |
| `07-pause-campaigns.json` | Pause Campaigns | `/webhook/pause-campaigns` | Pauses campaigns via Meta API |
| `08-monthly-report.json` | Monthly Report | `/webhook/generate-report` | Claude-generated monthly client report |
| `09-clickup-task-creation.json` | ClickUp Tasks | `/webhook/clickup-task` | Creates ClickUp tasks (internal) |
| `10-playai-agent.json` | Play.ai Agent | `/webhook/playai-agent` | Creates/updates Play.ai voice agents |
| `11-ai-chat.json` | AI Chat | `/webhook/ai-chat` | Claude-powered operations assistant |
| `12-export-all-reports.json` | Export All Reports | `/webhook/export-all-reports` | Batch generates all client reports |

## Import Order

Import in this sequence (each workflow may depend on previous ones):

1. `09-clickup-task-creation.json`
2. `01-meta-ads-sync.json`
3. `02-ghl-pipeline-sync.json`
4. `03-sync-all-accounts.json`
5. `04-manus-audit.json`
6. `08-monthly-report.json`
7. `05-form-swap.json`
8. `06-budget-scale.json`
9. `07-pause-campaigns.json`
10. `10-playai-agent.json`
11. `11-ai-chat.json`
12. `12-export-all-reports.json`

## How to Import

1. Open n8n at https://apihub.gfunnel.com
2. Go to **Workflows** > **Import from File**
3. Select the workflow JSON file
4. The workflow will import with all nodes and connections configured

## Required Credentials

Before activating workflows, configure these credentials in n8n:

| Credential | n8n Name | Used By |
|-----------|----------|---------|
| Meta System User Token | `metaAccessToken` | WF1, WF5, WF6, WF7 |
| GHL Agency API Key | `ghlApiKey` | WF2 |
| Anthropic API Key | `anthropicApiKey` | WF4, WF8, WF11 |
| ClickUp Personal Token | `clickUpApiToken` | WF9 |
| Play.ai API Key | `playAiApiKey` | WF10 |

## PLACEHOLDER Values to Replace

Search for `PLACEHOLDER` across all workflow files and replace with actual IDs:

- `act_PLACEHOLDER_X` → Real Meta Ad Account IDs
- `PLACEHOLDER_GHL_X` → Real GHL Location IDs
- `PLACEHOLDER_PLAI_X` → Real Plai Account IDs
- `PAGE_ID_X` → Real Facebook Page IDs
- `LIST_ID_*` → Real ClickUp List IDs
- `CLICKUP_USER_*` → Real ClickUp User IDs

## Safety Guards

- **Jason Gilmore (ID 8)** is flagged `uphex: true` — all write operations (form swap, budget scale, pause) are blocked
- **Chad (ID 10) and Kelto (ID 11)** use CAD currency
- Budget scaling validates UPHEX status before proceeding
- All responses include `Access-Control-Allow-Origin: *` for Lovable frontend

## Testing

After importing and configuring credentials:

```bash
# Test Meta Sync
curl -X POST https://apihub.gfunnel.com/webhook/meta-ads-sync \
  -H "Content-Type: application/json" \
  -d '{"clientId": "3"}'

# Test GHL Sync
curl -X POST https://apihub.gfunnel.com/webhook/ghl-sync \
  -H "Content-Type: application/json" \
  -d '{"clientId": "8"}'

# Test AI Chat
curl -X POST https://apihub.gfunnel.com/webhook/ai-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the blended CPL across the portfolio?", "context": {}}'
```
