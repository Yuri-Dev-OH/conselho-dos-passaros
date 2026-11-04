/**
 * Senha do modo edição e sessão assinada de 1 hora.
 *
 * A senha fica só na variável de ambiente SENHA_EDICAO. O token devolvido ao navegador é
 * "<payload base64url>.<HMAC-SHA256>", com a chave derivada da própria senha: trocar a senha
 * invalida todas as sessões abertas.
 */
"use strict";

const crypto = require("crypto");
const { HttpError } = require("./armazenamento");

const DURACAO_S = 60 * 60;

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest();

/** Senha configurada ou null. */
function senha() {
  const s = process.env.SENHA_EDICAO || "";
  return s.length >= 8 ? s : null;
}

const assinar = (payload) => b64url(crypto.createHmac("sha256", "fichas-sessao:" + senha()).update(payload).digest());

/**
 * Confere a senha em tempo constante.
 *
 * @param {*} tentativa Senha digitada.
 * @return {boolean} true se confere.
 * @throws {HttpError} Quando SENHA_EDICAO não está configurada.
 */
function senhaConfere(tentativa) {
  const s = senha();
  if (!s) throw new HttpError(503, "Senha não configurada no servidor (SENHA_EDICAO, mínimo 8 caracteres).");
  return typeof tentativa === "string" && crypto.timingSafeEqual(sha256(tentativa), sha256(s));
}

/**
 * Emite um token válido por 1 hora.
 *
 * @return {{token: string, exp: number}} Token e expiração (ms desde a época).
 */
function emitir() {
  const exp = Date.now() + DURACAO_S * 1000;
  const payload = b64url(JSON.stringify({ exp }));
  return { token: payload + "." + assinar(payload), exp };
}

/**
 * Exige um token válido no cabeçalho Authorization.
 *
 * @param {!Object} req Requisição.
 * @throws {HttpError} 401 quando ausente, inválido ou expirado.
 */
function exigirSessao(req) {
  const m = /^Bearer ([\w-]+)\.([\w-]+)$/.exec(req.headers.authorization || "");
  if (m && senha()) {
    const esperado = Buffer.from(assinar(m[1]));
    const recebido = Buffer.from(m[2]);
    if (esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido)) {
      try {
        if (JSON.parse(Buffer.from(m[1], "base64url").toString()).exp > Date.now()) return;
      } catch (e) { /* payload malformado: cai no 401 */ }
    }
  }
  throw new HttpError(401, "Sessão expirada. Entre de novo com a senha.");
}

module.exports = { senhaConfere, emitir, exigirSessao };
