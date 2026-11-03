# Jobsy 3.0

Job hunting is mostly admin: checking inboxes for recruiter replies, keeping track of which applications went where, scheduling interviews, tweaking your resume for the tenth time. Jobsy is my attempt to take that admin off your plate. You connect your Gmail and Google Calendar, upload your resume, and then just ask it things in plain English, like *"did Amazon get back to me?"*, *"when is my next interview?"* or *"find me backend roles in Bangalore that match my skills"*.

I built it as a full-stack project to learn how to wire an LLM to real tools (Gmail, Calendar, a job search API, a resume parser) using the Model Context Protocol (MCP).

## What it can do

- **Ask Jobsy**: a chat assistant that understands what you want and runs the right action.
- **Email**: syncs job-related emails, summarises them into a digest, answers questions about a specific company's email, and drafts replies. Nothing is sent until you approve it.
- **Calendar**: pulls interviews out of emails, creates events, and shows what's coming up.
- **Jobs**: search by keyword and location, get recommendations based on your profile, and see jobs ranked against your skills.
- **Resume**: parses an uploaded resume, gives an ATS score, and suggests improvements.
- **Interview prep**: pulls together your resume and the relevant emails to prepare you for an upcoming interview.
- **Application tracking**: stats and follow-up nudges for the applications you've made.

## How it's put together

There are three services plus the MCP servers they talk to:

```
React (Vite)  ──►  Node/Express backend  ──►  Chat API (FastAPI)
  frontend          auth, profile, MongoDB       planner + memory
                    Google OAuth, email sync          │
                           ▲                          ▼
                           └────────────  Orchestrator (FastAPI)
                                            pipelines for email, jobs,
                                            calendar, resume
                                                      │
                                      MCP servers (Gmail, Job Search,
                                      Resume, Calendar)
```

| Folder | What lives there |
| --- | --- |
| `frontend/` | React 19 + Vite app (dashboard, jobs, emails, resume, settings) |
| `backend/` | Node/Express API with MongoDB, Google OAuth, Cloudinary uploads and the email sync cron job |
| `client/ask_jobsy/` | The chat API: planner, executor, Redis-backed conversation memory |
| `client/orchestrator/` | The pipelines that do the real work (email, jobs, calendar, resume agents) |
| `client/llm/` | OpenAI and Groq clients, prompts, job matching and ranking |
| `mcp_servers/` | `gmail_mcp`, `job_search_mcp`, `resume_mcp`, `calendar_mcp` |
| `docs/` | Notes on architecture, agent flow and MCP contracts |

### How a chat message is handled today

1. The message goes to the chat API, along with recent history from Redis and the user's profile.
2. A planner (GPT-4o-mini with a strict JSON prompt) decides whether it's plain conversation or an action, and which pipeline to run.
3. The executor calls that pipeline on the orchestrator, which uses the MCP tools to do the work.
4. The result is turned into a reply and saved to the conversation history.

So right now the LLM chooses *what* to run, but each pipeline's steps are fixed in code. Making Jobsy a proper tool-calling agent (where the model decides which tools to call, in what order, and reacts to what comes back) is the next big step. See the roadmap below.

## Tech stack

- **Frontend:** React 19, React Router, Vite
- **Backend:** Node.js, Express 5, MongoDB (Mongoose), node-cron
- **AI services:** Python 3.12, FastAPI, FastMCP / MCP, OpenAI, Groq, Redis
- **Parsing:** PyMuPDF, pdfplumber, spaCy, python-docx, BeautifulSoup
- **Deployment:** Docker on Render (backend, orchestrator and chat as separate services), frontend on Vercel

## Running it locally

You'll need Node 20+, Python 3.12, MongoDB, and Redis. Google OAuth credentials and API keys for OpenAI, Groq and Adzuna are also needed.

**1. Environment files.** Copy the variables listed in `render.yaml` into a `.env` in the root, one in `backend/`, and one in `frontend/`. Keep `SERVICE_KEY` identical across the backend and the Python services. None of these files should ever be committed.

**2. Backend**
```bash
cd backend
npm install
npm run dev
```

**3. Python services** (from the project root, in a virtual environment)
```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm

# resume MCP server (the orchestrator expects it on port 8001)
cd mcp_servers/resume_mcp && python main.py

# orchestrator (in another terminal, from the root)
uvicorn client.orchestrator.client:app --port 9000

# chat API (in another terminal, from the root)
uvicorn client.ask_jobsy.chat_api:app --port 9100
```
The Gmail and Job Search MCP servers don't need starting by hand. The orchestrator launches them itself when it needs them.

If you want to wipe saved chat history while developing, run `python flush_chat_history.py`.

**4. Frontend**
```bash
cd frontend
npm install
npm run dev
```
Then open http://localhost:5173.

## Deployment

`render.yaml` describes the three Render services and `vercel.json` handles the frontend. The two Dockerfiles (`Dockerfile.backend` and `Dockerfile.python`) need LF line endings, which `.gitattributes` enforces. On Windows, if a container ever complains about `/bin/sh^M`, that's the cause.

## Roadmap

- [ ] Turn the planner/pipeline setup into a real tool-calling agent using LangGraph, with the MCP servers exposed directly as tools
- [ ] Human approval step before anything risky, like sending an email
- [ ] Move conversation memory to a proper checkpointer
- [ ] Stream agent progress to the chat UI
- [ ] Fill out the `docs/` folder
- [ ] Enable the calendar MCP server in the orchestrator

## Notes

This is a personal learning project, so expect rough edges. Issues and suggestions are welcome.
