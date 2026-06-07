import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function doctorPrompt(symptoms, location, lang) {
  return `You are a medical triage assistant. Based on symptoms, recommend the right specialist. Respond in ${lang}.
Return ONLY valid JSON (no markdown, no backticks, no extra text):
{
  "primarySpecialist": "Specialist Name",
  "reason": "Short reason (1 sentence)",
  "urgency": "low|medium|high",
  "urgencyLabel": "Schedule within X days/weeks",
  "alternativeSpecialists": ["Alt 1", "Alt 2"],
  "whatToExpect": "Brief description of the appointment",
  "questionsToAsk": ["Question 1", "Question 2", "Question 3"],
  "redFlags": ["Warning sign 1", "Warning sign 2"]
}
Symptoms: ${symptoms}
Location: ${location || "Not provided"}`;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { symptoms, location, language } = JSON.parse(event.body || "{}");
    if (!symptoms?.trim()) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Symptoms required" }) };

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Return only valid JSON. No markdown. No extra text." },
        { role: "user", content: doctorPrompt(symptoms, location, language || "English") },
      ],
    });

    const raw   = completion.choices[0]?.message?.content || "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(JSON.parse(clean)) };
  } catch (err) {
    console.error("recommend-doctor error:", err?.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err?.message || "Failed" }) };
  }
}