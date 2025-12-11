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

router.use(express.json());
router.use(mbkAuthRouter);

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
  partialsDir: [
    path.join(__dirname, "node_modules/mbkauthe/views"),
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
    lte: function (a, b) {
      return a <= b;
    },
    gte: function (a, b) {
      return a >= b;
    },
    add: function (a, b) {
      return a + b;
    },
    subtract: function (a, b) {
      return a - b;
    },
    multiply: function (a, b) {
      return a * b;
    },
    divide: function (a, b) {
      if (b === 0) return 0;
      return a / b;
    },
    jsonb_array_length: function (jsonArray) {
      if (!jsonArray) return 0;
      if (typeof jsonArray === 'string') {
        try {
          return JSON.parse(jsonArray).length;
        } catch (e) {
          return 0;
        }
      }
      if (Array.isArray(jsonArray)) {
        return jsonArray.length;
      }
      return 0;
    },
    includes: function (array, value) {
      if (!array) return false;
      if (Array.isArray(array)) {
        return array.includes(value);
      }
      return false;
    },
    len: function (value) {
      if (!value) return 0;
      if (typeof value === 'string') return value.length;
      if (Array.isArray(value)) return value.length;
      if (typeof value === 'object') return Object.keys(value).length;
      return 0;
    },
    isEmpty: function (value) {
      if (!value) return true;
      if (typeof value === 'string') return value.length === 0;
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === 'object') return Object.keys(value).length === 0;
      return false;
    },
    isNotEmpty: function (value) {
      return !this.isEmpty(value);
    },
    first: function (array) {
      if (!array || !Array.isArray(array)) return null;
      return array[0];
    },
    last: function (array) {
      if (!array || !Array.isArray(array)) return null;
      return array[array.length - 1];
    },
    slice: function (array, start, end) {
      if (!array || !Array.isArray(array)) return [];
      return array.slice(start, end);
    },
    join: function (array, separator) {
      if (!array || !Array.isArray(array)) return '';
      return array.join(separator || ',');
    },
    split: function (string, separator) {
      if (!string || typeof string !== 'string') return [];
      return string.split(separator || ',');
    },
    capitalize: function (str) {
      if (!str || typeof str !== 'string') return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    },
    uppercase: function (str) {
      if (!str || typeof str !== 'string') return '';
      return str.toUpperCase();
    },
    lowercase: function (str) {
      if (!str || typeof str !== 'string') return '';
      return str.toLowerCase();
    },
    concat: function (...args) {
      // Remove the options object that is provided by Handlebars
      const options = args.pop();
      return args.join('');
    },
    default: function (value, defaultValue) {
      return value || defaultValue;
    },
    or: function (...args) {
      // Remove the options object that is provided by Handlebars
      const options = args.pop();
      return args.find(arg => !!arg) || false;
    },
    not: function (value) {
      return !value;
    },
    mod: function (a, b) {
      if (b === 0) return 0;
      return a % b;
    },
    abs: function (value) {
      return Math.abs(value);
    },
    round: function (value, precision) {
      if (precision) {
        return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
      }
      return Math.round(value);
    },
    floor: function (value) {
      return Math.floor(value);
    },
    ceil: function (value) {
      return Math.ceil(value);
    },
    min: function (...args) {
      const options = args.pop();
      return Math.min(...args);
    },
    max: function (...args) {
      const options = args.pop();
      return Math.max(...args);
    },
    formatNumber: function (num, decimals) {
      if (typeof num !== 'number') return '0';
      return num.toFixed(decimals || 0);
    },
    formatBytes: function (bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    formatDuration: function (seconds) {
      if (!seconds) return '0s';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (h > 0) return `${h}h ${m}m ${s}s`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    },
    formatPercent: function (value, total) {
      if (!total || total === 0) return '0%';
      return Math.round((value / total) * 100) + '%';
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

Handlebars.registerHelper('multiply', function (a, b) {
  return a * b;
});

Handlebars.registerHelper('subtract', function (a, b) {
  return a - b;
});

Handlebars.registerHelper('add', function (a, b) {
  return a + b;
});

Handlebars.registerHelper('gte', function (a, b) {
  return a >= b;
});

Handlebars.registerHelper('lte', function (a, b) {
  return a <= b;
});

// Additional commonly used helpers
Handlebars.registerHelper('jsonb_array_length', function (jsonArray) {
  if (!jsonArray) return 0;
  if (typeof jsonArray === 'string') {
    try {
      return JSON.parse(jsonArray).length;
    } catch (e) {
      return 0;
    }
  }
  if (Array.isArray(jsonArray)) {
    return jsonArray.length;
  }
  return 0;
});

Handlebars.registerHelper('includes', function (array, value) {
  if (!array) return false;
  if (Array.isArray(array)) {
    return array.includes(value);
  }
  return false;
});

Handlebars.registerHelper('len', function (value) {
  if (!value) return 0;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return 0;
});

Handlebars.registerHelper('isEmpty', function (value) {
  if (!value) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
});

Handlebars.registerHelper('isNotEmpty', function (value) {
  return !Handlebars.helpers.isEmpty(value);
});

Handlebars.registerHelper('or', function (...args) {
  const options = args.pop();
  return args.find(arg => !!arg) || false;
});

Handlebars.registerHelper('not', function (value) {
  return !value;
});

Handlebars.registerHelper('concat', function (...args) {
  const options = args.pop();
  return args.join('');
});

Handlebars.registerHelper('default', function (value, defaultValue) {
  return value || defaultValue;
});

Handlebars.registerHelper('capitalize', function (str) {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
});

Handlebars.registerHelper('uppercase', function (str) {
  if (!str || typeof str !== 'string') return '';
  return str.toUpperCase();
});

Handlebars.registerHelper('lowercase', function (str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase();
});

Handlebars.registerHelper('mod', function (a, b) {
  if (b === 0) return 0;
  return a % b;
});

Handlebars.registerHelper('abs', function (value) {
  return Math.abs(value);
});

Handlebars.registerHelper('round', function (value, precision) {
  if (precision) {
    return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
  }
  return Math.round(value);
});

Handlebars.registerHelper('floor', function (value) {
  return Math.floor(value);
});

Handlebars.registerHelper('ceil', function (value) {
  return Math.ceil(value);
});

Handlebars.registerHelper('formatNumber', function (num, decimals) {
  if (typeof num !== 'number') return '0';
  return num.toFixed(decimals || 0);
});

Handlebars.registerHelper('formatBytes', function (bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

Handlebars.registerHelper('formatDuration', function (seconds) {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
});

Handlebars.registerHelper('formatPercent', function (value, total) {
  if (!total || total === 0) return '0%';
  return Math.round((value / total) * 100) + '%';
});

Handlebars.registerHelper('join', function (array, separator) {
  if (!array || !Array.isArray(array)) return '';
  return array.join(separator || ',');
});

Handlebars.registerHelper('split', function (string, separator) {
  if (!string || typeof string !== 'string') return [];
  return string.split(separator || ',');
});

Handlebars.registerHelper('first', function (array) {
  if (!array || !Array.isArray(array)) return null;
  return array[0];
});

Handlebars.registerHelper('last', function (array) {
  if (!array || !Array.isArray(array)) return null;
  return array[array.length - 1];
});

Handlebars.registerHelper('slice', function (array, start, end) {
  if (!array || !Array.isArray(array)) return [];
  return array.slice(start, end);
});

Handlebars.registerHelper('min', function (...args) {
  const options = args.pop();
  return Math.min(...args);
});

Handlebars.registerHelper('max', function (...args) {
  const options = args.pop();
  return Math.max(...args);
});


router.set("view engine", "handlebars");
router.set("views", [
  path.join(__dirname, "views"),
  path.join(__dirname, "node_modules/mbkauthe/views")
]);

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
  return res.render("staticPage/index.handlebars", { layout: false });
});

router.get(["/home"], (req, res) => {
  return res.redirect("/chatbot");
});

router.use(mbkAuthRouter);

router.use("/", mainRoutes);
router.use("/", dashboardRoutes);

router.get("/admin*", async (req, res) => {
  res.redirect("/admin/dashboard");
});

router.get('/simulate-error', (req, res, next) => {
  next(new Error('Simulated router error'));
});



const port = 3030;

// Start the router
router.listen(port, () => {
  console.log(`router running on http://localhost:${port}`);
});

export default router;