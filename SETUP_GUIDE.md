# Quick Setup Guide

## Step 1: Backend Setup

1. **Get your API keys**:
   - Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Set up a Supabase project at [supabase.com](https://supabase.com) (free tier is fine)

2. **Create `.env` file**:
   ```bash
   cd backend
   # Create a file named .env with:
   ```

   Add these lines to the `.env` file:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   DB_CONNECTION=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```

   You can find your Supabase connection string in:
   - Project Settings → Database → Connection string → URI

3. **Install dependencies**:
   ```bash
   pip install fastapi uvicorn google-generativeai vecs python-dotenv psycopg2-binary
   ```

4. **Start the server**:
   ```bash
   python server.py
   ```

   You should see:
   ```
   INFO:     Uvicorn running on http://0.0.0.0:8001
   ```

## Step 2: Extension Setup

### Option A: Skip Icons (Quick Test)

Edit `extension/manifest.json` and remove the `icons` and `default_icon` sections:

```json
{
  "manifest_version": 3,
  "name": "Context Clipper",
  "version": "1.0",
  "description": "Save context to Gemini and chat with it.",
  "permissions": [
    "contextMenus",
    "activeTab",
    "storage",
    "notifications"
  ],
  "host_permissions": [
    "http://localhost:8001/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ],
  "commands": {
    "save-clip": {
      "suggested_key": {
        "default": "Ctrl+Shift+S",
        "mac": "Command+Shift+S"
      },
      "description": "Save selected text to Context Clipper"
    },
    "open-dashboard": {
      "suggested_key": {
        "default": "Ctrl+Shift+D",
        "mac": "Command+Shift+D"
      },
      "description": "Open Context Clipper Dashboard"
    }
  }
}
```

### Option B: Add Icons (Recommended)

Create three PNG files in `extension/icons/`:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

You can:
- Use an online icon generator
- Create simple colored squares in Paint/Preview
- Download from flaticon.com (search "clipboard")

### Load Extension in Browser

1. Open Chrome/Edge
2. Go to `chrome://extensions/` or `edge://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `extension` folder
6. You should see "Context Clipper" installed!

## Step 3: Test It Out

1. **Go to any website** (like wikipedia.org)
2. **Select some text**
3. **Right-click** → Choose "Save to Context Clipper"
4. **Check the notification** - should say "Successfully saved clip!"
5. **Open the dashboard** - Press `Ctrl+Shift+D`
6. **See your clip** in the dashboard!

## Step 4: Try the AI Chat

1. Click the extension icon (top-right of browser)
2. Type a question like "What did I save?"
3. Click "Ask AI"
4. Get an AI-powered answer!

## Troubleshooting

### "Backend offline" in popup
- Make sure the backend is running: `python server.py`
- Check it's on port 8001
- Try visiting http://localhost:8001/docs

### Extension won't load
- Check for errors in `chrome://extensions/`
- Click "Errors" button if you see one
- Make sure all files are in the `extension` folder

### No clips showing in dashboard
- Open browser console (F12)
- Check for error messages
- Verify backend is running
- Test the backend: http://localhost:8001/clips

### Backend errors
- Check your `.env` file exists and has both keys
- Verify Gemini API key is valid
- Test Supabase connection string
- Check PostgreSQL is enabled in Supabase

## Next Steps

- Customize the keyboard shortcuts in browser settings
- Try the floating save buttons (select text to see them)
- Search your clips in the dashboard
- Export your data (coming soon!)

## Need Help?

Check the main README.md for more details or open an issue on GitHub.

Happy clipping! 📋✨
