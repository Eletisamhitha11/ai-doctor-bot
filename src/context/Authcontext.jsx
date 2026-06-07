import { createContext, useContext, useState, useEffect } from "react";

// ── localStorage auth + Google OAuth (no backend needed) ────────────────────
const AuthContext = createContext(null);
const USERS_KEY    = "doctorbot_users";
const SESSION_KEY  = "doctorbot_session";

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }
  catch { return []; }
}
function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
function hashSimple(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h.toString(36);
}

// ── Google Identity Services helper ─────────────────────────────────────────
function loadGoogleScript() {
  return new Promise((resolve) => {
    if (window.google?.accounts) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

function parseJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch { return {}; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (session?.email) {
        const found = getUsers().find((u) => u.email === session.email);
        if (found) { const { password: _, ...safe } = found; setUser(safe); }
        // Google-only users have no password field — still valid
        else if (session.name) setUser(session);
      }
    } catch {}
    setLoading(false);
  }, []);

  // ── Email / Password login ─────────────────────────────────────────────────
  const login = async (email, password) => {
    const found = getUsers().find((u) => u.email === email.toLowerCase().trim());
    if (!found) throw new Error("No account found with this email");
    if (found.googleOnly) throw new Error("This account uses Google Sign-In. Click 'Continue with Google'.");
    if (found.password !== hashSimple(password + email.toLowerCase().trim()))
      throw new Error("Incorrect password");
    const { password: _, ...safe } = found;
    setUser(safe);
    localStorage.setItem(SESSION_KEY, JSON.stringify(safe));
    return safe;
  };

  // ── Email / Password signup ────────────────────────────────────────────────
  const signup = async (name, email, password, age, gender) => {
    const normalEmail = email.toLowerCase().trim();
    if (!name.trim()) throw new Error("Name is required");
    if (password.length < 6) throw new Error("Password must be at least 6 characters");
    const users = getUsers();
    if (users.find((u) => u.email === normalEmail)) throw new Error("Email already registered");
    const newUser = {
      id: crypto.randomUUID?.() || Date.now().toString(36),
      name: name.trim(), email: normalEmail,
      password: hashSimple(password + normalEmail),
      age: age || null, gender: gender || null,
      createdAt: new Date().toISOString(),
    };
    saveUsers([...users, newUser]);
    const { password: _, ...safe } = newUser;
    setUser(safe);
    localStorage.setItem(SESSION_KEY, JSON.stringify(safe));
    return safe;
  };

  // ── Google Sign-In ─────────────────────────────────────────────────────────
  const googleSignIn = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("Google Sign-In is not configured. Add VITE_GOOGLE_CLIENT_ID to your .env file.");

    await loadGoogleScript();

    return new Promise((resolve, reject) => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          try {
            const payload = parseJwt(response.credential);
            const { email, name, picture, sub } = payload;
            if (!email) { reject(new Error("Google did not return an email")); return; }

            const users = getUsers();
            let existing = users.find((u) => u.email === email);
            if (!existing) {
              existing = { id: sub || Date.now().toString(36), name, email, picture, googleOnly: true, createdAt: new Date().toISOString() };
              saveUsers([...users, existing]);
            }
            const safe = { id: existing.id, name: existing.name, email: existing.email, picture: existing.picture };
            setUser(safe);
            localStorage.setItem(SESSION_KEY, JSON.stringify(safe));
            resolve(safe);
          } catch (e) { reject(e); }
        },
      });
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback: render a one-tap popup via renderButton approach
          const div = document.createElement("div");
          div.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:#fff;padding:24px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3)";
          div.innerHTML = `<p style="margin-bottom:12px;font-weight:600;font-family:sans-serif">Sign in with Google</p><div id="g_btn_mount"></div><button id="g_cancel" style="margin-top:12px;width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;cursor:pointer;font-family:sans-serif">Cancel</button>`;
          document.body.appendChild(div);
          document.getElementById("g_cancel").onclick = () => { document.body.removeChild(div); reject(new Error("Cancelled")); };
          window.google.accounts.id.renderButton(document.getElementById("g_btn_mount"), { theme: "outline", size: "large", width: 280 });
        }
      });
    });
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    window.google?.accounts?.id?.disableAutoSelect?.();
  };

  const token = user ? btoa(user.email) : null;

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout, googleSignIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);