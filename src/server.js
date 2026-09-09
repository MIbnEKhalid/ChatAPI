import app from "./app.js";

const PORT = process.env.PORT || 3030;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`ChatAPI server running on http://localhost:${PORT}`);
  });
}

export default app;
