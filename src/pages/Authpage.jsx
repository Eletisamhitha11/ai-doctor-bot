import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function AuthPage() {
  const { login, signup, googleSignIn } = useAuth();
  const [mode, setMode] = useState("landing");
  const [form, setForm] = useState({ name: "", email: "", password: "", age: "", gender: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await signup(form.name, form.email, form.password, form.age || undefined, form.gender || undefined);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    setError(""); setGLoading(true);
    try { await googleSignIn(); }
    catch (err) { if (err.message !== "Cancelled") setError(err.message); }
    finally { setGLoading(false); }
  };

  /* ── LANDING ── */
  if (mode === "landing") return (
    <div className="landing">
      <div className="landing-bg">
        <div className="blob blob1"/><div className="blob blob2"/><div className="blob blob3"/>
        <div className="grid-overlay"/>
      </div>

      <nav className="landing-nav">
        <div className="logo-mark">
          <span className="logo-icon">⚕</span>
          <span className="logo-text">DoctorBot<span className="logo-ai">AI</span></span>
        </div>
        <div className="nav-actions">
          <button className="btn-ghost" onClick={() => setMode("login")}>Sign In</button>
          <button className="btn-primary" onClick={() => setMode("signup")}>Get Started</button>
        </div>
      </nav>

      <main className="hero">
        <div className="hero-badge">🏥 AI-Powered Health Assistant</div>
        <h1 className="hero-title">
          Your Personal<br/>
          <span className="gradient-text">AI Doctor</span><br/>
          Is Here
        </h1>
        <p className="hero-sub">
          Describe symptoms, query medicines, upload reports, and get health guidance in your language — instantly.
        </p>
        <div className="hero-cta">
          <button className="btn-hero" onClick={() => setMode("signup")}>
            Start for Free <span className="btn-arrow">→</span>
          </button>
          <button className="btn-ghost-lg" onClick={() => setMode("login")}>Sign In</button>
        </div>

        <div className="features-grid">
          {[
            { icon: "🧠", title: "Smart Diagnosis Help",    desc: "AI-powered symptom analysis with evidence-based suggestions" },
            { icon: "💊", title: "Medicine Query",          desc: "Ask about any drug — uses, dosage, side effects & interactions" },
            { icon: "🖼️", title: "Image & Report Analysis", desc: "Upload medical images or PDFs for instant AI review" },
            { icon: "🎙️", title: "Voice in Any Language",   desc: "Speak naturally in Hindi, Telugu, Tamil & 12 more languages" },
            { icon: "👨‍⚕️", title: "Doctor Recommendations", desc: "Find the right specialist based on your symptoms" },
            { icon: "📥", title: "Download Analysis",       desc: "Save your complete health analysis as a PDF" },
          ].map((f) => (
            <div className="feature-card" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* ── CONTACT / FOOTER ── */}
      <section className="contact-section">
        <div className="contact-inner">
          <div className="contact-left">
            <div className="contact-brand">
              <span className="logo-icon">⚕</span>
              <span className="logo-text">DoctorBot<span className="logo-ai">AI</span></span>
            </div>
            <p className="contact-tagline">Your intelligent health companion — available 24/7, in any language.</p>
            <div className="contact-chips">
              <a href="mailto:support@doctorbotai.com" className="contact-chip">✉ support@doctorbotai.com</a>
              <a href="tel:+911234567890" className="contact-chip">📞 +91 12345 67890</a>
              <span className="contact-chip">📍 Hyderabad, India</span>
            </div>
          </div>

          <div className="contact-links">
            <div className="contact-col">
              <h4>Product</h4>
              <span>Features</span>
              <span>How it Works</span>
              <span>Privacy Policy</span>
            </div>
            <div className="contact-col">
              <h4>Support</h4>
              <a href="mailto:support@doctorbotai.com">Contact Us</a>
              <span>FAQ</span>
              <span>Terms of Use</span>
            </div>
            <div className="contact-col">
              <h4>Get Started</h4>
              <button className="contact-cta-btn" onClick={() => setMode("signup")}>Sign Up Free →</button>
              <button className="contact-link-btn" onClick={() => setMode("login")}>Sign In</button>
            </div>
          </div>
        </div>

        <div className="contact-bar">
          <span>© {new Date().getFullYear()} DoctorBot AI. All rights reserved.</span>
          <span className="contact-disclaimer">⚠ For informational purposes only. Not a substitute for professional medical advice.</span>
        </div>
      </section>
    </div>
  );

  /* ── LOGIN / SIGNUP ── */
  return (
    <div className="auth-screen">
      <div className="auth-bg"><div className="blob blob1"/><div className="blob blob2"/></div>
      <div className="auth-card">
        <button className="auth-back" onClick={() => { setMode("landing"); setError(""); }}>← Back</button>
        <div className="auth-logo">
          <span className="logo-icon">⚕</span>
          <span className="logo-text">DoctorBot<span className="logo-ai">AI</span></span>
        </div>
        <h2 className="auth-title">{mode === "login" ? "Welcome back" : "Create account"}</h2>
        <p className="auth-sub">{mode === "login" ? "Sign in to your health dashboard" : "Start your health journey today"}</p>

        {error && <div className="auth-error">⚠ {error}</div>}

        {/* Google */}
        <button className="google-btn" onClick={handleGoogle} disabled={gLoading}>
          {gLoading ? <span className="spinner"/> : <>
            <svg viewBox="0 0 24 24" width="20" height="20" style={{flexShrink:0}}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </>}
        </button>

        <div className="auth-divider"><span>or continue with email</span></div>

        <form onSubmit={submit} className="auth-form">
          {mode === "signup" && (
            <div className="form-group">
              <label>Full Name</label>
              <input name="name" type="text" placeholder="John Doe" value={form.name} onChange={handle} required/>
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input name="email" type="email" placeholder="you@example.com" value={form.email} onChange={handle} required/>
          </div>
          <div className="form-group">
            <label>Password</label>
            <input name="password" type="password" placeholder="••••••••" value={form.password} onChange={handle} required minLength={6}/>
          </div>
          {mode === "signup" && (
            <div className="form-row">
              <div className="form-group">
                <label>Age (optional)</label>
                <input name="age" type="number" placeholder="25" value={form.age} onChange={handle} min="1" max="120"/>
              </div>
              <div className="form-group">
                <label>Gender (optional)</label>
                <select name="gender" value={form.gender} onChange={handle}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          )}
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? <span className="spinner"/> : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="auth-switch">
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
            {mode === "login" ? "Sign Up" : "Sign In"}
          </button>
        </p>
      </div>
    </div>
  );
}