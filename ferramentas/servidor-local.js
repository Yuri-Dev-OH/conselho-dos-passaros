/**
 * Servidor local para testar o hub com a mesma API da Vercel.
 *
 * Lê variáveis do arquivo .env (fora do git). Sem GITHUB_TOKEN, grava as alterações direto
 * nesta pasta (dados.json e midia/), ou na pasta indicada em ARMAZENAMENTO_LOCAL.
 *
 * Uso: node ferramentas/servidor-local.js   (depois abra http://localhost:3000)
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".oga": "audio/ogg", ".opus": "audio/ogg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav", ".webm": "audio/webm",
};

/** Carrega KEY=valor de um arquivo .env sem sobrescrever o ambiente. */
function carregarEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const linha of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

carregarEnv(path.join(RAIZ, ".env"));
if (!process.env.GITHUB_TOKEN && !process.env.ARMAZENAMENTO_LOCAL) process.env.ARMAZENAMENTO_LOCAL = RAIZ;
const PASTA = process.env.GITHUB_TOKEN ? RAIZ : path.resolve(process.env.ARMAZENAMENTO_LOCAL);

const rotas = {
  "/api/fichas": require("../api/fichas"),
  "/api/login": require("../api/login"),
  "/api/midia": require("../api/midia"),
};

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (rotas[url.pathname]) return rotas[url.pathname](req, res);
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  // Mídia nova fica na pasta de armazenamento; o restante do site, na raiz do projeto.
  const file = [PASTA, RAIZ].map((base) => [base, path.join(base, rel)])
    .filter(([base, f]) => f.startsWith(base + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile())
    .map(([, f]) => f)[0];
  if (!file) {
    res.statusCode = 404;
    return res.end("404");
  }
  res.setHeader("Content-Type", TIPOS[path.extname(file).toLowerCase()] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(Number(process.env.PORT) || 3000, () => {
  console.log("Hub em http://localhost:" + (Number(process.env.PORT) || 3000) +
    (process.env.GITHUB_TOKEN ? " (gravando no GitHub " + process.env.GITHUB_REPO + ")" : " (gravando em " + PASTA + ")"));
});
