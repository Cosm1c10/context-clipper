import os
import re
import json
import uuid
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, HTTPException, Header, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
import google.generativeai as genai
from supabase import create_client
from dotenv import load_dotenv
from pathlib import Path
import yaml

# Load .env from the same directory as this file
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Warning: SUPABASE_URL or SUPABASE_KEY not found in .env")

# Do NOT configure genai globally — it's per-request now (BYOK)

# Initialize Supabase client (uses service_role key, bypasses RLS)
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models ---

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None

class SaveRequest(BaseModel):
    text: Optional[str] = None
    url: str
    metadata: Optional[dict] = None
    project_id: Optional[str] = None
    media_type: Optional[str] = "text"
    image_url: Optional[str] = None
    file_name: Optional[str] = None
    screenshot_data: Optional[str] = None

class ChatRequest(BaseModel):
    question: str

# --- Dependencies ---

async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """Extract user_id from Supabase JWT."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid auth token")
    token = authorization.replace("Bearer ", "")
    try:
        user_response = await run_in_threadpool(
            lambda: sb.auth.get_user(token)
        )
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return str(user_response.user.id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth failed: {str(e)}")


def get_gemini_key(x_gemini_key: Optional[str] = Header(None)) -> str:
    """Get Gemini API key from request header, fallback to env."""
    key = x_gemini_key or GEMINI_API_KEY
    if not key:
        raise HTTPException(
            status_code=400,
            detail="No Gemini API key provided. Please add your key in extension settings."
        )
    return key


# --- Helpers for thread pool ---

def _embed_content(text, api_key, task_type="retrieval_document", title="Context Clip"):
    """Generate embedding using per-request API key."""
    genai.configure(api_key=api_key)
    result = genai.embed_content(
        model="models/gemini-embedding-001",
        content=text,
        task_type=task_type,
        title=title
    )
    return result['embedding']


# --- Clips ---

@app.post("/save")
async def save_clip(
    request: SaveRequest,
    user_id: str = Depends(get_current_user),
    gemini_key: str = Depends(get_gemini_key),
):
    try:
        embed_text = request.text or ""
        if not embed_text and request.file_name:
            embed_text = f"File: {request.file_name}"
        if not embed_text and request.image_url:
            embed_text = f"Image from {request.url}"
        if not embed_text:
            embed_text = f"Screenshot of {request.url}"

        embedding = await run_in_threadpool(_embed_content, embed_text, gemini_key)

        record_id = str(uuid.uuid4())
        metadata = request.metadata or {}
        title = metadata.get('title', '')
        domain = metadata.get('domain', '')
        text_for_count = request.text or ""
        word_count = metadata.get('wordCount', len(text_for_count.split()) if text_for_count.strip() else 0)

        row = {
            "id": record_id,
            "text": request.text or "",
            "url": request.url,
            "title": title,
            "domain": domain,
            "word_count": word_count,
            "timestamp": datetime.now().isoformat(),
            "project_id": request.project_id,
            "embedding": embedding,
            "media_type": request.media_type or "text",
            "image_url": request.image_url,
            "file_name": request.file_name,
            "screenshot_data": request.screenshot_data,
            "user_id": user_id,
        }

        await run_in_threadpool(lambda: sb.table("clips").insert(row).execute())

        return {"status": "success", "id": record_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error saving clip: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/clips")
async def save_clip_alt(
    request: SaveRequest,
    user_id: str = Depends(get_current_user),
    gemini_key: str = Depends(get_gemini_key),
):
    return await save_clip(request, user_id, gemini_key)

@app.get("/clips")
async def get_clips(
    limit: int = 50,
    offset: int = 0,
    project_id: str = None,
    user_id: str = Depends(get_current_user),
):
    try:
        def _query():
            query = sb.table("clips").select("id, text, url, title, domain, word_count, timestamp, project_id, media_type, image_url, file_name, screenshot_data")
            query = query.eq("user_id", user_id)
            if project_id:
                query = query.eq("project_id", project_id)
            return query.order("timestamp", desc=True).range(offset, offset + limit - 1).execute()

        def _count():
            count_query = sb.table("clips").select("id", count="exact")
            count_query = count_query.eq("user_id", user_id)
            if project_id:
                count_query = count_query.eq("project_id", project_id)
            return count_query.execute()

        result, count_result = await run_in_threadpool(lambda: (_query(), _count()))
        clips = result.data
        total = count_result.count if count_result.count is not None else len(clips)

        return {
            "clips": clips,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting clips: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/clips/{clip_id}")
async def delete_clip(
    clip_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        result = await run_in_threadpool(
            lambda: sb.table("clips").delete().eq("id", clip_id).eq("user_id", user_id).execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Clip not found")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/clips/{clip_id}")
async def update_clip(
    clip_id: str,
    request: SaveRequest,
    user_id: str = Depends(get_current_user),
    gemini_key: str = Depends(get_gemini_key),
):
    try:
        text_content = request.text or ""
        word_count = len(text_content.split()) if text_content.strip() else 0

        embed_text = text_content or f"Clip from {request.url}"
        embedding = await run_in_threadpool(_embed_content, embed_text, gemini_key)

        result = await run_in_threadpool(
            lambda: sb.table("clips").update({
                "text": text_content,
                "word_count": word_count,
                "embedding": embedding,
            }).eq("id", clip_id).eq("user_id", user_id).execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Clip not found")
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Chat (Semantic Search + AI) ---

@app.post("/chat")
async def chat(
    request: ChatRequest,
    user_id: str = Depends(get_current_user),
    gemini_key: str = Depends(get_gemini_key),
):
    try:
        question_embedding = await run_in_threadpool(
            _embed_content, request.question, gemini_key, "retrieval_query"
        )

        rpc_result = await run_in_threadpool(
            lambda: sb.rpc("match_clips", {
                "query_embedding": question_embedding,
                "match_count": 5,
                "filter_user_id": user_id,
            }).execute()
        )

        context = ""
        for row in (rpc_result.data or []):
            text = row.get("text", "")
            url = row.get("url", "")
            context += f"Source ({url}): {text}\n\n"

        if not context:
            return {"answer": "No relevant context found to answer your question."}

        def _generate():
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel('gemini-2.5-flash')
            prompt = f"Answer the question based on the following context:\n\n{context}\n\nQuestion: {request.question}"
            return model.generate_content(prompt)

        response = await run_in_threadpool(_generate)
        return {"answer": response.text}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Projects ---

@app.post("/projects")
async def create_project(
    project: ProjectCreate,
    user_id: str = Depends(get_current_user),
):
    try:
        project_id = str(uuid.uuid4())
        await run_in_threadpool(
            lambda: sb.table("projects").insert({
                "id": project_id,
                "name": project.name,
                "description": project.description,
                "user_id": user_id,
            }).execute()
        )
        return {"id": project_id, "status": "created"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects")
async def list_projects(user_id: str = Depends(get_current_user)):
    try:
        result = await run_in_threadpool(
            lambda: sb.table("projects").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        )
        projects = result.data

        # Fix N+1: get all clip counts in a single query grouped by project_id
        try:
            clip_counts_result = await run_in_threadpool(
                lambda: sb.rpc("get_project_clip_counts", {"filter_user_id": user_id}).execute()
            )
            count_map = {}
            if clip_counts_result.data:
                for row in clip_counts_result.data:
                    count_map[row["project_id"]] = row["clip_count"]
            for p in projects:
                p["clip_count"] = count_map.get(p["id"], 0)
        except Exception:
            # Fallback: per-project count
            for p in projects:
                count_result = await run_in_threadpool(
                    lambda pid=p["id"]: sb.table("clips").select("id", count="exact").eq("project_id", pid).eq("user_id", user_id).execute()
                )
                p["clip_count"] = count_result.count if count_result.count is not None else 0

        return projects
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        result = await run_in_threadpool(
            lambda: sb.table("projects").delete().eq("id", project_id).eq("user_id", user_id).execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/export")
async def export_project_context(
    project_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        result = await run_in_threadpool(
            lambda: sb.table("clips").select("text, url, title, timestamp").eq("project_id", project_id).eq("user_id", user_id).order("timestamp").execute()
        )
        clips = result.data

        if not clips:
            return {"context": "No clips in this project."}

        context_parts = []
        for i, clip in enumerate(clips, 1):
            date_str = clip.get('timestamp', 'Unknown Date')
            part = f"--- Clip {i} ---\nSource: {clip.get('title', '')} ({clip.get('url', '')})\nDate: {date_str}\n\n{clip['text']}\n"
            context_parts.append(part)

        full_context = "\n".join(context_parts)
        return {"context": full_context, "clip_count": len(clips)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error exporting project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Context Bridge ---

_bridge_cache: dict = {}


def build_meta(clips, project):
    domains = set()
    for c in clips:
        d = c.get("domain", "")
        if d:
            domains.add(d)
    return {
        "source_platform": ", ".join(sorted(domains)) if domains else "Unknown",
        "exported_at": datetime.now().isoformat() + "Z",
        "total_clips": len(clips),
        "project_name": project.get("name", "Unknown") if project else "Unknown",
        "bridge_version": "1.0",
    }


def build_timeline(clips):
    sorted_clips = sorted(clips, key=lambda c: c.get("timestamp", ""))
    timeline = []
    for c in sorted_clips:
        ts = c.get("timestamp", "")
        date_str = ts[:10] if len(ts) >= 10 else "Unknown"
        title = c.get("title", "")
        text = c.get("text", "")
        event = title if title else text[:120]
        source = c.get("domain", "")
        timeline.append({"date": date_str, "event": event, "source": source})
    return timeline


def extract_entities(clips):
    people = set()
    companies = set()
    name_pattern = re.compile(r'\b([A-Z][a-z]+ (?:[A-Z][a-z]+ ?){1,3})\b')
    for c in clips:
        text = c.get("text", "")
        for match in name_pattern.findall(text):
            people.add(match.strip())
        domain = c.get("domain", "")
        if domain:
            company = domain.replace("www.", "").split(".")[0]
            if len(company) > 2:
                companies.add(company.capitalize())
    return {
        "people": sorted(list(people))[:10],
        "companies": sorted(list(companies))[:5],
    }


def extract_key_exchanges(clips):
    exchanges = []
    chat_pattern = re.compile(r'^\[([^\]]+)\]:\s*(.+)', re.MULTILINE)
    quote_pattern = re.compile(r'^>\s*(.+)', re.MULTILINE)
    for c in clips:
        text = c.get("text", "")
        for match in chat_pattern.finditer(text):
            role = match.group(1)
            content = match.group(2)[:200]
            exchanges.append({"speaker": role, "quote": content})
            if len(exchanges) >= 10:
                return exchanges
        for match in quote_pattern.finditer(text):
            content = match.group(1)[:200]
            exchanges.append({"speaker": "quoted", "quote": content})
            if len(exchanges) >= 10:
                return exchanges
    return exchanges[:10]


async def synthesize_bridge_sections(clips, project_name, api_key):
    """Single Gemini Flash call for synthesis sections."""
    summaries = []
    total_chars = 0
    for c in clips:
        text = c.get("text", "")
        title = c.get("title", "")
        snippet = f"[{title}]: {text[:500]}"
        if total_chars + len(snippet) > 8000:
            break
        summaries.append(snippet)
        total_chars += len(snippet)

    condensed = "\n---\n".join(summaries)

    prompt = f"""Analyze these clips from project "{project_name}" and return ONLY a JSON object with these keys:

