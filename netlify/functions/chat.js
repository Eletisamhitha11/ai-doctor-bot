import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) { last = e; await sleep(1000 * (i + 1)); }
  }
  throw last;
}

// ── Gemini via REST (no SDK needed, works reliably on Netlify) ───────────────
async function callGemini({ prompt, fileType, fileDataUrl }) {
  const parts = [];
  if (fileDataUrl) {
    // strip data:xxx;base64, prefix if present
    const base64 = fileDataUrl.includes(",") ? fileDataUrl.split(",")[1] : fileDataUrl;
    parts.push({ inline_data: { mime_type: fileType, data: base64 } });
  }
  parts.push({ text: prompt });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }] }),
    }
  );

  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`Gemini invalid JSON: ${raw.slice(0, 200)}`); }
  if (!res.ok) throw new Error(data?.error?.message || `Gemini error ${res.status}`);

  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "No response received.";
}

// ── Prompts ──────────────────────────────────────────────────────────────────
function symptomPrompt(message, lang, history = []) {
  const historyText = history.length
    ? history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n") + "\n\n"
    : "";
  return `You are DoctorBot AI, a friendly healthcare assistant. Always respond in ${lang}.
Rules: Simple language. Under 120 words. Do NOT diagnose. Do NOT prescribe. Be friendly and reassuring.
If user says "tell me more", "explain", "why", "how" — continue explaining the last topic.

${historyText}Format:
💬 What I Found:
(2-3 short sentences)

✅ What You Can Do:
• Tip 1
• Tip 2
• Tip 3

👨‍⚕️ When To See A Doctor:
(1 short sentence)

User symptoms: ${message}`;
}

function medicinePrompt(query, lang) {
  return `You are DoctorBot AI, a medical information assistant. Always respond in ${lang}.
Rules: Simple patient-friendly language. Under 150 words. Never advise stopping prescribed medicine. Always recommend consulting a doctor.

Format:
💊 About This Medicine:
(What it is and what it treats — 2 sentences)

📋 Common Uses:
• Use 1
• Use 2
• Use 3

⚠️ Common Side Effects:
• Side effect 1
• Side effect 2

🚫 Important Warnings:
• Warning 1
• Warning 2

👨‍⚕️ Always consult your doctor before starting, stopping or changing any medication.

Medicine/Drug query: ${query}`;
}

function imagePrompt(note, lang) {
  return `You are DoctorBot AI. Analyze the uploaded medical image. Respond in ${lang}.
Rules: Simple language. Max 100 words. Do not diagnose. Do not prescribe. Mention only visible observations.

Format:
👀 What I Notice:
(Simple explanation)

✅ Care Tips:
• Tip 1
• Tip 2
• Tip 3

👨‍⚕️ Medical Advice:
(When doctor consultation is recommended)

User note: ${note || "No note"}`;
}

function reportPrompt(note, lang) {
  return `You are DoctorBot AI. Analyze this medical report/document. Respond in ${lang}.
Rules: Max 150 words. Explain simply. Only important findings. No diagnosis. No prescriptions.

Format:
📄 Report Summary:
(2-3 simple sentences)

⚠ Important Points:
• Point 1
• Point 2

✅ What You Can Do:
• Point 1
• Point 2

👨‍⚕️ Doctor Advice:
(Short recommendation)

User note: ${note || "No note"}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function handler(event) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ reply: "Method not allowed." }) };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const {
      message   = "",
      history   = [],
      mode      = "symptom",   // symptom | medicine
      language  = "English",
      fileType  = "",
      fileDataUrl = "",
      fileName  = "",
    } = body;

    console.log("mode:", mode, "| lang:", language, "| file:", fileName || "none");

    // ── Emergency check ──────────────────────────────────────────────────────
    const emergencyWords = ["chest pain", "difficulty breathing", "heart attack", "stroke", "seizure", "unconscious", "severe bleeding", "can't breathe"];
    if (emergencyWords.some((w) => message.toLowerCase().includes(w))) {
      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ reply: "🚨 Emergency Warning\n\nThese symptoms may need urgent medical attention.\n\nPlease contact emergency services (112 / 911) or visit the nearest hospital immediately." }),
      };
    }

    // ── No file: text chat ────────────────────────────────────────────────────
    if (!fileDataUrl) {
      const prompt = mode === "medicine" ? medicinePrompt(message, language) : symptomPrompt(message, language, history);
      const completion = await withRetry(() =>
        groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: `You are DoctorBot AI. Respond in ${language}. Never diagnose or prescribe.` },
            // Include history for context
            ...history.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
            { role: "user", content: prompt },
          ],
        })
      );
      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ reply: completion.choices[0]?.message?.content || "No response received." }),
      };
    }

    // ── Image ─────────────────────────────────────────────────────────────────
    if (fileType.startsWith("image/")) {
      const reply = await withRetry(() => callGemini({ prompt: imagePrompt(message, language), fileType, fileDataUrl }));
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ reply }) };
    }

    // ── PDF ───────────────────────────────────────────────────────────────────
    if (fileType === "application/pdf") {
      const reply = await withRetry(() => callGemini({ prompt: reportPrompt(message, language), fileType, fileDataUrl }));
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ reply }) };
    }

    return {
      statusCode: 400, headers: corsHeaders,
      body: JSON.stringify({ reply: `Unsupported file type${fileName ? `: ${fileName}` : ""}. Please upload an image or PDF.` }),
    };

  } catch (err) {
    console.error("chat error:", err?.message, err?.stack);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ reply: `❌ Error: ${err.message}` }) };
  }
}