/**
 * /api/login
 *
 * POST {senha} devolve {token, exp}: a sessão de edição vale 1 hora.
 */
"use strict";

const { send, readJson, handler, HttpError } = require("../lib/http");
const { senhaConfere, emitir } = require("../lib/sessao");

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = handler(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido.");
  const { senha } = await readJson(req);
  if (!senhaConfere(senha)) {
    await espera(600);  // atrasa tentativas em sequência
    throw new HttpError(401, "Senha incorreta.");
  }
  send(res, 200, emitir());
});
