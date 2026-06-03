import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
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
async function callGemini({ prompt, fileType, fileDataUrl }) {
  const parts = [];

  if (fileDataUrl) {
    parts.push({
      inline_data: {
        mime_type: fileType,
        data: base64FromDataUrl(fileDataUrl),
      },
    });
  }

  parts.push({ text: prompt });

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts,
          },
        ],
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini request failed");
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "No response received.";

  return text;
}

async function analyzeImage(fileType, fileDataUrl, note) {
  return callGemini({
    prompt: imagePrompt(note),
    fileType,
    fileDataUrl,
  });
}

async function analyzePdf(fileType, fileDataUrl, note) {
  return callGemini({
    prompt: reportPrompt(note),
    fileType,
    fileDataUrl,
  });
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
  history = [],
  fileName = "",
  fileType = "",
  fileDataUrl = "",
} = body;
    const emergencyWords = [
  "chest pain",
  "difficulty breathing",
  "heart attack",
  "stroke",
  "seizure",
  "unconscious",
  "severe bleeding"
];

const emergency = emergencyWords.some(word =>
  message.toLowerCase().includes(word)
);

if (emergency) {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      reply: `🚨 Emergency Warning

These symptoms may need urgent medical attention.

Please contact emergency services or visit the nearest hospital immediately.`
    }),
  };
}
    // No file: symptom chat
    if (!fileDataUrl) {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
  {
    role: "system",
    content: `
You are DoctorAI.

Remember previous messages.

If user says:
"tell me more"
"explain"
"why"
"how"
"details"

continue explaining the LAST medical topic instead of asking for more information.

Be conversational like ChatGPT.
Keep answers simple.
`
  },

  ...history.map(msg => ({
    role:
      msg.role === "bot"
        ? "assistant"
        : "user",
    content: msg.text,
  })),

  {
    role: "user",
    content: symptomPrompt(message),
  },
]
      });

      const intros = [
  "😊 I'm happy to help.",
  "💙 Let's look at this together.",
  "🩺 Here's a simple explanation.",
  "😊 I reviewed the information."
];

const intro =
intros[Math.floor(Math.random() * intros.length)];

const reply =
intro +
"\n\n" +
(
completion.choices[0]?.message?.content ||
"No response received."
);

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
      const reply = await analyzePdf(fileType, fileDataUrl, message);
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