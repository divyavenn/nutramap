# nutramap/foodPanelAI (name undecided)

Nutramap is a proof of concept for using LLMs heavily in data pipelines but in a transparent, auditable way. It's also the first ever nutrition tracker with an agentic interface. It can turn any chatbot into the best nutritionist money can buy, guaranteed. The web app is hosted live on nutramap.vercel.app but to test agent capablities you'll have to run it locally. If you'd like to see it in production please add your email to the list.

## Agent Setup

Use this if you want an assistant to chat about meals, ask follow-up questions, and log entries using Nutramap.
First, clone this repo to your desktop. If you're using Codex or Claude Code, the binary is recommended. If you're using an LLM without
shell permissions (like bog-standard ChatGPT) you'll have to run the MCP server.


###  Binary quickstart

1) Install binary

```bash
chmod +x install-binary.sh
./install-binary.sh
```

2) Verify from terminal 

Open a new terminal and test out the CLI. 
```bash
foodpanel auth login
foodPanel log "one small cup vegan chilli"
foodpanel today
```

### MCP server quickstart

```bash
chmod +x run-mcp.sh
./run-mcp.sh
```




### Claude Code with CLI

Make sure you have the binary installed.

1. Install the local skill file for Claude Code:

```bash
mkdir -p ~/.claude/skills/foodpanel-cli
```

Now, either copy the skills file over to the claude code's folder...

```bash
cp /path/to/nutramap/skills/foodpanel-cli/SKILL.md ~/.claude/skills/foodpanel-cli/SKILL.md
```

Or set up symlink so updates to the repo are picked up automatically in every new chat (recommended if you keep the repo at a stable path):

```bash
ln -sf /Users/divyavenn/Documents/GitHub/nutramap/skills/foodpanel-cli/SKILL.md ~/.claude/skills/foodpanel-cli/SKILL.md
```


2. (Optional but highly recommended) Pre-approve foodpanel commands so Claude Code never prompts for permission:

Create or edit `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(foodpanel *)",
      "Bash(foodPanel *)"
    ]
  }
}
```
You can also just start claude code and tell claude to do this step.

3. Restart Claude and invoke the skill:

```text
Use $foodpanel-cli for this session. Check what we've eaten today.
```

### Codex with CLI

Make sure you have the binary installed. 

These steps assume Codex Desktop UI (no manual config file edits).

1. From sidebar, open **Skills**.
2. Use skill installer and tell it to install the skill from https://github.com/divyavenn/nutramap/tree/main/skills/foodpanel-cli
3. Select this folder:
   - `/path/to/nutramap/skills/foodpanel-cli`
4. Confirm installation and enable the skill.
5. Restart Codex Desktop.

Then start a chat with:

```text
Use $foodpanel-cli for this session.
```

### ChatGPT Desktop

Make sure you have the MCP installed and running. 

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

Open a dedicated chat for this. Put this in the system prompt.
```text
Use $foodpanel-agent for this session.
```

Check if it works by saying:
```text
Call session_info now and show the tool result.
```

### Claude Code with MCP 

Make sure you have the MCP installed and running. 

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

3. Install the local skill file for Claude Code:

```bash
mkdir -p ~/.claude/skills/foodpanel-agent
cp /path/to/nutramap/skills/foodpanel-agent/SKILL.md ~/.claude/skills/foodpanel-agent/SKILL.md
```

Or symlink so updates to the repo are picked up automatically in every new chat (recommended if you keep the repo at a stable path):

```bash
mkdir -p ~/.claude/skills/foodpanel-agent
ln -sf /path/to/nutramap/skills/foodpanel-agent/SKILL.md ~/.claude/skills/foodpanel-agent/SKILL.md
```

4. Start Claude Code in your project and invoke the skill:

```text
Use $foodpanel-agent for this session. Call session_info now and show the tool result.
```


### Codex with MCP

Make sure you have the MCP installed and running. 

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
Use $foodpanel-agent for this session. Call session_info now and show the tool result.
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