1. "situation": {{
     "summary": "2-3 sentence overview of what these clips are about",
     "current_status": "one-line status",
     "urgency": "Low/Medium/High with brief reason"
   }}
2. "decisions": [list of {{"decision": "what was decided", "reason": "why"}}] (max 5)
3. "strategic_context": "1-2 paragraph bigger picture"
4. "instructions_for_llm": "bullet points of how to use this context"

Keep total output under 400 tokens. Return ONLY valid JSON, no markdown fences.

Clips:
{condensed}"""

    try:
        genai.configure(api_key=api_key)

        def _generate():
            model = genai.GenerativeModel('gemini-2.0-flash')
            return model.generate_content(prompt)

        response = await run_in_threadpool(_generate)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw)
        result = json.loads(raw)
        return result
    except Exception as e:
        print(f"Bridge synthesis error: {e}")
        return {
            "situation": {
                "summary": f"Project '{project_name}' contains {len(clips)} clips.",
                "current_status": "Context available",
                "urgency": "Low",
            },
            "decisions": [],
            "strategic_context": f"Collection of {len(clips)} clips across various sources.",
            "instructions_for_llm": "Use the clips and entities above as context for the conversation.",
        }


def enforce_token_budget(bridge, max_tokens=1500):
    """Progressively truncate to stay within token budget."""
    def estimate_tokens(obj):
        text = yaml.dump(obj, sort_keys=False, allow_unicode=True)
        return int(len(text.split()) * 1.3)

    if estimate_tokens(bridge) > max_tokens and "key_exchanges" in bridge:
        bridge["key_exchanges"] = bridge["key_exchanges"][:2]

    if estimate_tokens(bridge) > max_tokens and "timeline" in bridge:
        bridge["timeline"] = bridge["timeline"][-3:]

    if estimate_tokens(bridge) > max_tokens and "strategic_context" in bridge:
        ctx = bridge["strategic_context"]
        if isinstance(ctx, str) and len(ctx) > 200:
            bridge["strategic_context"] = ctx[:200] + "..."

    return bridge


def bridge_to_yaml(bridge):
    return yaml.dump(bridge, sort_keys=False, allow_unicode=True, default_flow_style=False)


def bridge_to_markdown(bridge):
    lines = []

    meta = bridge.get("meta", {})
    if meta:
        lines.append("## Metadata")
        for k, v in meta.items():
            lines.append(f"- **{k}**: {v}")
        lines.append("")

    situation = bridge.get("situation", {})
    if situation:
        lines.append("## Situation")
        if isinstance(situation, dict):
            if situation.get("summary"):
                lines.append(situation["summary"])
            if situation.get("current_status"):
                lines.append(f"\n**Status:** {situation['current_status']}")
            if situation.get("urgency"):
                lines.append(f"**Urgency:** {situation['urgency']}")
        else:
            lines.append(str(situation))
        lines.append("")

    entities = bridge.get("entities", {})
    if entities:
        lines.append("## Entities")
        people = entities.get("people", [])
        if people:
            lines.append("**People:** " + ", ".join(people))
        companies = entities.get("companies", [])
        if companies:
            lines.append("**Companies:** " + ", ".join(companies))
        lines.append("")

    decisions = bridge.get("decisions", [])
    if decisions:
        lines.append("## Decisions")
        for d in decisions:
            if isinstance(d, dict):
                lines.append(f"- **{d.get('decision', '')}** — {d.get('reason', '')}")
            else:
                lines.append(f"- {d}")
        lines.append("")

    timeline = bridge.get("timeline", [])
    if timeline:
        lines.append("## Timeline")
        for t in timeline:
            if isinstance(t, dict):
                lines.append(f"- **{t.get('date', '')}**: {t.get('event', '')} ({t.get('source', '')})")
            else:
                lines.append(f"- {t}")
        lines.append("")

    exchanges = bridge.get("key_exchanges", [])
    if exchanges:
        lines.append("## Key Exchanges")
        for e in exchanges:
            if isinstance(e, dict):
                lines.append(f"> **{e.get('speaker', '')}**: {e.get('quote', '')}")
            else:
                lines.append(f"> {e}")
        lines.append("")

    strategic = bridge.get("strategic_context")
    if strategic:
        lines.append("## Strategic Context")
        lines.append(str(strategic))
        lines.append("")

    instructions = bridge.get("instructions_for_llm")
    if instructions:
        lines.append("## Instructions for LLM")
        lines.append(str(instructions))
        lines.append("")

    return "\n".join(lines)


@app.get("/projects/{project_id}/bridge")
async def get_project_bridge(
    project_id: str,
    format: str = Query("yaml", pattern="^(yaml|json|markdown)$"),
    compact: bool = Query(False),
    user_id: str = Depends(get_current_user),
    gemini_key: str = Depends(get_gemini_key),
):
    try:
        clips_result = await run_in_threadpool(
            lambda: sb.table("clips").select(
                "text, url, title, domain, word_count, timestamp"
            ).eq("project_id", project_id).eq("user_id", user_id).order("timestamp").execute()
        )
        clips = clips_result.data

        if not clips:
            return {"bridge": "No clips in this project.", "clip_count": 0}

        proj_result = await run_in_threadpool(
            lambda: sb.table("projects").select("*").eq("id", project_id).eq("user_id", user_id).execute()
        )
        project = proj_result.data[0] if proj_result.data else {}

        # Mechanical extraction
        meta = build_meta(clips, project)
        timeline = build_timeline(clips)
        entities = extract_entities(clips)
        key_exchanges = extract_key_exchanges(clips)

        # Cache key
        latest_ts = max(c.get("timestamp", "") for c in clips)
        cache_key = (project_id, latest_ts, len(clips))

        if cache_key in _bridge_cache:
            synth = _bridge_cache[cache_key]
        else:
            synth = await synthesize_bridge_sections(clips, meta["project_name"], gemini_key)
            _bridge_cache[cache_key] = synth

        bridge = {
            "meta": meta,
            "situation": synth.get("situation", {}),
            "entities": entities,
            "decisions": synth.get("decisions", []),
            "timeline": timeline,
            "key_exchanges": key_exchanges,
            "strategic_context": synth.get("strategic_context", ""),
            "instructions_for_llm": synth.get("instructions_for_llm", ""),
        }

        if compact:
            bridge = {
                "meta": bridge["meta"],
                "situation": bridge["situation"],
                "entities": bridge["entities"],
                "decisions": bridge["decisions"],
            }

        if format == "yaml" and not compact:
            bridge = enforce_token_budget(bridge)

        if format == "yaml":
            output = bridge_to_yaml(bridge)
        elif format == "markdown":
            output = bridge_to_markdown(bridge)
        else:
            output = bridge

        return {"bridge": output, "clip_count": len(clips)}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating bridge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Admin / Migration ---

@app.post("/admin/claim-legacy-data")
async def claim_legacy_data(user_id: str = Depends(get_current_user)):
    """Assign all clips/projects with null user_id to the current user."""
    try:
        clips_result = await run_in_threadpool(
            lambda: sb.table("clips").update({"user_id": user_id}).is_("user_id", "null").execute()
        )
        projects_result = await run_in_threadpool(
            lambda: sb.table("projects").update({"user_id": user_id}).is_("user_id", "null").execute()
        )
        claimed_clips = len(clips_result.data) if clips_result.data else 0
        claimed_projects = len(projects_result.data) if projects_result.data else 0
        return {
            "status": "claimed",
            "clips_claimed": claimed_clips,
            "projects_claimed": claimed_projects,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
