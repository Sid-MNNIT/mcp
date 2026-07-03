from pathlib import Path
import os
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[2]

PYTHON = sys.executable


def _child_env():
    """
    Build the environment for stdio MCP subprocesses.

    Some MCP client implementations strip the parent environment when
    spawning a stdio child, leaving critical vars (BACKEND_URL,
    SERVICE_KEY, GROQ_API_KEY, etc.) undefined inside the subprocess.
    Passing os.environ explicitly guarantees the child sees the same
    config the orchestrator was launched with.
    """
    return {**os.environ}


SERVERS = {
    "gmail": {
        "command": str(PYTHON),
        "args": ["main.py"],
        "cwd": str(PROJECT_ROOT / "mcp_servers" / "gmail_mcp"),
        "transport": "stdio",
        "env": _child_env(),
    },
    "resume": {
        "url": "http://127.0.0.1:8001/mcp",
        "transport": "streamable_http",
    },
    "job_search": {
        "command": str(PYTHON),
        "args": ["main.py"],
        "cwd": str(PROJECT_ROOT / "mcp_servers" / "job_search_mcp"),
        "transport": "stdio",
        "env": _child_env(),
    },
    #  "calendar": {
    # "command": str(PYTHON),
    # "args": ["main.py"],
    # "cwd": str(PROJECT_ROOT / "mcp_servers" / "calendar_mcp"),
    # "transport": "stdio",
    # "env": _child_env(),
    # },
}
