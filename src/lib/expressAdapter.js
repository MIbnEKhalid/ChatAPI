import { EventEmitter } from "events";
import { Readable } from "stream";
import mbkAuthRouter from "mbkauthe";
import { setupViewEngine } from "mbkutils";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize a standalone Express app for mbkauthe
const expressApp = express();
expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));

setupViewEngine(expressApp, {
  rootDir: path.resolve(__dirname, "../../"),
  defaultLayout: false,
  cache: false,
});

expressApp.use(mbkAuthRouter);

/**
 * Bridges a Next.js / Web Request to the mbkauthe Express application.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleExpressRequest(request) {
  const url = new URL(request.url);
  const method = request.method;

  // Read request body if present
  let bodyBuffer = Buffer.alloc(0);
  if (method !== "GET" && method !== "HEAD") {
    try {
      const arrayBuffer = await request.arrayBuffer();
      bodyBuffer = Buffer.from(arrayBuffer);
    } catch (e) {}
  }

  return new Promise(async (resolve, reject) => {
    // Construct IncomingMessage-like object
    const req = new Readable({
      read() {
        this.push(bodyBuffer);
        this.push(null);
      },
    });

    req.url = url.pathname + url.search;
    req.originalUrl = req.url;
    req.method = method;
    req.headers = Object.fromEntries(request.headers.entries());
    req.headers["content-length"] = String(bodyBuffer.length);
    req.query = Object.fromEntries(url.searchParams.entries());
    req.ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    req.connection = { remoteAddress: req.ip };
    req.socket = req.connection;

    // ServerResponse collector
    const responseHeaders = new Headers();
    const chunks = [];
    let statusCode = 200;

    const res = new EventEmitter();
    res.statusCode = 200;
    res.headersSent = false;

    res.setHeader = (key, value) => {
      if (Array.isArray(value)) {
        value.forEach((v) => responseHeaders.append(key, v));
      } else {
        responseHeaders.set(key, value);
      }
    };

    res.getHeader = (key) => responseHeaders.get(key);
    res.getHeaders = () => Object.fromEntries(responseHeaders.entries());

    res.writeHead = (code, headers) => {
      statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          res.setHeader(k, v);
        }
      }
      return res;
    };

    res.write = (chunk) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    };

    res.end = (chunk) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      res.headersSent = true;
      const finalBuffer = Buffer.concat(chunks);
      resolve(
        new Response(finalBuffer, {
          status: res.statusCode || statusCode,
          headers: responseHeaders,
        })
      );
    };

    res.redirect = (statusOrUrl, urlArg) => {
      const redirectUrl = typeof statusOrUrl === "string" ? statusOrUrl : urlArg;
      const redirectStatus = typeof statusOrUrl === "number" ? statusOrUrl : 302;
      responseHeaders.set("Location", redirectUrl);
      resolve(
        new Response(null, {
          status: redirectStatus,
          headers: responseHeaders,
        })
      );
    };

    try {
      expressApp(req, res, (err) => {
        if (err) {
          console.error("[expressAdapter] Error:", err);
          return resolve(
            Response.json({ error: "Internal Server Error", message: err.message }, { status: 500 })
          );
        }
        resolve(new Response("Not Found", { status: 404 }));
      });
    } catch (e) {
      reject(e);
    }
  });
}
