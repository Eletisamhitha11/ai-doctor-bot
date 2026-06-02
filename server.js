import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { PDFParse } from "pdf-parse";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

if (!process.env.GROQ_API_KEY) {
  throw new Error("Missing GROQ_API_KEY in .env");
}

if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY in .env");
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(fn, attempts = 3) {
  let lastError;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(1000 * (i + 1));
    }
  }

  throw lastError;
}

const prompt = `
You are an AI medical assistant.

Analyze the uploaded medical report.

Return your answer in exactly this format:

🩺 Analysis:
(Simple explanation)

📌 Conclusion:
(Short conclusion)

✅ Precautions:
- Point 1
- Point 2
- Point 3

⚠️ Recommendation:
(When to see a doctor)

Keep the answer under 200 words.
Do not diagnose.
Do not prescribe medicines.
Use simple language.
`;
function imagePrompt(note) {
  return `
Analyze this medical or skin image carefully.

Give your response in exactly these sections:

Analysis:
Conclusion:
Precautions:
Medicinal tips:

Rules:
- Do not diagnose.
- Do not prescribe medicines.
- Mention only possible general causes.
- If the issue looks severe, painful, spreading, infected, or persistent, advise seeing a doctor or dermatologist.
- Keep the response clear, practical, and supportive.

User note:
${note || "No note provided"}
`.trim();
}

function reportPrompt(reportText, note) {
  return `
Analyze this medical report carefully.

Give your response in exactly these sections:

Analysis:
Conclusion:
Precautions:
Medicinal tips:

Rules:
- Do not diagnose.
- Do not prescribe medicines.
- Explain the important findings in simple language.
- If values look abnormal or risky, advise seeing a doctor.
- Keep the response clear, practical, and supportive.

User note:
${note || "No note provided"}

Extracted report text:
${reportText || "No report text extracted"}
`.trim();
}

async function analyzeImage(file, note) {
  const base64Image = file.buffer.toString("base64");

  const result = await withRetry(() =>
    gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: file.mimetype,
            data: base64Image,
          },
        },
        {
          text: imagePrompt(note),
        },
      ],
    })
  );

  return result.text || "No response received.";
}

async function analyzePdf(file, note) {
  const parser = new PDFParse({ data: file.buffer });
  const result = await parser.getText();
  await parser.destroy();

  const reportText = result?.text || "";

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content:
          "You are a professional AI health assistant. Give educational guidance only. Do not diagnose or prescribe medicines. Be concise, clear, and safe. If report findings look serious, advise seeing a doctor.",
      },
      {
        role: "user",
        content: reportPrompt(reportText, note),
      },
    ],
  });

  return completion.choices[0]?.message?.content || "No response received.";
}

app.post("/chat", upload.single("file"), async (req, res) => {
  try {
    console.log("===== DEBUG =====");
    console.log("Message:", req.body.message);
    console.log("File received:", req.file?.originalname);
    console.log("Mime type:", req.file?.mimetype);
    console.log("File size:", req.file?.size);
    console.log("=================");

    const message = req.body.message || "";
    const hasFile = !!req.file;

    if (!hasFile) {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are a professional AI health assistant. Give educational guidance only. Do not diagnose or prescribe medicines. Be concise, clear, and safe. If symptoms are serious, advise seeing a doctor.",
          },
          {
            role: "user",
            content: symptomPrompt(message),
          },
        ],
      });

      const reply =
        completion.choices[0]?.message?.content || "No response received.";

      return res.json({ reply });
    }

    if (req.file.mimetype.startsWith("image/")) {
      const reply = await analyzeImage(req.file, message);
      return res.json({ reply });
    }

    if (req.file.mimetype === "application/pdf") {
      const reply = await analyzePdf(req.file, message);
      return res.json({ reply });
    }

    return res.status(400).json({
      reply: "Please upload an image or PDF report.",
    });
  } catch (error) {
    console.error("Backend error message:", error?.message);
    console.error("Backend error full:", error);
    return res.status(500).json({
      reply: "Server error. Please try again.",
    });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});