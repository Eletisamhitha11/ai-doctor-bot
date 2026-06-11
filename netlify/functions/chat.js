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
    if (!base64 || base64.length < 10) throw new Error("File data appears empty or corrupted");
    parts.push({ inline_data: { mime_type: fileType, data: base64 } });
  }
  parts.push({ text: prompt });

  // Try 2.5-flash first, fall back to 1.5-flash
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

    const responseText = await res.text();
    console.log(`Gemini [${model}] status:`, res.status);

    if (!responseText || responseText.trim() === "") {
      lastErr = new Error("Gemini returned empty response"); continue;
    }

    let data;
    try { data = JSON.parse(responseText); }
    catch { lastErr = new Error(`Gemini invalid JSON: ${responseText.slice(0, 200)}`); continue; }

    if (!res.ok) {
      lastErr = new Error(data?.error?.message || `Gemini ${model} error ${res.status}`);
      console.warn(`[Gemini] ${model} failed:`, lastErr.message);
      continue;
    }

    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
    if (text) return text;
    lastErr = new Error("Gemini returned empty text");
  }

  throw lastErr;
}

// ── Prompts ──────────────────────────────────────────────────────────────────
function symptomPrompt(message, lang, history = []) {
  const ctx = history.length
    ? history.slice(-4).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n") + "\n\n"
    : "";
  return `You are DoctorBot AI, a friendly healthcare assistant. Always respond in ${lang}.
Rules: Simple language. Under 120 words. Do NOT diagnose. Do NOT prescribe. Be friendly.
If user says "tell me more" / "explain" / "why" — continue the last topic.

${ctx}Format:
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
Rules: Patient-friendly language. Under 150 words. Never advise stopping prescribed medicine. Always recommend a doctor.

Format:
💊 About This Medicine:
(What it is and treats — 2 sentences)

📋 Common Uses:
• Use 1
• Use 2
• Use 3

⚠️ Common Side Effects:
• Effect 1
• Effect 2

🚫 Important Warnings:
• Warning 1
• Warning 2

👨‍⚕️ Always consult your doctor before starting, stopping or changing any medication.

Medicine query: ${query}`;
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
(When to see a doctor)

User note: ${note || "No note"}`;
}

function reportPrompt(note, lang) {
  return `You are DoctorBot AI. Analyze this medical report or document. Respond in ${lang}.
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

// ── Main handler ──────────────────────────────────────────────────────────────
export async function handler(event) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ reply: "Method not allowed." }) };
  }

  try {
    // Parse body — handle both base64-encoded and plain bodies
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;

    if (!rawBody || rawBody.trim() === "") {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ reply: "❌ Empty request body." }) };
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr.message, "| raw:", rawBody.slice(0, 200));
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ reply: "❌ Invalid request format." }) };
    }

    const {
      message    = "",
      history    = [],
      mode       = "symptom",
      language   = "English",
      fileType   = "",
      fileDataUrl = "",
      fileName   = "",
    } = body;

    console.log(`mode=${mode} | lang=${language} | file=${fileName || "none"} | bodyLen=${rawBody.length}`);

    // ── Emergency check ────────────────────────────────────────────────────
    const emergencyWords = [
      "chest pain", "heart attack", "stroke", "seizure",
      "can't breathe", "difficulty breathing", "unconscious", "severe bleeding",
    ];
    if (emergencyWords.some((w) => message.toLowerCase().includes(w))) {
      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({
          reply: "🚨 Emergency Warning\n\nThese symptoms may need urgent medical attention.\n\nPlease call emergency services (112 / 911) or go to the nearest hospital immediately.",
        }),
      };
    }

    // ── No file: text chat ─────────────────────────────────────────────────
    if (!fileDataUrl) {
      if (!message.trim()) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ reply: "Please type a message." }) };
      }

      const prompt = mode === "medicine"
        ? medicinePrompt(message, language)
        : symptomPrompt(message, language, history);

      const completion = await withRetry(() =>
        groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: `You are DoctorBot AI. Respond in ${language}. Never diagnose or prescribe.` },
            ...history.slice(-4).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
            { role: "user", content: prompt },
          ],
        })
      );

      return {
        statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ reply: completion.choices[0]?.message?.content || "No response received." }),
      };
    }

    // ── Image ──────────────────────────────────────────────────────────────
    if (fileType.startsWith("image/")) {
      const reply = await withRetry(() =>
        callGemini({ prompt: imagePrompt(message, language), fileType, fileDataUrl })
      );
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ reply }) };
    }

    // ── PDF ────────────────────────────────────────────────────────────────
    if (fileType === "application/pdf") {
      const reply = await withRetry(() =>
        callGemini({ prompt: reportPrompt(message, language), fileType, fileDataUrl })
      );
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ reply }) };
    }

    return {
      statusCode: 400, headers: corsHeaders,
      body: JSON.stringify({ reply: `Unsupported file type${fileName ? `: ${fileName}` : ""}. Please upload an image or PDF.` }),
    };

  } catch (err) {
    console.error("chat handler error:", err?.message, err?.stack);
    return {
      statusCode: 500, headers: corsHeaders,
      body: JSON.stringify({ reply: `❌ Server error: ${err?.message || "Unknown error"}. Please try again.` }),
    };
  }
}