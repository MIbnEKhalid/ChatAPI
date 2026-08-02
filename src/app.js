import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { engine } from "express-handlebars";
import Handlebars from "handlebars";
import helmet from "helmet";
import mbkAuthRouter, { renderError } from "mbkauthe";
import chatRoutes from "./routes/chat.js";
import adminRoutes from "./routes/admin.js";
import { helpers, registerHandlebarsHelpers } from "./utils/handlebarsHelpers.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Register all Handlebars helpers globally so every template/partial can use them.
registerHandlebarsHelpers(Handlebars);

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

// Configure Handlebars
app.engine(
  "handlebars",
  engine({
    partialsDir: [
      path.resolve(__dirname, "../node_modules/mbkauthe/views"),
      path.join(__dirname, "views/notice"),
      path.join(__dirname, "views"),
    ],
    cache: false,
    helpers,
  })
);

app.set("view engine", "handlebars");
app.set("views", [
  path.join(__dirname, "views"),
  path.resolve(__dirname, "../node_modules/mbkauthe/views"),
]);

// Serve static files
app.use(
  "/Assets",
  express.static(path.join(__dirname, "../public/Assets"), {
    setHeaders: (res, path) => {
      if (path.endsWith(".css")) {
        res.setHeader("Content-Type", "text/css");
      }
    },
  })
);

// Landing pages
app.get(["/", "/info/main"], (req, res) => {
  return res.render("staticPage/index.handlebars", { layout: false });
});

app.get(["/home"], (req, res) => {
  return res.redirect("/chatbot");
});

app.use(mbkAuthRouter);

app.use("/", chatRoutes);
app.use("/", adminRoutes);

app.get("/admin*", async (req, res) => {
  res.redirect("/admin/dashboard");
});

app.get("/dashboard", async (req, res) => {
  res.redirect("/admin/dashboard");
});

app.get("/simulate-error", (req, res, next) => {
  next(new Error("Simulated router error"));
});

// 404 handler
app.use((req, res) => {
  console.log(`Path not found: ${req.method} ${req.url}`);
  return renderError(res, req, {
    layout: false,
    code: 404,
    error: "Not Found",
    message: "The requested page was not found.",
    pagename: "Home",
    page: "/",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  return renderError(res, req, {
    layout: false,
    code: 500,
    error: "Internal app Error",
    message: "An unexpected error occurred on the app.",
    details: err.message,
    pagename: "Home",
    page: "/",
  });
});

export default app;
