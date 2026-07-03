#!/bin/sh
# ──────────────────────────────────────────────────────────────
# Orchestrator container entrypoint.
#
# Runs TWO Python processes:
#   1. resume_mcp on port 8001 (internal only — 127.0.0.1)
#      The orchestrator calls it via http://127.0.0.1:8001/mcp
#      as configured in client/mcp/server.py.
#
#   2. orchestrator FastAPI on $PORT (Render sets this; default 9000).
#      This is what Render exposes to the public internet.
#
# Gmail MCP + Job Search MCP are stdio subprocesses that the
# orchestrator itself spawns when first invoked, so no explicit
# start command is needed for them.
# ──────────────────────────────────────────────────────────────
set -e

# 1. Start resume_mcp in the background
echo "▶ Starting resume_mcp on 127.0.0.1:8001..."
cd /app/mcp_servers/resume_mcp
python main.py &
RESUME_PID=$!

# Wait up to 15s for resume_mcp to respond before starting the orchestrator
cd /app
for i in $(seq 1 15); do
    if curl -s -o /dev/null http://127.0.0.1:8001/mcp; then
        echo "✓ resume_mcp is up"
        break
    fi
    sleep 1
done

# 2. Start orchestrator in the foreground (this is the process Render watches)
PORT="${PORT:-9000}"
echo "▶ Starting orchestrator on 0.0.0.0:${PORT}..."
exec uvicorn client.orchestrator.client:app --host 0.0.0.0 --port "${PORT}"
