/**
 * /api/midia
 *
 * POST {id, kind, ext, data} grava um arquivo (base64) em midia/<id>/ e devolve {path}.
 * kind: "photo" | "logo" | "audio". Exige sessão.
 */
"use strict";

const { getStore } = require("../lib/armazenamento");
const { send, readJson, handler, HttpError } = require("../lib/http");
const { exigirSessao } = require("../lib/sessao");
const { slug } = require("../lib/fichas");

const TIPOS = {
  photo: { nome: "foto", ext: ["webp", "jpg", "jpeg", "png", "gif", "avif"] },
  logo: { nome: "logo", ext: ["webp", "jpg", "jpeg", "png", "gif", "avif", "svg"] },
  audio: { nome: "fala", ext: ["mp3", "ogg", "oga", "opus", "m4a", "aac", "wav", "webm"] },
};
const LIMITE = 3 * 1024 * 1024;

module.exports = handler(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido.");
  exigirSessao(req);
  const body = await readJson(req);
  const tipo = TIPOS[body.kind];
  const ext = String(body.ext || "").toLowerCase();
  if (!tipo || !tipo.ext.includes(ext)) throw new HttpError(400, "Formato de arquivo não aceito.");
  if (typeof body.data !== "string" || !body.data) throw new HttpError(400, "Arquivo vazio.");
  const buf = Buffer.from(body.data, "base64");
  if (buf.length > LIMITE) throw new HttpError(413, "Arquivo acima de 3 MB. Reduza o tamanho e tente de novo.");
  const file = "midia/" + (slug(body.id) || "geral") + "/" + tipo.nome + "-" + Date.now().toString(36) + "." + ext;
  await getStore().put(file, buf, "Envia mídia: " + file);
  send(res, 200, { path: file });
});
