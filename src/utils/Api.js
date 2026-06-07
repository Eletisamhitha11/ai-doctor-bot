// In production (Netlify), functions live at /.netlify/functions/<name>
// netlify dev also serves on the same path (port 8888 by default)
const API_BASE = import.meta.env.VITE_API_BASE || "";

export const CHAT_URL = `${API_BASE}/.netlify/functions/chat`;
export const DOCTOR_URL = `${API_BASE}/.netlify/functions/recommend-doctor`;

export default API_BASE;