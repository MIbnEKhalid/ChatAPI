import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mainRoutes from "./routes/main.js";
import dashboardRoutes from "./routes/dashboard.js";
import { engine } from "express-handlebars";
import Handlebars from "handlebars";
import minifyHTML from "express-minify-html";
import minify from "express-minify";
import compression from "compression";
import mbkAuthRouter from "mbkauthe";

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = app;

router.use(express.json());  // <--- Move express.json() to be first
router.use(mbkAuthRouter);   // <--- Keep mbkAuthRouter after express.json()

router.use(compression());
router.use(minify());
router.use(
  minifyHTML({
    override: true,
    htmlMinifier: {
      removeComments: true,
      collapseWhitespace: true,
      removeAttributeQuotes: true,
      minifyCSS: true,
      minifyJS: true,
    },
  })
);
// Configure Handlebars
router.engine("handlebars", engine({
  defaultLayout: false,
  partialsDir: [
    path.join(__dirname, "views/templates"),
    path.join(__dirname, "views/notice"),
    path.join(__dirname, "views")
  ],
  cache: false,
  helpers: { // <-- ADD THIS helpers OBJECT
    eq: function (a, b) { // <-- Move your helpers inside here
      return a === b;
    },
    encodeURIComponent: function (str) {
      return encodeURIComponent(str);
    },
    formatTimestamp: function (timestamp) {
      return new Date(timestamp).toLocaleString();
    },
    jsonStringify: function (context) {
      return JSON.stringify(context);
    },
    percentage: function (used, total) {
      if (total === 0) return 0;
      return Math.round((used / total) * 100);
    }, formatDate: function (dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleString();
    },
    gt: function (a, b) {
      return a > b;
    },
    lt: function (a, b) {
      return a < b;
    },
    add: function (a, b) {
      return a + b;
    },
    subtract: function (a, b) {
      return a - b;
    },
    range: function (start, end) {
      const result = [];
      for (let i = start; i <= end; i++) {
        result.push(i);
      }
      return result;
    },
    formatTime: function (index) {
      // Simple implementation - in a real app you might want actual timestamps
      return `Message ${index + 1}`;
    },
    and: function (...args) {
      // Remove the options object that is provided by Handlebars
      const options = args.pop();
      return args.every(Boolean);
    }, 
    neq: function (a, b, options) {
      if (options && typeof options.fn === 'function') {
        return a !== b ? options.fn(this) : options.inverse(this);
      }
      // Fallback for inline usage
      return a !== b;
    },
    truncate: function (str, len) {
      if (typeof str !== "string") return "";
      // Default length = 50 if not provided
      const limit = len || 50;
      return str.length > limit ? str.substring(0, limit) + "..." : str;
    },
    formatUptime: function () { // <-- New helper
      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);
      return `${h}h ${m}m ${s}s`;
    }
  }
}));

Handlebars.registerHelper('divide', function (value, divisor, multiplier) {
  if (divisor == 0) {
    return 0;
  }
  return (value / divisor) * multiplier;
});

router.set("view engine", "handlebars");
router.set("views", path.join(__dirname, "views"));

// Serve static files
router.use(
  "/Assets",
  express.static(path.join(__dirname, "public/Assets"), {
    setHeaders: (res, path) => {
      if (path.endsWith(".css")) {
        res.setHeader("Content-Type", "text/css");
      }
    },
  })
);

router.use('/Assets/Images', express.static(path.join(__dirname, 'Assets'), {
  maxAge: '1d' // Cache assets for 1 day
}));


router.get(["/", "/info/main"], (req, res) => {
  return res.render("staticPage/index.handlebars");
});

router.get(["/home", "/dashboard"], (req, res) => {
  return res.redirect("/chatbot");
});

router.get("/info/Terms&Conditions", (req, res) => {
  return res.render("staticPage/Terms&Conditions");
});

router.get("/info/FAQs", async (req, res) => {
  res.render("staticPage/FAQs");
});

router.get("/info/Credits", async (req, res) => {
  res.render("staticPage/Credits");
});

router.use(mbkAuthRouter);

router.use("/", mainRoutes);
router.use("/", dashboardRoutes);

router.get("/admin/*", async (req, res) => {
  res.redirect("/admin/dashboard");
});

router.get('/simulate-error', (req, res, next) => {
  next(new Error('Simulated router error'));
});
/*
router.get("/custom/C", (req, res) => {
  return nextApp.render(req, res, "/Custom", req.query);
});
//It Render React Page, /pages
router.get("*", (req, res) => {
  return handleNext(req, res);
});
*/

router.use((req, res) => {
  console.log(`Path not found: ${req.url}`);
  return res.render("staticPage/404");
});

router.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500);
  res.render('templates/Error/500', { error: err });
});

const port = 3030;

// Start the router
router.listen(port, () => {
  console.log(`router running on http://localhost:${port}`);
});
export default router;
/*
});
*/