import { useEffect, useRef, useState } from "react";
import "./App.css";

const DEFAULT_MESSAGES = [
{
role:"bot",
text:`👋 Hi! I'm DoctorAI.

I can help you:

• Understand symptoms
• Explain medical reports
• Analyze skin images
• Answer health questions

Please note: I provide educational information only and do not replace professional medical advice.`
}
]

function App() {
  const [messages, setMessages] = useState(DEFAULT_MESSAGES);
  const [input, setInput] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(Date.now());

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  const readFileAsDataUrl = (selectedFile) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(selectedFile);
    });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    setMicSupported(!!SpeechRecognition);
    setSpeechOutputSupported(!!window.speechSynthesis);
  }, []);

  useEffect(() => {
    if (!voiceEnabled && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [voiceEnabled]);


useEffect(() => {
localStorage.setItem(
"doctorChats",
JSON.stringify(chatHistory)
);
}, [chatHistory]);
useEffect(() => {
const saved =
localStorage.getItem("doctorChats");

if(saved){
setChatHistory(JSON.parse(saved));
}
}, []);
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    if (file.type?.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);

      return () => URL.revokeObjectURL(url);
    }

    setPreviewUrl(null);
  }, [file]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort?.();
        recognitionRef.current = null;
      }

      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const startVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    if (!navigator.onLine) {
      alert(
        "Voice input needs an internet connection in this browser. Please check your connection or use typing instead."
      );
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort?.();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;
    setIsListening(true);

    recognition.onstart = () => {
      console.log("Voice recognition started");
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript.trim()) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);

      if (event.error === "not-allowed") {
        alert(
          "Microphone permission is blocked. Please allow microphone access in your browser."
        );
      } else if (event.error === "network") {
        alert(
          "The speech service could not connect. Check your internet connection or try again later."
        );
      } else if (event.error === "audio-capture") {
        alert("No microphone was detected or it is unavailable.");
      } else if (event.error === "no-speech") {
        alert("No speech was detected. Please try again.");
      } else {
        alert("Mic Error: " + event.error);
      }

      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (error) {
      console.error("Could not start speech recognition:", error);
      setIsListening(false);
      recognitionRef.current = null;
      alert("Could not start voice input.");
    }
  };

  const speakText = (text) => {
    if (!voiceEnabled) return;
    if (!speechOutputSupported || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      console.log("Voice Output ON");
    };

    utterance.onend = () => {
      console.log("Voice Finished");
    };

    window.speechSynthesis.speak(utterance);
  };

  const startNewChat = () => {
    setMessages(DEFAULT_MESSAGES);
    setInput("");
    setFile(null);
    setPreviewUrl(null);
    setCurrentChatId(Date.now());
  };

  const openChat = (chat) => {
    setMessages(chat.messages || DEFAULT_MESSAGES);
    setCurrentChatId(chat.id);
    setInput("");
    setFile(null);
    setPreviewUrl(null);
  };

  const handleSend = async () => {
    if (loading) return;
    if (!input.trim() && !file) return;

    const userText = input.trim()
      ? input.trim()
      : file
      ? `Uploaded file: ${file.name}`
      : "";

    const currentInput = input;
    const currentFile = file;
    const currentMessages = messages;

    setInput("");
    setFile(null);
    setPreviewUrl(null);
    setLoading(true);

    const optimisticMessages = [
      ...currentMessages,
      { role: "user", text: userText },
    ];

    setMessages(optimisticMessages);

    try {
      const payload = {
        message: currentInput,
      };

      if (currentFile) {
        const fileDataUrl = await readFileAsDataUrl(currentFile);
        payload.fileName = currentFile.name;
        payload.fileType = currentFile.type;
        payload.fileDataUrl = fileDataUrl;
      }

      const response = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      const botReply = data.reply || "No response received.";

      const updatedMessages = [
        ...optimisticMessages,
        { role: "bot", text: botReply },
      ];

      setMessages(updatedMessages);
      speakText(botReply);

      setChatHistory((prev) => [
        ...prev.filter((chat) => chat.id !== currentChatId),
        {
          id: currentChatId,
          title: userText.substring(0, 30) || "New Chat",
          messages: updatedMessages,
        },
      ]);
    } catch (error) {
      console.error(error);

      const updatedMessages = [
        ...optimisticMessages,
        { role: "bot", text: "Server error. Please try again." },
      ];

      setMessages(updatedMessages);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSend();
  };

  const sortedHistory = [...chatHistory].sort((a, b) => b.id - a.id);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>🩺 AI Doctor</h2>
          <p>Your recent conversations</p>
        </div>

        <button className="new-chat-btn" onClick={startNewChat}>
          ➕ New Chat
        </button>

        <div className="history-list">
          {sortedHistory.length === 0 ? (
            <div className="history-empty">Start chatting to create history</div>
          ) : (
            sortedHistory.map((chat) => (
              <div
                key={chat.id}
                className={`history-item ${
                  chat.id === currentChatId ? "active" : ""
                }`}
                onClick={() => openChat(chat)}
              >
                {chat.title || "Chat"}
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="main-area">
        <div className="ambient ambient-one"></div>
        <div className="ambient ambient-two"></div>
        <div className="ambient ambient-three"></div>

        <div className="chat-column">
          <header className="chat-topbar">
            <div>
              <h1 className="chat-title">AI Doctor Bot</h1>
              <p className="chat-subtitle">Medical assistant</p>
            </div>

            <div className="status-pill">
              <span className="pulse-dot"></span>
              AI Health Assistant
            </div>
          </header>

          <section className="chat-panel">
            <div className="chat-window">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`message-row ${
                    msg.role === "user" ? "user" : "bot"
                  }`}
                >
                  <div className={`message-bubble ${msg.role}`}>
                    <div className="message-text">{msg.text}</div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="message-row bot">
                  <div className="message-bubble bot typing">
                    <div className="typing-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {file && (
              <div className="attachment-card">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Uploaded preview"
                    className="attachment-preview"
                  />
                ) : (
                  <div className="attachment-preview pdf-preview">PDF</div>
                )}

                <div className="attachment-meta">
                  <div className="attachment-title">{file.name}</div>
                  <div className="attachment-subtitle">
                    {(file.size / 1024).toFixed(1)} KB • Ready to analyze
                  </div>
                </div>

                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => setFile(null)}
                >
                  Remove
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />

            <div className="composer">
              <button
                type="button"
                className="icon-btn attach-btn"
                onClick={openFilePicker}
                aria-label="Upload file"
                title="Upload file"
              >
                +
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe symptoms or upload a medical report..."
                className="composer-input"
              />

              <button
                type="button"
                className={`icon-btn mic-btn ${isListening ? "listening" : ""}`}
                onClick={startVoiceInput}
                disabled={!micSupported}
                aria-label="Voice input"
                title={
                  micSupported ? "Voice input" : "Voice input not supported"
                }
              >
                {isListening ? "●" : "🎤"}
              </button>

              <button
                type="button"
                className={`icon-btn voice-toggle-btn ${
                  voiceEnabled ? "voice-on" : "voice-off"
                }`}
                onClick={() => {
                  setVoiceEnabled((prev) => {
                    const next = !prev;

                    if (!next && window.speechSynthesis) {
                      window.speechSynthesis.cancel();
                    }

                    return next;
                  });
                }}
                title={
                  voiceEnabled ? "Disable Voice Output" : "Enable Voice Output"
                }
              >
                {voiceEnabled ? "🔊" : "🔇"}
              </button>

              <button
                type="button"
                onClick={handleSend}
                className="send-btn"
                disabled={loading}
                title="Send"
              >
                {loading ? "..." : "➤"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default App;