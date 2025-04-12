import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mainRoutes from "./routes/main.js";
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

router.use(express.json());
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
        }
    }
}));
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

const port = 3130;

// Start the router
router.listen(port, () => {
  console.log(`router running on http://localhost:${port}`);
});
export default router;
/*
});
*/