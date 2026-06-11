// ── Local dev server — mirrors netlify/functions/chat.js & recommend-doctor.js
// Run: node server.js   (in one terminal)
// Run: npm run dev      (in another terminal)
// This is ONLY for local development. Netlify handles functions in production.

import express from "express";
import cors from "cors";
import { readFileSync } from "fs";

// Load .env manually (no dotenv package needed in newer Node)
try {
  const env = readFileSync(".env", "utf8");
  env.split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  });
} catch {}

import Groq from "groq-sdk";

const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });
const app   = express();

app.use(cors());
app.use(express.json({ limit: "20mb" })); // allow large base64 payloads

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) { last = e; await sleep(1200 * (i + 1)); }
  }
  throw last;
}

// ── Gemini via REST — tries 2.5-flash then 1.5-flash as fallback ─────────────
async function callGemini({ prompt, fileType, fileDataUrl }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.startsWith("AIza")) {
    throw new Error(
      "Invalid or missing GEMINI_API_KEY. " +
      "Get a free key at https://aistudio.google.com/apikey — it must start with 'AIza'."
    );
  }

  const parts = [];
  if (fileDataUrl) {
    const base64 = fileDataUrl.includes(",") ? fileDataUrl.split(",")[1] : fileDataUrl;
    parts.push({ inline_data: { mime_type: fileType, data: base64 } });
  }
  parts.push({ text: prompt });

  // Try gemini-2.5-flash first, fall back to gemini-1.5-flash
  const models = ["gemini-2.5-flash", "gemini-1.5-flash"];
  let lastErr;

  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }] }),
      }
    );

    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { lastErr = new Error(`Gemini invalid JSON: ${raw.slice(0, 200)}`); continue; }

    if (!res.ok) {
      lastErr = new Error(data?.error?.message || `Gemini ${model} error ${res.status}`);
      console.warn(`[Gemini] ${model} failed:`, lastErr.message);
      continue;
    }

    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
    if (text) return text;
    lastErr = new Error("Gemini returned empty response");
  }

  throw lastErr;
}

// ── Prompts ───────────────────────────────────────────────────────────────────
const symptomPrompt = (msg, lang, history = []) => {
  const ctx = history.slice(-4).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");
  return `You are DoctorBot AI. Always respond in ${lang}. Simple language, under 120 words. No diagnosis. No prescriptions. Be friendly.
${ctx ? ctx + "\n\n" : ""}Format:
💬 What I Found:
(2-3 sentences)
✅ What You Can Do:
• Tip 1  • Tip 2  • Tip 3
👨‍⚕️ When To See A Doctor: (1 sentence)
User symptoms: ${msg}`;
};

const medicinePrompt = (query, lang) =>
  `You are DoctorBot AI, a medical info assistant. Respond in ${lang}. Under 150 words. Never advise stopping prescribed medicine.
Format:
💊 About This Medicine: (2 sentences)
📋 Common Uses: • Use 1  • Use 2  • Use 3
⚠️ Side Effects: • Effect 1  • Effect 2
🚫 Warnings: • Warning 1  • Warning 2
👨‍⚕️ Always consult your doctor before changing medication.
Query: ${query}`;

const imagePrompt  = (note, lang) =>
  `You are DoctorBot AI. Analyze this medical image. Respond in ${lang}. Max 100 words. No diagnosis.
Format:
👀 What I Notice: (explanation)
✅ Care Tips: • Tip 1  • Tip 2
👨‍⚕️ Medical Advice: (when to see doctor)
Note: ${note || "none"}`;

const reportPrompt = (note, lang) =>
  `You are DoctorBot AI. Analyze this medical report. Respond in ${lang}. Max 150 words. No diagnosis.
Format:
📄 Report Summary: (2-3 sentences)
⚠ Important Points: • Point 1  • Point 2
✅ What You Can Do: • Point 1  • Point 2
👨‍⚕️ Doctor Advice: (short)
Note: ${note || "none"}`;

const doctorPrompt = (symptoms, location, lang) =>
  `Medical triage assistant. Recommend specialist. Respond in ${lang}.
Return ONLY valid JSON (no markdown):
{"primarySpecialist":"","reason":"","urgency":"low|medium|high","urgencyLabel":"","alternativeSpecialists":[],"whatToExpect":"","questionsToAsk":[],"redFlags":[]}
Symptoms: ${symptoms}
Location: ${location || "Not provided"}`;

// ── /chat ─────────────────────────────────────────────────────────────────────
app.post("/.netlify/functions/chat", async (req, res) => {
  try {
    const { message = "", history = [], mode = "symptom", language = "English", fileType = "", fileDataUrl = "", fileName = "" } = req.body;

    console.log(`[chat] mode=${mode} | lang=${language} | file=${fileName || "none"}`);

    const emergency = ["chest pain","heart attack","stroke","seizure","can't breathe","difficulty breathing","unconscious","severe bleeding"];
    if (emergency.some((w) => message.toLowerCase().includes(w))) {
      return res.json({ reply: "🚨 Emergency Warning\n\nPlease call emergency services (112 / 911) or go to the nearest hospital immediately." });
    }

    if (!fileDataUrl) {
      const prompt = mode === "medicine" ? medicinePrompt(message, language) : symptomPrompt(message, language, history);
      const completion = await withRetry(() => groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: `You are DoctorBot AI. Respond in ${language}. Never diagnose or prescribe.` },
          ...history.slice(-4).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
          { role: "user", content: prompt },
        ],
      }));
      return res.json({ reply: completion.choices[0]?.message?.content || "No response." });
    }

    if (fileType.startsWith("image/")) {
      return res.json({ reply: await withRetry(() => callGemini({ prompt: imagePrompt(message, language), fileType, fileDataUrl })) });
    }

    if (fileType === "application/pdf") {
      return res.json({ reply: await withRetry(() => callGemini({ prompt: reportPrompt(message, language), fileType, fileDataUrl })) });
    }

    res.status(400).json({ reply: `Unsupported file type: ${fileName || fileType}` });
  } catch (err) {
    console.error("[chat error]", err.message);
    res.status(500).json({ reply: `❌ Error: ${err.message}` });
  }
});

// ── /recommend-doctor ─────────────────────────────────────────────────────────
app.post("/.netlify/functions/recommend-doctor", async (req, res) => {
  try {
    const { symptoms, location, language = "English" } = req.body;
    if (!symptoms?.trim()) return res.status(400).json({ error: "Symptoms required" });

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Return only valid JSON. No markdown." },
        { role: "user",   content: doctorPrompt(symptoms, location, language) },
      ],
    });

    const raw   = completion.choices[0]?.message?.content || "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    res.json(JSON.parse(clean));
  } catch (err) {
    console.error("[doctor error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 8888;
app.listen(PORT, () => {
  console.log(`\n✅ DoctorBot local dev server running`);
  console.log(`   Functions : http://localhost:${PORT}/.netlify/functions/chat`);
  console.log(`   Now run   : npm run dev   (in another terminal)\n`);
});