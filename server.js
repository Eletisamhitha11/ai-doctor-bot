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

function symptomPrompt(message) {
  return `
You are DoctorAI, a friendly healthcare assistant.

Rules:
- Answer like you're talking to a normal person.
- Keep the response under 100 words.
- Use simple English.
- Do not diagnose diseases.
- Do not prescribe medicines.
- Avoid medical jargon.
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

User symptoms:
${message}
`;
}
function imagePrompt(note) {
  return `
You are DoctorAI.

Analyze the uploaded image.

Rules:
- Use simple language.
- Maximum 100 words.
- Do not diagnose.
- Do not prescribe medicines.
- Mention only visible observations.

Format:

👀 What I Notice:
(Simple explanation)

✅ Care Tips:
• Tip 1
• Tip 2
• Tip 3

👨‍⚕️ Medical Advice:
(When doctor consultation is recommended)

User note:
${note || "No note"}
`;
}

function reportPrompt(note) {
  return `
You are DoctorAI.

Analyze the uploaded medical report.

Rules:
- Maximum 120 words.
- Explain findings like talking to a patient.
- Mention only important findings.
- Ignore normal values.
- Do not diagnose.
- Do not prescribe medicines.

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

User note:
${note || "No note"}
`;
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
          "You are DoctorAI, a friendly healthcare assistant. Explain everything in simple language. Keep answers short. Never diagnose diseases. Never prescribe medicines. Focus on helping patients understand their health.",
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