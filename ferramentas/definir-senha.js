/**
 * Define a senha do modo edição do hub.
 *
 * Grava no index.html apenas o salt e o hash PBKDF2-SHA256 da senha; a senha em si
 * nunca é salva. Depois de rodar, faça commit e push do index.html.
 *
 * Uso (no terminal, dentro da pasta do projeto):
 *   node ferramentas/definir-senha.js
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ITERATIONS = 210000;
const INDEX = path.join(__dirname, "..", "index.html");
const MARKER = /\/\*SENHA\*\/[\s\S]*?\/\*FIM-SENHA\*\//;

/**
 * Pergunta algo no terminal sem mostrar o que é digitado.
 *
 * @param {string} question Texto da pergunta.
 * @return {!Promise<string>} Resposta digitada.
 */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (text) => rl.output.write(muted ? "" : text);
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

/**
 * Lê a senha da entrada padrão quando ela não é um terminal (ex.: redirecionamento).
 *
 * @return {!Promise<string>} Primeira linha recebida.
 */
function readPiped() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data.split(/\r?\n/)[0]));
  });
}

async function main() {
  if (!fs.existsSync(INDEX)) throw new Error("index.html não encontrado em " + INDEX);
  const html = fs.readFileSync(INDEX, "utf8");
  if (!MARKER.test(html)) throw new Error("Marcador /*SENHA*/ não encontrado no index.html");

  let password;
  if (process.stdin.isTTY) {
    password = await askHidden("Nova senha do modo edição: ");
    const again = await askHidden("Repita a senha: ");
    if (password !== again) throw new Error("As senhas não conferem.");
  } else {
    password = await readPiped();
  }
  if (!password || password.length < 8) throw new Error("Use ao menos 8 caracteres.");

  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256").toString("hex");
  const config = `/*SENHA*/ { salt: "${salt.toString("hex")}", hash: "${hash}", iter: ${ITERATIONS} } /*FIM-SENHA*/`;
  fs.writeFileSync(INDEX, html.replace(MARKER, config));
  console.log("Senha definida. Agora publique o index.html (git add, commit e push).");
}

main().catch((err) => {
  console.error("Erro: " + err.message);
  process.exit(1);
});
