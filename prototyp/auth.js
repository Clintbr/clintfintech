const fs = require("fs/promises");
const path = require("path");

let accountsCache = null;

function parseEnvAccounts() {
  const raw = process.env.AUTH_ACCOUNTS?.trim();
  if (!raw) {
    throw new Error("AUTH_ACCOUNTS est requis (JSON des comptes) dans les variables d'environnement ou le fichier .env.");
  }
  const accounts = JSON.parse(raw);
  if (!Array.isArray(accounts) || !accounts.length) {
    throw new Error("AUTH_ACCOUNTS doit être un tableau JSON non vide.");
  }
  return accounts;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

function storePath(dataDir) {
  return path.join(dataDir, "auth.store.json");
}

async function loadAccounts(dataDir) {
  if (accountsCache) return accountsCache;
  const filePath = storePath(dataDir);
  try {
    accountsCache = await readJson(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    accountsCache = parseEnvAccounts();
    await saveAccounts(dataDir, accountsCache);
  }
  return accountsCache;
}

async function saveAccounts(dataDir, accounts) {
  accountsCache = accounts;
  await writeJson(storePath(dataDir), accounts);
}

async function findAccount(dataDir, username, password) {
  const accounts = await loadAccounts(dataDir);
  return accounts.find(item => item.username === username && item.password === password);
}

async function updatePassword(dataDir, username, password) {
  const accounts = await loadAccounts(dataDir);
  const account = accounts.find(item => item.username === username);
  if (!account) throw new Error("Compte introuvable.");
  account.password = password;
  await saveAccounts(dataDir, accounts);
}

async function syncMemberAccounts(dataDir, members) {
  const accounts = await loadAccounts(dataDir);
  let changed = false;
  members.filter(member => member.role !== "ADMIN").forEach(member => {
    if (!accounts.some(account => account.memberId === member.id)) {
      accounts.push({
        username: `membre${member.id}`,
        password: `membre${member.id}`,
        memberId: member.id,
        role: "MEMBER"
      });
      changed = true;
    }
  });
  if (changed) await saveAccounts(dataDir, accounts);
  return accounts;
}

module.exports = {
  loadAccounts,
  saveAccounts,
  findAccount,
  updatePassword,
  syncMemberAccounts
};
