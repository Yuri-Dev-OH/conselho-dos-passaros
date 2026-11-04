/**
 * Utilitários HTTP compartilhados pelas funções em /api (formato Node da Vercel).
 */
"use strict";

const { HttpError } = require("./armazenamento");

const LIMITE_CORPO = 4.5 * 1024 * 1024;

/**
 * Envia uma resposta JSON.
 *
 * @param {!Object} res Resposta.
 * @param {number} status Código HTTP.
 * @param {*} body Objeto serializável.
 */
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!res.getHeader("Cache-Control")) res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/**
 * Lê o corpo JSON (já interpretado pela Vercel ou cru, no servidor local).
 *
 * @param {!Object} req Requisição.
 * @return {!Promise<!Object>} Corpo.
 */
async function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === "string" || Buffer.isBuffer(req.body) ? String(req.body) : "";
  if (!raw) {
    const chunks = [];
    let size = 0;
    for await (const ch of req) {
      size += ch.length;
      if (size > LIMITE_CORPO) throw new HttpError(413, "Arquivo grande demais.");
      chunks.push(ch);
    }
    raw = Buffer.concat(chunks).toString("utf8");
  }
  try {
    const body = JSON.parse(raw || "{}");
    if (body && typeof body === "object") return body;
  } catch (e) { /* cai no erro abaixo */ }
  throw new HttpError(400, "Corpo da requisição inválido.");
}

/**
 * Envolve um handler tratando erros de forma uniforme.
 *
 * @param {function(!Object, !Object): !Promise} fn Handler.
 * @return {function(!Object, !Object): !Promise} Handler protegido.
 */
function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { erro: e.message });
      console.error(e);
      send(res, 502, { erro: "Não foi possível falar com o armazenamento. Tente de novo em instantes." });
    }
  };
}

/** Lê um parâmetro da query string (funciona na Vercel e no servidor local). */
const query = (req, k) => (req.query && req.query[k]) || new URL(req.url, "http://x").searchParams.get(k) || "";

module.exports = { send, readJson, handler, query, HttpError };
