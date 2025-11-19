import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from openai import OpenAI
import vecs
from dotenv import load_dotenv

from pathlib import Path

# Load .env from the same directory as this file
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# Add supabase.co to NO_PROXY to bypass proxy for database connections
current_no_proxy = os.environ.get('NO_PROXY', '')
if '*.supabase.co' not in current_no_proxy:
    os.environ['NO_PROXY'] = current_no_proxy + ',*.supabase.co,supabase.co'
    os.environ['no_proxy'] = current_no_proxy + ',*.supabase.co,supabase.co'

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
DB_CONNECTION = os.getenv("DB_CONNECTION")

if not OPENAI_API_KEY:
    print("Warning: OPENAI_API_KEY not found in .env")
if not DB_CONNECTION:
    print("Warning: DB_CONNECTION not found in .env")

# Initialize OpenAI client
client = OpenAI(api_key=OPENAI_API_KEY)

app = FastAPI()

# Initialize Vector Store
def get_collection():
    if not DB_CONNECTION:
        raise HTTPException(status_code=500, detail="DB_CONNECTION not configured")
    vx = vecs.create_client(DB_CONNECTION)
    # Create a collection for clips with 1536 dimensions (text-embedding-3-small)
    return vx.get_or_create_collection(name="openai_clips", dimension=1536)

class SaveRequest(BaseModel):
    text: str
    url: str

class ChatRequest(BaseModel):
    question: str

@app.post("/save")
async def save_clip(request: SaveRequest):
    try:
        # Generate embedding using OpenAI
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=request.text
        )
        embedding = response.data[0].embedding

        # Save to Supabase
        clips = get_collection()
        import uuid
        record_id = str(uuid.uuid4())

        clips.upsert(
            records=[
                (
                    record_id,
                    embedding,
                    {"text": request.text, "url": request.url}
                )
            ]
        )
        return {"status": "success", "id": record_id}
    except Exception as e:
        print(f"Error saving clip: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        # Embed question using OpenAI
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=request.question
        )
        question_embedding = response.data[0].embedding

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

        # Generate answer using OpenAI
        completion = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that answers questions based on provided context."},
                {"role": "user", "content": f"Answer the question based on the following context:\n\n{context}\n\nQuestion: {request.question}"}
            ]
        )

        return {"answer": completion.choices[0].message.content}

    except Exception as e:
        print(f"Error in chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
