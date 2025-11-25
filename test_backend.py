import requests
import json

BASE_URL = "http://localhost:8001"

def test_save():
    print("Testing /save endpoint...")
    payload = {
        "text": "Gemini is a family of multimodal AI models developed by Google.",
        "url": "https://deepmind.google/technologies/gemini/"
    }
    try:
        response = requests.post(f"{BASE_URL}/save", json=payload)
        response.raise_for_status()
        print("Success:", response.json())
    except Exception as e:
        print("Failed:", e)
        if hasattr(e, 'response') and e.response:
            print("Response:", e.response.text)

def test_chat():
    print("\nTesting /chat endpoint...")
    payload = {
        "question": "Who developed Gemini?"
    }
    try:
        response = requests.post(f"{BASE_URL}/chat", json=payload)
        response.raise_for_status()
        print("Answer:", response.json())
    except Exception as e:
        print("Failed:", e)
        if hasattr(e, 'response') and e.response:
            print("Response:", e.response.text)

if __name__ == "__main__":
    test_save()
    test_chat()
