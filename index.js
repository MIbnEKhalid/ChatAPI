import app from "./src/app.js";

const port = process.env.PORT || 3030;

// Start the server locally. On Vercel the exported app is used as the handler.
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

export default app;
