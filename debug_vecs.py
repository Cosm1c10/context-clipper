import os
import vecs
from dotenv import load_dotenv
from pathlib import Path

# Load .env
env_path = Path(__file__).parent / 'backend' / '.env'
load_dotenv(dotenv_path=env_path)

DB_CONNECTION = os.getenv("DB_CONNECTION")

vx = vecs.create_client(DB_CONNECTION)
clips = vx.get_or_create_collection(name="gemini_clips", dimension=768)

# Create a dummy embedding (all zeros) just to test the return format
dummy_embedding = [0.0] * 768

print("Querying...")
results = clips.query(
    data=dummy_embedding,
    limit=1,
    include_metadata=True
)

print(f"Results type: {type(results)}")
print(f"Results: {results}")

if results:
    first_result = results[0]
    print(f"First result type: {type(first_result)}")
    print(f"First result length: {len(first_result)}")
    try:
        val1, val2 = first_result
        print(f"Value 1 type: {type(val1)}")
        print(f"Value 1: {val1}")
        print(f"Value 2 type: {type(val2)}")
        print(f"Value 2: {val2}")
    except ValueError as e:
        print(f"Unpacking failed: {e}")
