# 🚀 Live Testing Guide

## ✅ Current Status

- ✅ **Backend Server**: Running on http://localhost:8001
- ✅ **Extension Icons**: Created (purple gradient with clipboard design)
- ✅ **Test Page**: Available at `test_page.html`

## 📋 Step-by-Step Testing

### Step 1: Load the Extension

1. Open **Chrome** or **Edge** browser
2. Navigate to `chrome://extensions/` (or `edge://extensions/`)
3. Click the **Developer mode** toggle (top-right corner)
4. Click **"Load unpacked"** button
5. Browse to: `c:\Users\heman\OneDrive\Desktop\Contextclipper\extension`
6. Click **"Select Folder"**

**Expected Result**: You should see "Context Clipper" in your extensions list with a purple gradient icon.

### Step 2: Open Test Page

The test page should already be open in your browser. If not:
- Navigate to: `file:///c:/Users/heman/OneDrive/Desktop/Contextclipper/test_page.html`

### Step 3: Test Right-Click Menu

1. On the test page, **select** the text in "Test 1" section
2. **Right-click** on the selected text
3. Look for two new menu items:
   - "Save to Context Clipper"
   - "Ask AI about this"

**Try it**: Click "Save to Context Clipper"

**Expected Result**:
- Browser notification saying "Successfully saved clip!"
- Backend logs should show the save request

### Step 4: Test Keyboard Shortcut

1. **Select** the text in "Test 2" section
2. Press **`Ctrl+Shift+S`** (Windows) or **`Cmd+Shift+S`** (Mac)

**Expected Result**: Same as above - notification and backend logging

### Step 5: Test Floating Buttons

1. **Select** any text on the page
2. Look for floating buttons appearing near your cursor

**Expected Result**:
- Two buttons should appear: "💾 Save" and "🤔 Ask AI"
- Clicking either should work

### Step 6: Test Extension Popup

1. Click the **Context Clipper icon** in your browser toolbar (top-right)

**Expected Result**: Popup shows:
- ✅ "Backend connected" (green indicator)
- Stats: "0 Clips Saved", "0 AI Queries" (will update as you use it)
- "Save Current Selection" button
- "Open Dashboard" button
- Chat input box

**Try it**:
- Type a question like "Hello" in the chat box
- Click "Ask AI"

### Step 7: Test Dashboard

**Option A**: Press **`Ctrl+Shift+D`** (or `Cmd+Shift+D`)
**Option B**: Click "Open Dashboard" in the popup

**Expected Result**: New tab opens showing:
- Beautiful dashboard with gradient header
- Statistics cards (Total Clips, Total Words, Unique Domains)
- Search bar and filters
- Your saved clips (if any)

### Step 8: Test Full Workflow

Now let's do a complete test:

1. **Save 3 different clips** from the test page:
   - Test 1 text (about AI)
   - Test 2 text (about Cloud Computing)
   - Test 3 text (about Quantum Computing)

2. **Open the dashboard** (`Ctrl+Shift+D`)

3. **Verify clips are displayed** with:
   - Correct timestamps
   - URLs (file:// path to test page)
   - Word counts

4. **Try the search**: Type "quantum" in search box

5. **Ask AI a question**:
   - Click the extension icon
   - Type: "What technologies did I save information about?"
   - Click "Ask AI"

**Expected Result**: AI should mention AI, Cloud Computing, and Quantum Computing

### Step 9: Test Individual Clip Actions

In the dashboard, for any clip:

1. **Click "Expand"**: Should show full text
2. **Click "Ask AI"**: Opens modal to ask questions about that specific clip
3. **Click "Copy"**: Should copy text to clipboard (you'll see a toast notification)

## 🔍 Backend Monitoring

To see what's happening in real-time:

The backend server is running in the background. Check the server logs to see:
- When clips are saved
- When AI queries are made
- Any errors

## 🧪 Advanced Testing

### Test AI Context Understanding

1. Save these specific texts:
   - "Python is a programming language"
   - "JavaScript runs in browsers"
   - "Java is used for enterprise applications"

2. Ask: "What programming languages did I save?"

3. AI should list: Python, JavaScript, and Java

### Test Search Functionality

1. Save clips with different keywords
2. In dashboard, search for specific words
3. Results should filter in real-time

### Test Filters

1. Save some clips
2. In dashboard, click "Today" filter
3. Should show only today's clips

## 🐛 Troubleshooting

### Extension Won't Load
```
Check chrome://extensions/ for errors
Make sure all files are in the extension folder
Verify manifest.json is valid
```

### Backend Offline in Popup
```bash
# Check if server is running
curl http://localhost:8001/clips

# Should return: {"clips":[],"total":0,...}
```

### No Floating Buttons
```
Check browser console (F12) for errors
Make sure content.js is loading
Try refreshing the page
```

### Notifications Not Showing
```
Check browser notification permissions
Windows: Settings → System → Notifications
Chrome: Settings → Privacy → Notifications
```

## 📊 What to Expect

### First Save:
- Notification appears
- Backend processes embedding (~1-2 seconds)
- Clip saved to PostgreSQL + Vector DB

### First AI Query:
- Shows "Thinking..." in popup
- Backend queries vector DB
- Gemini generates response (~2-3 seconds)
- Answer appears in popup

### Dashboard Load:
- Fetches all clips from PostgreSQL
- Calculates statistics
- Renders with pagination

## 🎯 Success Criteria

✅ All checkboxes on test page should be checked
✅ No errors in browser console
✅ No errors in backend logs
✅ Clips appear in dashboard
✅ AI responds to questions

## 📈 Next Steps After Testing

1. Try on real websites (Wikipedia, news sites, documentation)
2. Save actual content you want to remember
3. Ask meaningful questions about your clips
4. Test the full workflow in your daily browsing

---

**Backend Server Running**: http://localhost:8001
**API Docs**: http://localhost:8001/docs (FastAPI auto-generated docs)

Happy Testing! 🎉
