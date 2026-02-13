import os
import uuid
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from supabase import create_client
from dotenv import load_dotenv
from pathlib import Path

# Load .env from the same directory as this file
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY not found in .env")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("Warning: SUPABASE_URL or SUPABASE_KEY not found in .env")

genai.configure(api_key=GEMINI_API_KEY)

# Initialize Supabase client
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
    text: str
    url: str
    metadata: Optional[dict] = None
    project_id: Optional[str] = None

class ChatRequest(BaseModel):
    question: str

# --- Clips ---

@app.post("/save")
async def save_clip(request: SaveRequest):
    try:
        # Generate embedding
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=request.text,
            task_type="retrieval_document",
            title="Context Clip"
        )
        embedding = result['embedding']

        record_id = str(uuid.uuid4())
        metadata = request.metadata or {}
        title = metadata.get('title', '')
        domain = metadata.get('domain', '')
        word_count = metadata.get('wordCount', len(request.text.split()))

        row = {
            "id": record_id,
            "text": request.text,
            "url": request.url,
            "title": title,
            "domain": domain,
            "word_count": word_count,
            "timestamp": datetime.now().isoformat(),
            "project_id": request.project_id,
            "embedding": embedding,
        }

        sb.table("clips").insert(row).execute()

        return {"status": "success", "id": record_id}
    except Exception as e:
        print(f"Error saving clip: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/clips")
async def save_clip_alt(request: SaveRequest):
    return await save_clip(request)

@app.get("/clips")
async def get_clips(limit: int = 50, offset: int = 0, project_id: str = None):
    try:
        query = sb.table("clips").select("id, text, url, title, domain, word_count, timestamp, project_id")

        if project_id:
            query = query.eq("project_id", project_id)

        result = query.order("timestamp", desc=True).range(offset, offset + limit - 1).execute()
        clips = result.data

        # Get total count
        count_query = sb.table("clips").select("id", count="exact")
        if project_id:
            count_query = count_query.eq("project_id", project_id)
        count_result = count_query.execute()
        total = count_result.count if count_result.count is not None else len(clips)

        return {
            "clips": clips,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        print(f"Error getting clips: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/clips/{clip_id}")
async def delete_clip(clip_id: str):
    try:
        result = sb.table("clips").delete().eq("id", clip_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Clip not found")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/clips/{clip_id}")
async def update_clip(clip_id: str, request: SaveRequest):
    try:
        word_count = len(request.text.split())

        # Re-generate embedding
        emb_result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=request.text,
            task_type="retrieval_document",
            title="Context Clip"
        )

        result = sb.table("clips").update({
            "text": request.text,
            "word_count": word_count,
            "embedding": emb_result['embedding'],
        }).eq("id", clip_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Clip not found")
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Chat (Semantic Search + AI) ---

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        # Embed the question
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=request.question,
            task_type="retrieval_query"
        )
        question_embedding = result['embedding']

        # Vector similarity search via Supabase RPC
        rpc_result = sb.rpc("match_clips", {
            "query_embedding": question_embedding,
            "match_count": 5
        }).execute()

        context = ""
        for row in (rpc_result.data or []):
            text = row.get("text", "")
            url = row.get("url", "")
            context += f"Source ({url}): {text}\n\n"

        if not context:
            return {"answer": "No relevant context found to answer your question."}

        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"Answer the question based on the following context:\n\n{context}\n\nQuestion: {request.question}"
        response = model.generate_content(prompt)
        return {"answer": response.text}

    except Exception as e:
        print(f"Error in chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Projects ---

@app.post("/projects")
async def create_project(project: ProjectCreate):
    try:
        project_id = str(uuid.uuid4())
        sb.table("projects").insert({
            "id": project_id,
            "name": project.name,
            "description": project.description,
        }).execute()
        return {"id": project_id, "status": "created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects")
async def list_projects():
    try:
        result = sb.table("projects").select("*").order("created_at", desc=True).execute()
        projects = result.data

        # Get clip counts per project
        for p in projects:
            count_result = sb.table("clips").select("id", count="exact").eq("project_id", p["id"]).execute()
            p["clip_count"] = count_result.count if count_result.count is not None else 0

        return projects
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    try:
        result = sb.table("projects").delete().eq("id", project_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}/export")
async def export_project_context(project_id: str):
    try:
        result = sb.table("clips").select("text, url, title, timestamp").eq("project_id", project_id).order("timestamp").execute()
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
    except Exception as e:
        print(f"Error exporting project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
