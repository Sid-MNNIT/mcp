import copy

from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from client.mcp.client import get_mcp_client
from client.llm.openai_client import get_openai_model

# Read-only MCP tools. send_email is left out until there is an approval step.
AGENT_TOOLS = {"search_jobs", "get_job_categories", "get_email_by_id", "draft_reply"}

SYSTEM_PROMPT = (
    "You are Jobsy AI, a job search assistant. "
    "Use the tools to look up jobs and emails instead of guessing. "
    "Answer briefly and only with what the tools returned."
)


def _bind_user(tool, user_id: str) -> StructuredTool:
    """
    Gmail tools need a userId. Hide it from the LLM and fill it in ourselves,
    so the model can never ask for another user's inbox.
    """
    schema = copy.deepcopy(tool.args_schema)
    takes_user = "userId" in schema.get("properties", {})

    if takes_user:
        schema["properties"].pop("userId")
        schema["required"] = [r for r in schema.get("required", []) if r != "userId"]

    async def run(**kwargs):
        if takes_user:
            kwargs["userId"] = user_id
        return await tool.ainvoke(kwargs)

    return StructuredTool(
        name=tool.name,
        description=tool.description,
        args_schema=schema,
        coroutine=run,
    )


async def run_react_agent(user_message: str, user_id: str) -> str:
    mcp = await get_mcp_client()
    mcp_tools = await mcp.get_tools()

    tools = [_bind_user(t, user_id) for t in mcp_tools if t.name in AGENT_TOOLS]
    print(f"🤖 [react_agent] tools: {[t.name for t in tools]}")

    llm = ChatOpenAI(model=get_openai_model(), temperature=0)
    agent = create_react_agent(llm, tools, prompt=SYSTEM_PROMPT)

    result = await agent.ainvoke({"messages": [("user", user_message)]})
    return result["messages"][-1].content
