const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const dataPaths = {
  meta: path.join(root, "data", "meta.json"),
  members: path.join(root, "data", "members.json"),
  loans: path.join(root, "data", "loans.json"),
  logs: path.join(root, "data", "operations.json"),
  history: path.join(root, "data", "history.json"),
  auth: path.join(root, "data", "auth.json")
};
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const sessions = new Map();

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
  return JSON.stringify({ ...JSON.parse(meta), members: JSON.parse(members), loans: JSON.parse(loans), logs: JSON.parse(logs), history: JSON.parse(history) });
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
  const accounts = JSON.parse(await fs.readFile(dataPaths.auth, "utf8"));
  let changed = false;
  members.filter(member => member.role !== "ADMIN").forEach(member => {
    if (!accounts.some(account => account.memberId === member.id)) {
      accounts.push({ username: `membre${member.id}`, password: `membre${member.id}`, memberId: member.id, role: "MEMBER" });
      changed = true;
    }
  });
  if (changed) await writeJson(dataPaths.auth, accounts);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const credentials = await requestJson(request);
      const accounts = JSON.parse(await fs.readFile(dataPaths.auth, "utf8"));
      const account = accounts.find(item => item.username === credentials.username && item.password === credentials.password);
      const members = JSON.parse(await fs.readFile(dataPaths.members, "utf8"));
      const member = members.find(item => item.id === account?.memberId);
      if (!account || (account.role !== "ADMIN" && member?.status !== "ACTIF")) return sendJson(response, 401, { error: "Identifiants invalides ou compte inactif." });
      const token = crypto.randomUUID();
      const session = { username: account.username, memberId: account.memberId, role: account.role, name: member?.name || "Administrateur" };
      sessions.set(token, session);
      return sendJson(response, 200, { ...session, state: JSON.parse(await readState()) }, { "Set-Cookie": `session=${token}; HttpOnly; SameSite=Lax; Path=/` });
    }
    if (url.pathname === "/api/auth/session" && request.method === "GET") {
      const session = sessionFor(request);
      return session
        ? sendJson(response, 200, { ...session, state: JSON.parse(await readState()) })
        : sendJson(response, 401, { error: "Non authentifié." });
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      sessions.delete(cookies(request).session);
      return sendJson(response, 204, {}, { "Set-Cookie": "session=; HttpOnly; Max-Age=0; Path=/" });
    }
    if (url.pathname === "/api/auth/password" && request.method === "PUT") {
      const session = sessionFor(request);
      const { password } = await requestJson(request);
      if (!session || !password || password.length < 4) return sendJson(response, 400, { error: "Mot de passe invalide (4 caractères minimum)." });
      const accounts = JSON.parse(await fs.readFile(dataPaths.auth, "utf8"));
      const account = accounts.find(item => item.username === session.username);
      account.password = password;
      await writeJson(dataPaths.auth, accounts);
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
    const filePath = path.resolve(root, requestedFile);
    if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid path");
    const extension = path.extname(filePath);
    const file = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(file);
  } catch (error) {
    if (!response.headersSent) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Erreur du serveur de données.");
    } else {
      response.end();
    }
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Prototype disponible sur http://localhost:${port}`));
