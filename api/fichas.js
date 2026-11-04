/**
 * /api/fichas
 *
 * GET    lista ícones e fichas (público).
 * PUT    {char, novo} cria ou atualiza uma ficha (exige sessão).
 * DELETE ?id=...      exclui uma ficha (exige sessão).
 * POST   {characters} importa várias fichas de uma vez (exige sessão).
 */
"use strict";

const { getStore } = require("../lib/armazenamento");
const { send, readJson, handler, query, HttpError } = require("../lib/http");
const { exigirSessao } = require("../lib/sessao");
const { limparFicha, idUnico, midiaOrfa } = require("../lib/fichas");

const resposta = (store, data, extra) => ({ icons: data.icons || {}, characters: data.characters || [], rawBase: store.rawBase, ...extra });

module.exports = handler(async (req, res) => {
  const store = getStore();
  if (req.method === "GET") {
    const data = await store.read();
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=5, stale-while-revalidate=30");
    return send(res, 200, resposta(store, data));
  }

  exigirSessao(req);

  if (req.method === "PUT") {
    const body = await readJson(req);
    const ficha = limparFicha(body.char);
    const out = await store.update((data) => {
      const lista = data.characters || (data.characters = []);
      const antes = lista.slice();
      if (body.novo) ficha.id = idUnico(lista, ficha.id);
      const i = lista.findIndex((c) => c.id === ficha.id);
      if (i < 0 && !body.novo) throw new HttpError(404, "Esta ficha não existe mais. Recarregue a página.");
      if (i >= 0) lista[i] = ficha;
      else lista.push(ficha);
      return { result: ficha.id, remove: midiaOrfa(antes, lista) };
    }, () => (body.novo ? "Cria ficha: " : "Atualiza ficha: ") + ficha.name);
    return send(res, 200, resposta(store, out.data, { id: out.result }));
  }

  if (req.method === "DELETE") {
    const id = query(req, "id");
    let nome = id;
    const out = await store.update((data) => {
      const lista = data.characters || [];
      const i = lista.findIndex((c) => c.id === id);
      if (i < 0) throw new HttpError(404, "Esta ficha já foi excluída.");
      const antes = lista.slice();
      nome = lista[i].name;
      lista.splice(i, 1);
      return { remove: midiaOrfa(antes, lista) };
    }, () => "Exclui ficha: " + nome);
    return send(res, 200, resposta(store, out.data));
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const fichas = (Array.isArray(body.characters) ? body.characters : []).map(limparFicha);
    if (!fichas.length) throw new HttpError(400, "Nenhuma ficha válida para importar.");
    const out = await store.update((data) => {
      const lista = data.characters || (data.characters = []);
      const antes = lista.slice();
      for (const f of fichas) {
        const i = lista.findIndex((c) => c.id === f.id);
        if (i >= 0) lista[i] = f;
        else lista.push(f);
      }
      return { remove: midiaOrfa(antes, lista) };
    }, () => "Importa " + fichas.length + (fichas.length === 1 ? " ficha" : " fichas"));
    return send(res, 200, resposta(store, out.data));
  }

  res.setHeader("Allow", "GET, PUT, DELETE, POST");
  throw new HttpError(405, "Método não permitido.");
});
