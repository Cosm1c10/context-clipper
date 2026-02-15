// Supabase Auth helpers for Context Clipper extension
// Requires SUPABASE_URL and SUPABASE_ANON_KEY from config.js

// --- Supabase Auth API ---

async function supabaseSignUp(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || "Signup failed");
  }
  return data;
}

async function supabaseSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || "Login failed");
  }
  return data;
}

async function supabaseRefreshToken(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || "Token refresh failed");
  }
  return data;
}

// --- Session Storage ---

async function getSession() {
  const data = await chrome.storage.local.get(["session"]);
  return data.session || null;
}

async function saveSession(session) {
  await chrome.storage.local.set({
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: session.user ? { id: session.user.id, email: session.user.email } : null,
    },
  });
}

async function clearSession() {
  await chrome.storage.local.remove(["session", "geminiKey"]);
}

// --- Gemini Key Storage ---

async function getGeminiKey() {
  const data = await chrome.storage.local.get(["geminiKey"]);
  return data.geminiKey || null;
}

async function saveGeminiKey(key) {
  await chrome.storage.local.set({ geminiKey: key });
}

// --- Auth Headers ---

async function getAuthHeaders() {
  const session = await getSession();
  const geminiKey = await getGeminiKey();
  const headers = { "Content-Type": "application/json" };
  if (session && session.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  if (geminiKey) {
    headers["X-Gemini-Key"] = geminiKey;
  }
  return headers;
}

// --- Token Refresh ---

async function ensureValidSession() {
  const session = await getSession();
  if (!session) return null;

  // Check if token is expired or about to expire (60s buffer)
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && now >= session.expires_at - 60) {
    try {
      const refreshed = await supabaseRefreshToken(session.refresh_token);
      await saveSession(refreshed);
      return refreshed;
    } catch {
      // Refresh failed — session is invalid
      await clearSession();
      return null;
    }
  }

  return session;
}
