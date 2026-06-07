import { useState } from "react";
import API_BASE from "../utils/api";

const URGENCY_COLORS = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444" };
const URGENCY_BG = { low: "#dcfce7", medium: "#fef3c7", high: "#fee2e2" };

export default function DoctorRecommendation({ language = "English" }) {
  const [symptoms, setSymptoms] = useState("");
  const [location, setLocation] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getRecommendation = async () => {
    if (!symptoms.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch(`${API_BASE}/recommend-doctor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symptoms, location, language }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e.message || "Failed to get recommendation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dr-panel">
      <div className="dr-header">
        <span className="dr-icon">👨‍⚕️</span>
        <div>
          <h2 className="dr-title">Doctor Finder</h2>
          <p className="dr-subtitle">Find the right specialist for your symptoms</p>
        </div>
      </div>

      <div className="dr-form">
        <textarea
          className="dr-textarea"
          placeholder="Describe your symptoms in detail (e.g. severe headache for 3 days, blurry vision, nausea...)"
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          rows={4}
        />
        <input
          className="dr-input"
          placeholder="Your city/location (optional)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <button className="dr-btn" onClick={getRecommendation} disabled={loading || !symptoms.trim()}>
          {loading ? (
            <><span className="spinner-sm" /> Analyzing...</>
          ) : (
            <> Find My Doctor →</>
          )}
        </button>
      </div>

      {error && <div className="dr-error">⚠ {error}</div>}

      {result && (
        <div className="dr-result">
          {/* Primary Card */}
          <div className="dr-primary-card">
            <div className="dr-specialist-badge">Primary Recommendation</div>
            <div className="dr-specialist-name">🏥 {result.primarySpecialist}</div>
            <p className="dr-reason">{result.reason}</p>
            <div
              className="dr-urgency-badge"
              style={{ background: URGENCY_BG[result.urgency], color: URGENCY_COLORS[result.urgency] }}
            >
              ⏰ {result.urgencyLabel}
            </div>
          </div>

          {/* Grid details */}
          <div className="dr-grid">
            {result.alternativeSpecialists?.length > 0 && (
              <div className="dr-detail-card">
                <h4>🔀 Alternatives</h4>
                <ul>{result.alternativeSpecialists.map((s) => <li key={s}>• {s}</li>)}</ul>
              </div>
            )}
            {result.whatToExpect && (
              <div className="dr-detail-card">
                <h4>📋 What to Expect</h4>
                <p>{result.whatToExpect}</p>
              </div>
            )}
          </div>

          {result.questionsToAsk?.length > 0 && (
            <div className="dr-detail-card full">
              <h4>💬 Questions to Ask Your Doctor</h4>
              <ul className="dr-questions">
                {result.questionsToAsk.map((q, i) => <li key={i}><span className="q-num">{i + 1}</span>{q}</li>)}
              </ul>
            </div>
          )}

          {result.redFlags?.length > 0 && (
            <div className="dr-detail-card full red-flag-card">
              <h4>🚨 Red Flags — Seek Emergency Care If:</h4>
              <ul>{result.redFlags.map((f, i) => <li key={i}>⚠ {f}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}