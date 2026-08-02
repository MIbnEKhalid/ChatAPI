// Handlebars helpers shared across all templates.

function isEmpty(value) {
  if (!value) return true;
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function isNotEmpty(value) {
  return !isEmpty(value);
}

export const helpers = {
  eq: (a, b) => a === b,
  neq: function (a, b, options) {
    if (options && typeof options.fn === "function") {
      return a !== b ? options.fn(this) : options.inverse(this);
    }
    // Fallback for inline usage
    return a !== b;
  },
  gt: (a, b) => a > b,
  lt: (a, b) => a < b,
  gte: (a, b) => a >= b,
  lte: (a, b) => a <= b,
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => {
    if (b === 0) return 0;
    return a / b;
  },
  mod: (a, b) => {
    if (b === 0) return 0;
    return a % b;
  },
  abs: (value) => Math.abs(value),
  round: (value, precision) => {
    if (precision) {
      return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
    }
    return Math.round(value);
  },
  floor: (value) => Math.floor(value),
  ceil: (value) => Math.ceil(value),
  min: (...args) => {
    const options = args.pop();
    return Math.min(...args);
  },
  max: (...args) => {
    const options = args.pop();
    return Math.max(...args);
  },
  and: (...args) => {
    // Remove the options object that is provided by Handlebars
    const options = args.pop();
    return args.every(Boolean);
  },
  or: (...args) => {
    // Remove the options object that is provided by Handlebars
    const options = args.pop();
    return args.find((arg) => !!arg) || false;
  },
  not: (value) => !value,
  concat: (...args) => {
    // Remove the options object that is provided by Handlebars
    const options = args.pop();
    return args.join("");
  },
  default: (value, defaultValue) => value || defaultValue,
  capitalize: (str) => {
    if (!str || typeof str !== "string") return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  },
  uppercase: (str) => {
    if (!str || typeof str !== "string") return "";
    return str.toUpperCase();
  },
  lowercase: (str) => {
    if (!str || typeof str !== "string") return "";
    return str.toLowerCase();
  },
  truncate: (str, len) => {
    if (typeof str !== "string") return "";
    // Default length = 50 if not provided
    const limit = len || 50;
    return str.length > limit ? str.substring(0, limit) + "..." : str;
  },
  encodeURIComponent: (str) => encodeURIComponent(str),
  formatTimestamp: (timestamp) => new Date(timestamp).toLocaleString(),
  formatDate: (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString();
  },
  jsonStringify: (context) => JSON.stringify(context),
  percentage: (used, total) => {
    if (total === 0) return 0;
    return Math.round((used / total) * 100);
  },
  formatNumber: (num, decimals) => {
    if (typeof num !== "number") return "0";
    return num.toFixed(decimals || 0);
  },
  formatBytes: (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  },
  formatDuration: (seconds) => {
    if (!seconds) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  },
  formatPercent: (value, total) => {
    if (!total || total === 0) return "0%";
    return Math.round((value / total) * 100) + "%";
  },
  formatUptime: () => {
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);
    return `${h}h ${m}m ${s}s`;
  },
  formatTime: (index) => {
    // Simple implementation - in a real app you might want actual timestamps
    return `Message ${index + 1}`;
  },
  jsonb_array_length: (jsonArray) => {
    if (!jsonArray) return 0;
    if (typeof jsonArray === "string") {
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
  includes: (array, value) => {
    if (!array) return false;
    if (Array.isArray(array)) {
      return array.includes(value);
    }
    return false;
  },
  len: (value) => {
    if (!value) return 0;
    if (typeof value === "string") return value.length;
    if (Array.isArray(value)) return value.length;
    if (typeof value === "object") return Object.keys(value).length;
    return 0;
  },
  isEmpty,
  isNotEmpty,
  first: (array) => {
    if (!array || !Array.isArray(array)) return null;
    return array[0];
  },
  last: (array) => {
    if (!array || !Array.isArray(array)) return null;
    return array[array.length - 1];
  },
  slice: (array, start, end) => {
    if (!array || !Array.isArray(array)) return [];
    return array.slice(start, end);
  },
  join: (array, separator) => {
    if (!array || !Array.isArray(array)) return "";
    return array.join(separator || ",");
  },
  split: (string, separator) => {
    if (!string || typeof string !== "string") return [];
    return string.split(separator || ",");
  },
  range: (start, end) => {
    const result = [];
    for (let i = start; i <= end; i++) {
      result.push(i);
    }
    return result;
  },
};

// Registers every helper on a Handlebars instance so they are available
// globally across all templates, partials and layouts.
export function registerHandlebarsHelpers(Handlebars) {
  for (const [name, fn] of Object.entries(helpers)) {
    Handlebars.registerHelper(name, fn);
  }
}
