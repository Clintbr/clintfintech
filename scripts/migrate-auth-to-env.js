#!/usr/bin/env node
/**
 * Génère ou met à jour .env à partir de prototyp/data/auth.json (usage local uniquement).
 * Usage : node scripts/migrate-auth-to-env.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const authPath = path.join(root, "prototyp", "data", "auth.json");
const envPath = path.join(root, ".env");

if (!fs.existsSync(authPath)) {
  console.error("Fichier introuvable : prototyp/data/auth.json");
  process.exit(1);
}

const accounts = JSON.parse(fs.readFileSync(authPath, "utf8").replace(/^\uFEFF/, ""));
const line = `AUTH_ACCOUNTS=${JSON.stringify(accounts)}`;

let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
if (/^AUTH_ACCOUNTS=/m.test(envContent)) {
  envContent = envContent.replace(/^AUTH_ACCOUNTS=.*$/m, line);
} else {
  envContent = `${envContent.trim()}\n${line}\n`.trim() + "\n";
}

fs.writeFileSync(envPath, envContent, "utf8");
console.log(`Mis à jour : ${envPath}`);
console.log("Vérifiez que .env reste ignoré par git avant de committer.");
