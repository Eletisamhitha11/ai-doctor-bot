import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useVoice, LANGUAGES } from "../utils/useVoice";
import { downloadAnalysisPDF } from "../utils/downloadPDF";
import DoctorRecommendation from "../components/DoctorRecommendation";
import { CHAT_URL } from "../utils/api";

const WELCOME    = "👋 Hello! I'm DoctorBot AI. Describe your symptoms, ask about medicines, upload a report or image, or use Doctor Finder. How can I help you today?";
const MED_WELCOME = "💊 Ask me about any medicine — uses, dosage, side effects, interactions and warnings.";

const TABS = [
  { key: "chat",     icon: "💬", label: "Health Chat"    },
  { key: "medicine", icon: "💊", label: "Medicine Query"  },
  { key: "doctor",   icon: "👨‍⚕️", label: "Find Doctor"    },
  { key: "history",  icon: "📜", label: "History"         },
];

// Convert File → base64 data URL
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result); // includes "data:mime;base64,..." prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ChatPage() {
  const { user, logout } = useAuth();

  const [chatMsgs,     setChatMsgs]     = useState([{ role: "assistant", content: WELCOME }]);
  const [medicineMsgs, setMedicineMsgs] = useState([{ role: "assistant", content: MED_WELCOME }]);

  const [input,       setInput]       = useState("");
  const [file,        setFile]        = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [tab,         setTab]         = useState("chat");
  const [langCode,    setLangCode]    = useState("en-US");
  const [showLang,    setShowLang]    = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef   = useRef(null);

  const isChat     = tab === "chat";
  const isMedicine = tab === "medicine";
  const isChatLike = isChat || isMedicine;

  const messages    = isChat ? chatMsgs : medicineMsgs;
  const setMessages = isChat ? setChatMsgs : setMedicineMsgs;

  const selectedLang = LANGUAGES.find((l) => l.code === langCode) || LANGUAGES[0];

  const { listening, speaking, startListening, stopListening, speak, stopSpeaking } = useVoice({
    language: langCode,
    onTranscript: (text) => setInput((p) => p + (p ? " " : "") + text),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, tab]);

  // ── File helpers ────────────────────────────────────────────────────────────
  const handleFile = (f) => {
    setFile(f);
    if (f?.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = (e) => setFilePreview(e.target.result);
      r.readAsDataURL(f);
    } else setFilePreview(null);
  };
  const removeFile = () => { setFile(null); setFilePreview(null); };

  // ── New Chat ─────────────────────────────────────────────────────────────────
  const newChat = () => {
    if (isChat)     setChatMsgs([{ role: "assistant", content: WELCOME }]);
    if (isMedicine) setMedicineMsgs([{ role: "assistant", content: MED_WELCOME }]);
    setInput(""); removeFile();
  };

  // ── Send ────────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() && !file) return;

    const userMsg = { role: "user", content: input || `[Uploaded: ${file?.name}]` };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput(""); setLoading(true);

    try {
      // Build history for context (last 6 messages, excluding the first welcome msg)
      const history = newMsgs.slice(1, -1).slice(-6).map((m) => ({
        role: m.role, content: m.content,
      }));

      // Convert file to base64 if present
      let fileDataUrl = "";
      let fileType    = "";
      let fileName    = "";
      if (file) {
        fileDataUrl = await fileToBase64(file);
        fileType    = file.type;
        fileName    = file.name;
      }

      const payload = {
        message:  input,
        history,
        mode:     isMedicine ? "medicine" : "symptom",
        language: selectedLang.label,
        fileDataUrl,
        fileType,
        fileName,
      };

      const r    = await fetch(CHAT_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await r.json();
      const aiMsg   = { role: "assistant", content: data.reply };
      const updated = [...newMsgs, aiMsg];
      setMessages(updated);
      speak(data.reply, langCode);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠ Network error: ${err.message}. Please try again.` }]);
    } finally { setLoading(false); removeFile(); }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try { await downloadAnalysisPDF(messages, user?.name || "User"); }
    catch { alert("Download failed. Please try again."); }
    finally { setDownloading(false); }
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <span className="logo-icon">⚕</span>
          <span className="logo-text">DoctorBot<span className="logo-ai">AI</span></span>
        </div>

        <div className="sidebar-new-chat">
          <button className="new-chat-btn" onClick={newChat} disabled={!isChatLike}>
            <span className="new-chat-plus">＋</span> New Chat
          </button>
        </div>

        <nav className="sidebar-nav">
          {TABS.map((t) => (
            <button key={t.key} className={`nav-item ${tab === t.key ? "active" : ""}`}
              onClick={() => { setTab(t.key); setSidebarOpen(false); }}>
              <span className="nav-icon">{t.icon}</span>
              <span className="nav-label">{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-info">
            <div className="user-avatar">
              {user?.picture
                ? <img src={user.picture} alt="" style={{ width:"100%", height:"100%", borderRadius:"50%", objectFit:"cover" }}/>
                : user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div>
              <div className="user-name">{user?.name || "Guest"}</div>
              <div className="user-email">{user?.email || ""}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>Sign Out</button>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}/>}

      {/* ── Main ── */}
      <main className="main-area">

        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div className="topbar-title">
            {TABS.find((t) => t.key === tab)?.icon}{" "}
            {TABS.find((t) => t.key === tab)?.label}
          </div>
          <div className="topbar-actions">
            {isChatLike && (
              <button className="topbar-new-btn" onClick={newChat} title="New chat">＋</button>
            )}
            <div className="lang-selector">
              <button className="lang-btn" onClick={() => setShowLang(!showLang)}>
                {selectedLang.flag} {selectedLang.label} ▾
              </button>
              {showLang && (
                <div className="lang-menu">
                  {LANGUAGES.map((l) => (
                    <button key={l.code} className={`lang-option ${langCode === l.code ? "selected" : ""}`}
                      onClick={() => { setLangCode(l.code); setShowLang(false); }}>
                      {l.flag} {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isChatLike && (
              <button className="download-btn" onClick={handleDownload} disabled={downloading} title="Download PDF">
                {downloading ? "⏳" : "📥"}
              </button>
            )}
          </div>
        </header>

        {/* ── Chat / Medicine ── */}
        {isChatLike && (
          <div className="chat-container">
            <div className="chat-mode-bar">
              <span className={`mode-pill ${isChat ? "active" : ""}`} onClick={() => setTab("chat")}>💬 Symptoms</span>
              <span className={`mode-pill ${isMedicine ? "active" : ""}`} onClick={() => setTab("medicine")}>💊 Medicines</span>
            </div>

            <div className="messages-area">
              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  {msg.role === "assistant" && (
                    <div className="msg-avatar">{isMedicine ? "💊" : "⚕"}</div>
                  )}
                  <div className="msg-bubble">
                    <div className="msg-content" style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                    {msg.role === "assistant" && (
                      <button className="speak-btn"
                        onClick={() => speaking ? stopSpeaking() : speak(msg.content, langCode)}
                        title={speaking ? "Stop" : "Read aloud"}>
                        {speaking ? "🔇" : "🔊"}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="message assistant">
                  <div className="msg-avatar">{isMedicine ? "💊" : "⚕"}</div>
                  <div className="msg-bubble">
                    <div className="typing-indicator"><span/><span/><span/></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef}/>
            </div>

            {file && (
              <div className="file-preview">
                {filePreview
                  ? <img src={filePreview} alt="preview" className="img-preview"/>
                  : <span className="pdf-preview">📄 {file.name}</span>}
                <button className="remove-file" onClick={removeFile}>✕</button>
              </div>
            )}

            <div className="input-area">
              {isChat && (
                <>
                  <button className="attach-btn" onClick={() => fileInputRef.current?.click()} title="Upload image or PDF">📎</button>
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf" style={{ display:"none" }}
                    onChange={(e) => handleFile(e.target.files[0])}/>
                </>
              )}
              <textarea className="chat-input"
                placeholder={listening ? "🎙 Listening..." : isMedicine
                  ? `Ask about a medicine... (${selectedLang.label})`
                  : `Type your symptoms or question... (${selectedLang.label})`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                rows={1}/>
              <button className={`mic-btn ${listening ? "active" : ""}`}
                onClick={listening ? stopListening : startListening}
                title={listening ? "Stop" : "Voice input"}>
                {listening ? "🔴" : "🎙"}
              </button>
              <button className="send-btn" onClick={sendMessage}
                disabled={loading || (!input.trim() && !file)}>➤</button>
            </div>
          </div>
        )}

        {/* ── Doctor Finder ── */}
        {tab === "doctor" && (
          <div className="tab-content">
            <DoctorRecommendation language={selectedLang.label}/>
          </div>
        )}

        {/* ── History ── */}
        {tab === "history" && (
          <div className="tab-content">
            <div className="history-panel">
              <div className="history-header">
                <h2>📜 Chat History</h2>
                <button className="download-history-btn" onClick={handleDownload}>📥 Download PDF</button>
              </div>
              {chatMsgs.length <= 1 && medicineMsgs.length <= 1 ? (
                <div className="empty-history">No history yet. Start chatting!</div>
              ) : (
                <>
                  {chatMsgs.length > 1 && (
                    <div className="history-section">
                      <div className="history-section-title">💬 Symptom Chat</div>
                      {chatMsgs.slice(1).map((msg, i) => (
                        <div key={i} className={`history-item ${msg.role}`}>
                          <div className="history-role">{msg.role === "user" ? "👤 You" : "⚕ DoctorBot"}</div>
                          <div className="history-text" style={{ whiteSpace:"pre-wrap" }}>{msg.content}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {medicineMsgs.length > 1 && (
                    <div className="history-section">
                      <div className="history-section-title">💊 Medicine Queries</div>
                      {medicineMsgs.slice(1).map((msg, i) => (
                        <div key={i} className={`history-item ${msg.role}`}>
                          <div className="history-role">{msg.role === "user" ? "👤 You" : "💊 MedBot"}</div>
                          <div className="history-text" style={{ whiteSpace:"pre-wrap" }}>{msg.content}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}