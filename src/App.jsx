import { useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "👋 Welcome! You can describe your symptoms or upload a medical image/report for analysis.",
    },
  ]);

  const [input, setInput] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

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

  const handleSend = async () => {
    if (loading) return;
    if (!input.trim() && !file) return;

    const userText = input.trim()
      ? input.trim()
      : file
      ? `Uploaded file: ${file.name}`
      : "";

    setMessages((prev) => [...prev, { role: "user", text: userText }]);

    const currentInput = input;
    const currentFile = file;

    setInput("");
    setFile(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("message", currentInput);

      if (currentFile) {
        formData.append("file", currentFile);
      }

      const response = await fetch("/.netlify/functions/chat", {
  method: "POST",
  body: formData,
});

      const data = await response.json();
      const botReply = data.reply || "No response received.";

      setMessages((prev) => [...prev, { role: "bot", text: botReply }]);
      speakText(botReply);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Server error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one"></div>
      <div className="ambient ambient-two"></div>
      <div className="ambient ambient-three"></div>

      <div className="app-card">
        <header className="hero">
          <div className="eyebrow">
            <span className="pulse-dot"></span>
            AI Health Assistant
          </div>

          <h1>AI Doctor Bot</h1>

          <p>
            Ask by symptoms or upload a skin image, scan, or medical report.
            Voice input and voice output are supported.
          </p>
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
              placeholder="Ask anything..."
              className="composer-input"
            />

            <button
              type="button"
              className={`icon-btn mic-btn ${isListening ? "listening" : ""}`}
              onClick={startVoiceInput}
              disabled={!micSupported}
              aria-label="Voice input"
              title={micSupported ? "Voice input" : "Voice input not supported"}
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
  );
}

export default App;