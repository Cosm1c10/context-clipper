import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import vecs
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

from pathlib import Path

# Load .env from the same directory as this file
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DB_CONNECTION = os.getenv("DB_CONNECTION")

if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY not found in .env")
if not DB_CONNECTION:
    print("Warning: DB_CONNECTION not found in .env")

genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database table for clips metadata
def init_db():
    if not DB_CONNECTION:
        return
    try:
        conn = psycopg2.connect(DB_CONNECTION)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS clips (
                id VARCHAR(255) PRIMARY KEY,
                text TEXT NOT NULL,
                url TEXT NOT NULL,
                title TEXT,
                domain TEXT,
                word_count INTEGER,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error initializing database: {e}")

init_db()

# Initialize Vector Store
def get_collection():
    if not DB_CONNECTION:
        raise HTTPException(status_code=500, detail="DB_CONNECTION not configured")
    vx = vecs.create_client(DB_CONNECTION)
    # Create a collection for clips with 768 dimensions (text-embedding-004)
    return vx.get_or_create_collection(name="gemini_clips", dimension=768)

class SaveRequest(BaseModel):
    text: str
    url: str
    metadata: dict = None

class ChatRequest(BaseModel):
    question: str

@app.post("/save")
async def save_clip(request: SaveRequest):
    try:
        import uuid
        from datetime import datetime

        # Generate embedding
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=request.text,
            task_type="retrieval_document",
            title="Context Clip"
        )
        embedding = result['embedding']

        record_id = str(uuid.uuid4())

        # Save to vector store
        clips = get_collection()
        clips.upsert(
            records=[
                (
                    record_id,
                    embedding,
                    {"text": request.text, "url": request.url}
                )
            ]
        )

        # Save metadata to PostgreSQL table
        conn = psycopg2.connect(DB_CONNECTION)
        cur = conn.cursor()

        metadata = request.metadata or {}
        title = metadata.get('title', '')
        domain = metadata.get('domain', '')
        word_count = metadata.get('wordCount', len(request.text.split()))

        cur.execute("""
            INSERT INTO clips (id, text, url, title, domain, word_count, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (record_id, request.text, request.url, title, domain, word_count, datetime.now()))

        conn.commit()
        cur.close()
        conn.close()

        return {"status": "success", "id": record_id}
    except Exception as e:
        print(f"Error saving clip: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/clips")
async def get_clips(limit: int = 50, offset: int = 0):
    """Get all saved clips with pagination"""
    try:
        conn = psycopg2.connect(DB_CONNECTION)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Get total count
        cur.execute("SELECT COUNT(*) as total FROM clips")
        total = cur.fetchone()['total']

        # Get clips with pagination
        cur.execute("""
            SELECT id, text, url, title, domain, word_count, timestamp
            FROM clips
            ORDER BY timestamp DESC
            LIMIT %s OFFSET %s
        """, (limit, offset))

        clips = cur.fetchall()
        cur.close()
        conn.close()

        # Convert datetime to string for JSON serialization
        for clip in clips:
            if clip['timestamp']:
                clip['timestamp'] = clip['timestamp'].isoformat()

        return {
            "clips": clips,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        print(f"Error getting clips: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        # Embed question
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=request.question,
            task_type="retrieval_query"
        )
        question_embedding = result['embedding']

        # Query Supabase
        clips = get_collection()
        results = clips.query(
            data=question_embedding,
            limit=5,
            include_metadata=True
        )

        # Construct context
        context = ""
        for result_item in results:
            # vecs returns tuples of (id, distance, metadata) when include_metadata=True
            if len(result_item) >= 3:
                record_id, distance, meta = result_item[0], result_item[1], result_item[2]
            else:
                # Fallback: try to get metadata from the record
                meta = result_item[2] if len(result_item) > 2 else {}

            # If meta is the dict containing text and url
            if isinstance(meta, dict):
                text = meta.get('text', '')
                url = meta.get('url', '')
                context += f"Source ({url}): {text}\n\n"

        if not context:
            return {"answer": "No relevant context found to answer your question."}

        # Generate answer
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"Answer the question based on the following context:\n\n{context}\n\nQuestion: {request.question}"
        
        response = model.generate_content(prompt)
        return {"answer": response.text}

    except Exception as e:
        print(f"Error in chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
