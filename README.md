# Context Clipper 📋

An intelligent browser extension that saves interesting web content and makes it queryable with AI. Save text from anywhere on the web and ask questions about your saved clips using Google's Gemini AI.

## Features

### 🎯 Smart Context Clipping
- **Right-click Context Menu**: Save selected text with a simple right-click
- **Keyboard Shortcut**: `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac) to instantly save selected text
- **Floating Action Buttons**: Hovering buttons appear when you select text
- **LLM-Ready Format**: Automatically extracts and formats context with metadata

### 🤖 AI-Powered Chat
- Ask questions about your saved clips
- Context-aware responses using Google Gemini
- Quick "Ask AI" option directly from selected text
- Semantic search using vector embeddings

### 📊 Beautiful Dashboard
- View all your saved clips in one place
- Search and filter by date (today, this week, all time)
- Statistics dashboard (total clips, word count, unique domains)
- Pagination for large collections
- Copy clips to clipboard
- Ask AI questions about specific clips

### ⚡ Quick Access
- Browser extension popup for instant actions
- Keyboard shortcut to open dashboard: `Ctrl+Shift+D`
- Real-time backend status indicator
- Usage statistics tracking

## Architecture

```
Context Clipper
├── Backend (FastAPI + PostgreSQL + Vector DB)
│   ├── Text embedding using Gemini text-embedding-004
│   ├── Vector storage using vecs (pgvector)
│   ├── PostgreSQL for metadata storage
│   └── Gemini 2.5 Flash for AI responses
│
└── Browser Extension (Chrome/Edge)
    ├── Background Service Worker
    ├── Content Script (floating buttons, text selection)
    ├── Popup UI (quick actions and chat)
    └── Dashboard (view and manage clips)
```

## Installation

### Prerequisites
- Python 3.12+
- PostgreSQL with pgvector extension
- Supabase account (or local PostgreSQL)
- Google Gemini API key

### Backend Setup

1. **Install Python dependencies**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Create `.env` file** in the `backend` directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   DB_CONNECTION=postgresql://user:password@host:port/database
   ```

   For Supabase, the connection string format is:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
   ```

3. **Start the backend server**:
   ```bash
   cd backend
   python server.py
   ```

   The server will run on `http://localhost:8001`

### Extension Installation

1. **Add placeholder icons** (or create your own):
   - Create 3 PNG files in `extension/icons/`:
     - `icon16.png` (16x16)
     - `icon48.png` (48x48)
     - `icon128.png` (128x128)
   - Or temporarily remove icon references from `manifest.json`

2. **Load the extension in Chrome/Edge**:
   - Open `chrome://extensions/` (or `edge://extensions/`)
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

## Usage

### Saving Clips

**Method 1: Context Menu**
1. Select any text on a webpage
2. Right-click and choose "Save to Context Clipper"

**Method 2: Keyboard Shortcut**
1. Select text
2. Press `Ctrl+Shift+S` (or `Cmd+Shift+S`)

**Method 3: Floating Buttons**
1. Select text
2. Click the "💾 Save" button that appears

### Asking Questions

**From Extension Popup**:
1. Click the extension icon
2. Type your question in the input box
3. Click "Ask AI"

**From Selected Text**:
1. Select text
2. Right-click → "Ask AI about this"

**From Dashboard**:
1. Open dashboard (`Ctrl+Shift+D`)
2. Click "Ask AI" on any clip
3. Type your question

### Viewing Clips

1. Press `Ctrl+Shift+D` or click "Open Dashboard" in the popup
2. Browse all your saved clips
3. Use search to find specific content
4. Filter by date (today, this week, all)
5. Click on clips to expand full text

## API Endpoints

### `POST /save`
Save a new clip with text and metadata.

**Request**:
```json
{
  "text": "Your clip text",
  "url": "https://source-url.com",
  "metadata": {
    "title": "Page Title",
    "domain": "source-url.com",
    "timestamp": "2025-01-15T10:30:00Z",
    "wordCount": 150
  }
}
```

### `GET /clips?limit=50&offset=0`
Retrieve saved clips with pagination.

**Response**:
```json
{
  "clips": [...],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

### `POST /chat`
Ask a question about your saved clips.

**Request**:
```json
{
  "question": "What did I save about AI?"
}
```

**Response**:
```json
{
  "answer": "Based on your saved clips..."
}
```

## Technology Stack

### Backend
- **FastAPI**: Modern Python web framework
- **PostgreSQL**: Relational database for metadata
- **pgvector (vecs)**: Vector database for embeddings
- **Google Gemini**: AI models for embeddings and chat
  - `text-embedding-004`: 768-dimension embeddings
  - `gemini-2.5-flash`: Fast AI responses

### Frontend
- **Vanilla JavaScript**: No dependencies, lightweight
- **Chrome Extension Manifest V3**: Latest extension format
- **Modern CSS**: Gradient backgrounds, smooth animations

## Development

### Project Structure
```
Contextclipper/
├── backend/
│   ├── server.py          # FastAPI server
│   ├── requirements.txt   # Python dependencies
│   └── .env              # Environment variables (not in git)
├── extension/
│   ├── manifest.json      # Extension configuration
│   ├── background.js      # Service worker
│   ├── content.js         # Content script
│   ├── popup.html/js      # Extension popup
│   ├── dashboard.html/js  # Clips dashboard
│   └── icons/            # Extension icons
└── README.md
```

### Testing
Run the test script to verify backend endpoints:
```bash
python test_backend.py
```

## Troubleshooting

### Backend won't start
- Check your `.env` file has correct credentials
- Ensure PostgreSQL is running
- Verify Gemini API key is valid

### Extension shows "Backend offline"
- Make sure backend server is running on port 8001
- Check browser console for CORS errors
- Verify `host_permissions` in manifest.json

### No clips showing in dashboard
- Check browser console for errors
- Verify backend `/clips` endpoint returns data
- Ensure PostgreSQL table was created

### Icons not showing
- Add PNG files to `extension/icons/` directory
- Or remove icon references from manifest.json temporarily

## Future Enhancements

- [ ] Export clips to markdown/JSON
- [ ] Browser sync across devices
- [ ] Tags and categories
- [ ] Full-text search with highlighting
- [ ] Chrome sync storage
- [ ] Automatic summarization
- [ ] OCR for images
- [ ] PDF text extraction

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use and modify for your needs.

---

Built with ❤️ using Google Gemini AI
