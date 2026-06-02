import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { PDFParse } from "pdf-parse";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function base64FromDataUrl(dataUrl = "") {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

function dataUrlToBuffer(dataUrl = "") {
  return Buffer.from(base64FromDataUrl(dataUrl), "base64");
}

function symptomPrompt(message) {
  return `
You are a professional AI health assistant.

Give your response in exactly these sections:

Analysis:
Conclusion:
Precautions:
Medicinal tips:

Rules:
- Do not diagnose.
- Do not prescribe medicines.
- Keep it clear, helpful, and concise.
- If symptoms sound serious, tell the user to see a doctor.

User symptoms:
${message || "No symptoms provided."}
`.trim();
}

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

async function analyzeImage(fileType, fileDataUrl, note) {
  const result = await withRetry(() =>
    gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: fileType,
            data: base64FromDataUrl(fileDataUrl),
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

async function analyzePdf(fileDataUrl, note) {
  const buffer = dataUrlToBuffer(fileDataUrl);

  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  await parser.destroy?.();

  const reportText = parsed?.text || "";

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

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ reply: "Method not allowed." }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};

    const {
      message = "",
      fileName = "",
      fileType = "",
      fileDataUrl = "",
    } = body;

    // No file: symptom chat
    if (!fileDataUrl) {
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

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ reply }),
      };
    }

    // Image upload
    if (fileType.startsWith("image/")) {
      const reply = await analyzeImage(fileType, fileDataUrl, message);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ reply }),
      };
    }

    // PDF upload
    if (fileType === "application/pdf") {
      const reply = await analyzePdf(fileDataUrl, message);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ reply }),
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        reply: `Unsupported file type${fileName ? `: ${fileName}` : ""}. Please upload an image or PDF.`,
      }),
    };
  } catch (error) {
    console.error("Netlify Function error:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        reply: "Server error. Please try again.",
      }),
    };
  }
}