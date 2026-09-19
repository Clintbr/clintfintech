const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const appRoot = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : path.join(__dirname, "..");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const dataPaths = {
  meta: path.join(dataDir, "meta.json"),
  members: path.join(dataDir, "members.json"),
  loans: path.join(dataDir, "loans.json"),
  logs: path.join(dataDir, "operations.json"),
  history: path.join(dataDir, "history.json")
};
const auth = require("./auth");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};
const sessions = new Map();

function sessionCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `session=${token}; HttpOnly; SameSite=Lax; Path=/${secure}`;
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": contentTypes[".json"], "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(value));
}

function cookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").filter(Boolean).map(value => value.trim().split("=")));
}

function sessionFor(request) {
  return sessions.get(cookies(request).session);
}

async function requestJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || "{}");
}

async function readState() {
  const [meta, members, loans, logs, history] = await Promise.all([
    fs.readFile(dataPaths.meta, "utf8"),
    fs.readFile(dataPaths.members, "utf8"),
    fs.readFile(dataPaths.loans, "utf8"),
    fs.readFile(dataPaths.logs, "utf8"),
    fs.readFile(dataPaths.history, "utf8")
  ]);
  return JSON.stringify({
    ...JSON.parse(meta),
    members: JSON.parse(members),
    loans: JSON.parse(loans),
    logs: JSON.parse(logs),
    history: JSON.parse(history)
  });
}

async function writeJson(filePath, value) {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

async function writeState(body) {
  const { round, members, loans, logs, history = [] } = typeof body === "string" ? JSON.parse(body) : body;
  await Promise.all([
    writeJson(dataPaths.meta, { round }),
    writeJson(dataPaths.members, members),
    writeJson(dataPaths.loans, loans),
    writeJson(dataPaths.logs, logs),
    writeJson(dataPaths.history, history)
  ]);
  await auth.syncMemberAccounts(dataDir, members);
}

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const credentials = await requestJson(request);
      const account = await auth.findAccount(dataDir, credentials.username, credentials.password);
      const members = JSON.parse(await fs.readFile(dataPaths.members, "utf8"));
      const member = members.find(item => item.id === account?.memberId);
      if (!account || (account.role !== "ADMIN" && member?.status !== "ACTIF")) {
        return sendJson(response, 401, { error: "Identifiants invalides ou compte inactif." });
      }
      const token = crypto.randomUUID();
      const session = {
        username: account.username,
        memberId: account.memberId,
        role: account.role,
        name: member?.name || "Administrateur"
      };
      sessions.set(token, session);
      return sendJson(response, 200, { ...session, state: JSON.parse(await readState()) }, { "Set-Cookie": sessionCookie(token) });
    }
    if (url.pathname === "/api/auth/session" && request.method === "GET") {
      const session = sessionFor(request);
      return session
        ? sendJson(response, 200, { ...session, state: JSON.parse(await readState()) })
        : sendJson(response, 401, { error: "Non authentifié." });
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      sessions.delete(cookies(request).session);
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      return sendJson(response, 204, {}, { "Set-Cookie": `session=; HttpOnly; Max-Age=0; Path=/${secure}` });
    }
    if (url.pathname === "/api/auth/password" && request.method === "PUT") {
      const session = sessionFor(request);
      const { password } = await requestJson(request);
      if (!session || !password || password.length < 4) {
        return sendJson(response, 400, { error: "Mot de passe invalide (4 caractères minimum)." });
      }
      await auth.updatePassword(dataDir, session.username, password);
      return sendJson(response, 204, {});
    }
    if (url.pathname === "/api/state") {
      const session = sessionFor(request);
      if (!session) return sendJson(response, 401, { error: "Non authentifié." });
      if (request.method === "GET") {
        const state = await readState();
        response.writeHead(200, { "Content-Type": contentTypes[".json"], "Cache-Control": "no-store" });
        return response.end(state);
      }
      if (request.method === "PUT") {
        if (session.role !== "ADMIN") return sendJson(response, 403, { error: "Accès administrateur requis." });
        await writeState(await requestJson(request));
        response.writeHead(204);
        return response.end();
      }
      response.writeHead(405, { Allow: "GET, PUT" });
      return response.end();
    }

    const requestedFile = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const filePath = path.resolve(appRoot, requestedFile);
    if (!filePath.startsWith(`${appRoot}${path.sep}`)) throw new Error("Invalid path");
    const extension = path.extname(filePath);
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(file);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Erreur du serveur de données.");
    } else {
      response.end();
    }
  }
});

async function start() {
  await ensureDataDir();
  await auth.loadAccounts(dataDir);
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => console.log(`ClintFinTech disponible sur le port ${port}`));
}

start().catch(error => {
  console.error("Impossible de démarrer le serveur :", error.message);
  process.exit(1);
});
