import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleGenerate } from "../functions/src/generate";
import { handleRecovery } from "../functions/src/recovery";
import { createGeminiClient } from "../functions/src/lib/gemini";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function toWeb(req: IncomingMessage, path: string): Promise<Request> {
  const body = await readBody(req);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  return new Request("http://localhost" + path, {
    method: req.method,
    headers,
    body: body || undefined,
  });
}

async function send(res: ServerResponse, webRes: Response): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(await webRes.text());
}

// Dev-only: mounts the stateless functions as middleware so `npm run dev` serves
// /api/generate and /api/recovery/*. Production deploys the same handlers to a
// real serverless host with a real EmailProvider and a secret from the environment.
export function functionsDev(): Plugin {
  return {
    name: "faceback-functions-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (req.method !== "POST" || !url.startsWith("/api/")) return next();
        void (async () => {
          try {
            if (url.startsWith("/api/generate")) {
              const wr = await handleGenerate(await toWeb(req, url), {
                makeClient: (key) => createGeminiClient(key),
              });
              return send(res, wr);
            }
            if (url.startsWith("/api/recovery/")) {
              const wr = await handleRecovery(await toWeb(req, url), {
                secret: process.env.FACEBACK_RECOVERY_SECRET ?? "dev-secret-change-me",
                email: {
                  async send(to, subject, body) {
                    console.log(`\n[FaceBack dev email] to=${to} | ${subject}\n${body}\n`);
                  },
                },
                nowMs: Date.now(),
              });
              return send(res, wr);
            }
            return next();
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: { code: "dev_error", message: String(e) } }));
          }
        })();
      });
    },
  };
}
