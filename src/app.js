import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { engine } from "express-handlebars";
import helmet from "helmet";
import mbkAuthRouter, { renderError, createNotFoundHandler, createErrorHandler } from "mbkauthe";
import chatRoutes from "./routes/chat.routes.js";
import adminRoutes from "./routes/admin.routes.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(mbkAuthRouter);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
        ],
        styleSrcAttr: ["'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com",
        ],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Minimal Handlebars config for mbkauthe auth pages
app.engine(
  "handlebars",
  engine({
    partialsDir: [
      path.resolve(__dirname, "../node_modules/mbkauthe/views"),
      path.resolve(__dirname, "../node_modules/mbkauthe/views/Error"),
    ],
    cache: false,
    helpers: {
      eq: (a, b) => a === b,
      neq: (a, b) => a !== b,
      encodeURIComponent: (str) => encodeURIComponent(str),
      formatTimestamp: (timestamp) => new Date(timestamp).toLocaleString(),
      jsonStringify: (context) => JSON.stringify(context),
      json: (obj) => JSON.stringify(obj, null, 2),
      objectEntries: (obj) =>
        obj && typeof obj === "object"
          ? Object.entries(obj).map(([key, value]) => ({ key, value }))
          : [],
    },
  })
);

app.set("view engine", "handlebars");
app.set("views", [
  path.resolve(__dirname, "../node_modules/mbkauthe/views"),
]);

// Serve static files
app.use(
  "/assets",
  express.static(path.join(__dirname, "../public/assets"), {
    setHeaders: (res, path) => {
      if (path.endsWith(".css")) {
        res.setHeader("Content-Type", "text/css");
      }
    },
  })
);

app.use("/", chatRoutes);
app.use("/", adminRoutes);

// Serve React frontend in production
const REACT_BUILD_PATH = path.resolve(__dirname, "../frontend/dist");
app.use(express.static(REACT_BUILD_PATH));

// SPA fallback — serve React index.html for all non-API, non-static routes
app.get(/.*/, (req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/mbkauthe") ||
    req.path.startsWith("/assets/") ||
    req.path === "/login" ||
    req.path.startsWith("/icon.svg")
  ) {
    return next();
  }
  const indexPath = path.join(REACT_BUILD_PATH, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>ChatAPI Server</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 3rem; text-align: center; }
          h1 { color: #38bdf8; margin-bottom: 0.5rem; }
          p { color: #94a3b8; font-size: 1.1rem; }
          a { color: #38bdf8; text-decoration: none; font-weight: 600; margin: 0 0.75rem; }
          a:hover { text-decoration: underline; }
          .card { background: #1e293b; border-radius: 12px; padding: 2rem; max-width: 600px; margin: 2rem auto; border: 1px solid #334155; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>ChatAPI Backend Running</h1>
          <p>The backend API is live and connected. Frontend build not detected in <code>frontend/dist</code>.</p>
          <p>
            <a href="/mbkauthe/login">Sign In</a> &bull;
            <a href="/admin">Admin Dashboard</a>
          </p>
        </div>
      </body>
    </html>
  `);
});

app.get("/simulate-error", (req, res, next) => {
  next(new Error("Simulated router error"));
});

// 404 handler
app.use(createNotFoundHandler({
  appName: "ChatAPI",
  defaultPage: "/",
  defaultPageName: "Home",
}));

// Error handler
app.use(createErrorHandler({
  appName: "ChatAPI",
  defaultPage: "/",
  defaultPageName: "Home",
}));

export default app;
