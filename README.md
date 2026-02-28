# foodPanelAI

The web app is hosted live on nutramap.vercel.app but to test the mcp you'll have to run it locally.
Nutramap is a proof of concept for a human-LLM collaborative workflow + the first ever nutrition tracker with an agentic interface. if you'd like to see it in production please add your email to the list. 

## MCP + CLI tool Quickstart.

Use this if you want an assistant to chat about meals, ask follow-up questions, and log entries using Nutramap.
First, clone this repo to your desktop. 

### 1) Install CLI + MCP package from this repo

```bash
chmod +x run-mcp.sh
./run-mcp.sh
```

### 2) Verify from terminal (optional)

Open a new terminal and test out the CLI. 
```bash
foodpanel auth login
foodPanel log "one small cup vegan chilli"
foodpanel today
```




## 3) LLM Assistant Integration

### ChatGPT Desktop
- Open ChatGPT Desktop.
- Go to Settings.
- Open Connectors / Tools / MCP Servers.
- Click Add server.

Configure:
- Name: foodpanel
- Command: uv
- Arguments: run --project /path/to/nutramap foodpanel-mcp (Use your own local repo path for /path/to/nutramap.)
- Environment variable:
  - `FOODPANEL_API_URL=https://divyavenkatraman234--nutramap-backend-serve.modal.run`

Restart ChatGPT Desktop.

Open a dedicated chat for this with the system prompt. 

```text
"Use $foodpanel-agent. The user will describe meals they had and ask questions about their nutritional intake. Log their meals, custom foods, and edit the logs, stored recipes, and custom foods according to your conversation. Ask follow up questions if anything is unclear."
```

Prompt examples:

```text
I had oatmeal with blueberries and almond butter for breakfast.
Ask follow-up questions if anything is unclear, then log it.
```

```text
Use $foodpanel-agent. Show my logs and stats for yesterday.
```

### Claude Code

These steps are for the Claude Code CLI workflow (not desktop UI).

1. Register local Foodpanel MCP (one-time):

```bash
cd /path/to/nutramap
claude mcp add foodpanel -- uv run --project /path/to/nutramap foodpanel-mcp
```

cd /Users/divyavenn/Documents/GitHub/nutramap
claude mcp add foodpanel -- uv run --project /Users/divyavenn/Documents/GitHub/nutramap foodpanel-mcp


2. Verify configuration:

```bash
claude mcp list
claude mcp get foodpanel
```

3. Install/update the local skill file for Claude Code:

```bash
mkdir -p ~/.claude/skills/foodpanel-agent
cp /path/to/nutramap/skills/foodpanel-agent/SKILL.md ~/.claude/skills/foodpanel-agent/SKILL.md
```
cp /Users/divyavenn/Documents/GitHub/nutramap/skills/foodpanel-agent/SKILL.md ~/.claude/skills/foodpanel-agent/SKILL.md

4. Start Claude Code in your project and invoke the skill:

```text
Use $foodpanel-agent for this session. Call session_info now and show the tool result.
```

### Codex

These steps assume Codex Desktop UI (no manual config file edits).

1. Open Codex Desktop.
2. Go to **Settings**.
3. Open **MCP Servers**.
4. Click **Add Server** and configure:
   - Name: `foodpanel`
   - Command: `uv`
   - Args: `run --project /path/to/nutramap foodpanel-mcp`
5. Save and enable the server.

6. From sidebar, open **Skills**.
7. Use skill installer and tell it to install the skill from https://github.com/divyavenn/nutramap/tree/main/skills/foodpanel-agent
8. Select this folder:
   - `/path/to/nutramap/skills/foodpanel-agent`
9. Confirm installation and enable the skill.

10. Restart Codex Desktop.

Then start a chat with:

```text
Use $foodpanel-agent. I had one small cup vegan chilli. Ask follow-up questions if needed, then log it.
```


## Verify it's running
In chat, run a simple tool call request like:
```text



```

If it returns server info (base_url, has_access_token), MCP is working.

## Deploy MCP to Modal (Remote, Stateless)

This repo now includes a dedicated Modal app for MCP at:

- `foodpanel_mcp/modal_app.py`

Deploy it:

```bash
pip install modal
modal setup

modal deploy foodpanel_mcp/modal_app.py
```

If you need a different backend URL, set `FOODPANEL_API_URL` in Modal app environment settings.

After deploy, your MCP endpoint is:

- `https://<your-workspace>--foodpanel-mcp-serve.modal.run/mcp`

Auth behavior:

- The MCP server is stateless in HTTP mode.
- It does not persist user sessions to disk.
- Send user auth on each request with:
  - `Authorization: Bearer <foodpanel_access_token>`, or
  - `x-foodpanel-access-token: <foodpanel_access_token>`

In stateless mode, `login` returns an `access_token` so clients can cache and reuse it.
 
# Developer Setup

### 🚀 Quick Start

**Local Development (Recommended)**
```bash
# Run both frontend and backend locally
docker compose -f compose.dev.yaml up -d

# Frontend: http://localhost:3001
# Backend: http://localhost:8001/docs
```

**Production Deployment**
```bash
# Deploy backend to Modal (serverless)
cd backend
./deploy-modal.sh

# Deploy frontend with Docker
docker compose up -d
```

📖 **See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment guide**

---

### 🛠️ Manual Setup (Alternative)

#### Backend Package Management (using UV)
```bash
cd backend
uv sync              # Install dependencies
uv run uvicorn main:app --reload  # Run backend
```

#### Frontend Setup
```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Run frontend
```

#### Manual Inspection of Databases
- MongoDB: Use MongoDB Compass or Atlas web interface
- Backend API: http://localhost:8001/docs (FastAPI Swagger UI)
