import { useState, useRef, useCallback } from "react";

export const LANGUAGES = [
  { code: "en-US", label: "English", flag: "🇺🇸" },
  { code: "hi-IN", label: "Hindi", flag: "🇮🇳" },
  { code: "te-IN", label: "Telugu", flag: "🇮🇳" },
  { code: "ta-IN", label: "Tamil", flag: "🇮🇳" },
  { code: "kn-IN", label: "Kannada", flag: "🇮🇳" },
  { code: "ml-IN", label: "Malayalam", flag: "🇮🇳" },
  { code: "mr-IN", label: "Marathi", flag: "🇮🇳" },
  { code: "bn-IN", label: "Bengali", flag: "🇮🇳" },
  { code: "gu-IN", label: "Gujarati", flag: "🇮🇳" },
  { code: "pa-IN", label: "Punjabi", flag: "🇮🇳" },
  { code: "fr-FR", label: "French", flag: "🇫🇷" },
  { code: "es-ES", label: "Spanish", flag: "🇪🇸" },
  { code: "de-DE", label: "German", flag: "🇩🇪" },
  { code: "ar-SA", label: "Arabic", flag: "🇸🇦" },
  { code: "zh-CN", label: "Chinese", flag: "🇨🇳" },
];

export function useVoice({ language = "en-US", onTranscript }) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [supported] = useState(() => "webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const recognitionRef = useRef(null);

  const startListening = useCallback(() => {
    if (!supported) return alert("Speech recognition not supported in this browser.");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      onTranscript?.(transcript);
    };
    recognition.start();
    recognitionRef.current = recognition;
  }, [language, onTranscript, supported]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback((text, langCode = language) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const stripped = text.replace(/[*•#_~`]/g, "").replace(/[\u{1F300}-\u{1FFFF}]/gu, "");
    const utter = new SpeechSynthesisUtterance(stripped);
    utter.lang = langCode;
    utter.rate = 0.95;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  }, [language]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { listening, speaking, supported, startListening, stopListening, speak, stopSpeaking };
}