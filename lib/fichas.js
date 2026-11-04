/**
 * Regras de validação das fichas no servidor.
 */
"use strict";

const { HttpError } = require("./armazenamento");

const MIDIA = ["photo", "logo", "audio"];
const CAMINHO = /^(https:\/\/[^\s"'<>]+|[\w-][\w\-./]*)$/;
const LIMITE_FICHA = 200 * 1024;

const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Valida uma ficha recebida do navegador.
 *
 * @param {*} raw Ficha.
 * @return {!Object} Ficha com id normalizado.
 * @throws {HttpError} 400 quando inválida.
 */
function limparFicha(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "Ficha inválida.");
  if (typeof raw.name !== "string" || !raw.name.trim()) throw new HttpError(400, "A ficha precisa de um nome.");
  for (const k of MIDIA) {
    const v = raw[k] == null ? "" : raw[k];
    if (typeof v !== "string" || (v && (!CAMINHO.test(v) || v.includes("..")))) {
      throw new HttpError(400, "Caminho inválido em " + k + ": use um arquivo do site (ex.: midia/x/foto.webp) ou um link https.");
    }
    raw[k] = v;
  }
  raw.name = raw.name.trim();
  raw.id = slug(raw.id || raw.name) || "personagem";
  if (JSON.stringify(raw).length > LIMITE_FICHA) throw new HttpError(413, "Ficha grande demais. Envie imagens como arquivo, não embutidas.");
  return raw;
}

/** Id livre na lista a partir de uma base. */
function idUnico(lista, base) {
  let id = base, n = 2;
  while (lista.some((c) => c.id === id)) id = base + "-" + n++;
  return id;
}

/**
 * Arquivos em midia/ que deixaram de ser usados por qualquer ficha.
 *
 * @param {!Array<!Object>} antes Fichas antes da alteração.
 * @param {!Array<!Object>} depois Fichas depois da alteração.
 * @return {!Array<string>} Caminhos a remover.
 */
function midiaOrfa(antes, depois) {
  const usados = (lista) => new Set(lista.flatMap((c) => MIDIA.map((k) => c[k])).filter((p) => typeof p === "string" && p.startsWith("midia/")));
  const agora = usados(depois);
  return [...usados(antes)].filter((p) => !agora.has(p));
}

module.exports = { limparFicha, idUnico, midiaOrfa, slug };
