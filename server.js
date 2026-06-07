import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { createRequire } from "module";
import crypto from "crypto";

dotenv.config();

const require = createRequire(import.meta.url);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "20mb" }));

if (!process.env.GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY in .env");
if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY in .env");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── In-memory user store (replace with DB in production) ───────────────────
const users = new Map();
const sessions = new Map();

function hashPassword(password) {
  return crypto.createHash("sha256").update(password + "doctorbot_salt").digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = sessions.get(token);
  next();
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────
app.post("/auth/signup", (req, res) => {
  const { name, email, password, age, gender } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required" });
  }
  if (users.has(email)) {
    return res.status(409).json({ error: "Email already registered" });
  }
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    password: hashPassword(password),
    age: age || null,
    gender: gender || null,
    createdAt: new Date().toISOString(),
    chatHistory: [],
  };
  users.set(email, user);
  const token = generateToken();
  sessions.set(token, { id: user.id, email, name });
  res.json({ token, user: { id: user.id, name, email, age, gender } });
});

app.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user || user.password !== hashPassword(password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = generateToken();
  sessions.set(token, { id: user.id, email, name: user.name });
  res.json({ token, user: { id: user.id, name: user.name, email, age: user.age, gender: user.gender } });
});

app.post("/auth/logout", requireAuth, (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  sessions.delete(token);
  res.json({ success: true });
});

app.get("/auth/me", requireAuth, (req, res) => {
  const user = users.get(req.user.email);
  res.json({ id: user.id, name: user.name, email: user.email, age: user.age, gender: user.gender });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) { lastError = e; await sleep(1000 * (i + 1)); }
  }
  throw lastError;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────
function symptomPrompt(message, lang = "English") {
  return `
You are DoctorAI, a friendly healthcare assistant. Always respond in ${lang}.

Rules:
- Answer like you're talking to a normal person.
- Keep the response under 120 words.
- Use simple language (in ${lang}).
- Do not diagnose diseases.
- Do not prescribe medicines.
- Be friendly and reassuring.

Format:
💬 What I Found:
(2-3 short sentences)

✅ What You Can Do:
• Tip 1
• Tip 2
• Tip 3

👨‍⚕️ When To See A Doctor:
(1 short sentence)

User symptoms: ${message}
`;
}

function imagePrompt(note, lang = "English") {
  return `
You are DoctorAI. Analyze the uploaded image. Respond in ${lang}.

Rules:
- Simple language. Maximum 100 words. Do not diagnose. Do not prescribe.

Format:
👀 What I Notice:
(Simple explanation)

✅ Care Tips:
• Tip 1
• Tip 2
• Tip 3

👨‍⚕️ Medical Advice:
(When doctor consultation is recommended)

User note: ${note || "No note"}
`;
}

function reportPrompt(reportText, note, lang = "English") {
  return `
You are DoctorAI. Analyze this medical report. Respond in ${lang}.

Rules:
- Maximum 150 words. Explain findings simply. Mention only important findings. Do not diagnose. Do not prescribe.

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

Report content: ${reportText}
User note: ${note || "No note"}
`;
}

function doctorRecommendationPrompt(symptoms, location, lang = "English") {
  return `
You are DoctorAI. Based on the symptoms provided, recommend what type of medical specialist the user should see. Respond in ${lang}.

Return ONLY valid JSON (no markdown, no backticks) in this exact format:
{
  "primarySpecialist": "Specialist Name",
  "reason": "Short reason why (1 sentence)",
  "urgency": "low|medium|high",
  "urgencyLabel": "Schedule within X days/weeks",
  "alternativeSpecialists": ["Specialist 2", "Specialist 3"],
  "whatToExpect": "Brief description of what the appointment will involve",
  "questionsToAsk": ["Question 1", "Question 2", "Question 3"],
  "redFlags": ["Warning sign 1", "Warning sign 2"]
}

Symptoms: ${symptoms}
Location context: ${location || "Not provided"}
`;
}

// ─── Image Analysis ──────────────────────────────────────────────────────────
async function analyzeImage(file, note, lang) {
  const base64Image = file.buffer.toString("base64");
  const result = await withRetry(() =>
    gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
  {
    role: "user",
    contents: [
  {
    role: "user",
    parts: [
      {
        inlineData: {
          mimeType: file.mimetype,
          data: base64Image,
        },
      },
      {
        text: imagePrompt(note, lang),
      },
    ],
  },
],
  },
],
    })
  );
  return result.text || "No response received.";
}

// ─── PDF Analysis ─────────────────────────────────────────────────────────────
async function analyzePdf(file, note, lang) {
  let reportText = "";
  try {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(file.buffer);
    reportText = data.text || "";
  } catch (e) {
    reportText = "Could not extract text from PDF.";
  }

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: "You are DoctorAI, a friendly healthcare assistant." },
      { role: "user", content: reportPrompt(reportText, note, lang) },
    ],
  });
  return completion.choices[0]?.message?.content || "No response received.";
}

// ─── Chat Endpoint ────────────────────────────────────────────────────────────
app.post("/chat", upload.single("file"), async (req, res) => {
  try {
    const message = req.body.message || "";
    const lang = req.body.language || "English";
    const hasFile = !!req.file;

    if (!hasFile) {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: `You are DoctorAI, a friendly healthcare assistant. Always respond in ${lang}. Give educational guidance only. Do not diagnose or prescribe.` },
          { role: "user", content: symptomPrompt(message, lang) },
        ],
      });
      return res.json({ reply: completion.choices[0]?.message?.content || "No response." });
    }

    if (req.file.mimetype.startsWith("image/")) {
      return res.json({ reply: await analyzeImage(req.file, message, lang) });
    }

    if (req.file.mimetype === "application/pdf") {
      return res.json({ reply: await analyzePdf(req.file, message, lang) });
    }

    return res.status(400).json({ reply: "Please upload an image or PDF report." });
  } catch (error) {
    console.error("Chat error:", error?.message);
    return res.status(500).json({ reply: "Server error. Please try again." });
  }
});

// ─── Doctor Recommendation Endpoint ──────────────────────────────────────────
app.post("/recommend-doctor", async (req, res) => {
  try {
    const { symptoms, location, language } = req.body;
    const lang = language || "English";

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "You are a medical triage assistant. Return only valid JSON, no markdown." },
        { role: "user", content: doctorRecommendationPrompt(symptoms, location, lang) },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    const recommendation = JSON.parse(clean);
    res.json(recommendation);
  } catch (error) {
    console.error("Doctor rec error:", error?.message);
    res.status(500).json({ error: "Could not generate recommendation." });
  }
});

// ─── Save Chat History ────────────────────────────────────────────────────────
app.post("/save-chat", requireAuth, (req, res) => {
  const { messages } = req.body;
  const user = users.get(req.user.email);
  if (user) {
    user.chatHistory = messages;
    users.set(req.user.email, user);
  }
  res.json({ success: true });
});

app.get("/chat-history", requireAuth, (req, res) => {
  const user = users.get(req.user.email);
  res.json({ history: user?.chatHistory || [] });
});

app.listen(5000, () => console.log("✅ DoctorBot server running on port 5000"));