export async function handler(event) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      reply: "Hello from Netlify Function 🚀",
    }),
  };
}