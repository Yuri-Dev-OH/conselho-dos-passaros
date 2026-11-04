/**
 * Armazenamento das fichas.
 *
 * Em produção grava direto no repositório GitHub (cada alteração vira um commit), usando
 * as variáveis de ambiente GITHUB_TOKEN e GITHUB_REPO (ex.: "usuario/repositorio").
 * Para testes locais, ARMAZENAMENTO_LOCAL aponta para uma pasta com o dados.json.
 */
"use strict";

const fs = require("fs/promises");
const path = require("path");

const DATA_FILE = "dados.json";
const TENTATIVAS = 4;

/** Erro com status HTTP para devolver ao navegador. */
class HttpError extends Error {
  /**
   * @param {number} status Código HTTP.
   * @param {string} message Mensagem em português para o usuário.
   */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Sinaliza que o branch andou entre a leitura e a escrita. */
class Conflito extends Error {}

/**
 * Armazenamento no GitHub via Git Data API (vários arquivos num único commit).
 *
 * @param {{token: string, repo: string, branch: string}} cfg Configuração.
 * @return {!Object} Armazenamento.
 */
function githubStore({ token, repo, branch }) {
  /**
   * Chama a API REST do GitHub.
   *
   * @param {string} method Método HTTP.
   * @param {string} url Caminho relativo ao repositório.
   * @param {*=} body Corpo JSON.
   * @return {!Promise<*>} Resposta JSON.
   */
  async function api(method, url, body) {
    const res = await fetch("https://api.github.com/repos/" + repo + url, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "conselho-dos-passaros",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = new Error("GitHub " + res.status + " em " + method + " " + url + ": " + (await res.text()).slice(0, 300));
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  const head = async () => (await api("GET", "/git/ref/heads/" + branch)).object.sha;

  /** Lê o dados.json numa referência (branch ou commit). */
  async function readAt(ref) {
    const meta = await api("GET", "/contents/" + DATA_FILE + "?ref=" + encodeURIComponent(ref));
    // Acima de 1 MB a API de conteúdo não traz o texto; o blob traz.
    const b64 = meta.encoding === "base64" && meta.content ? meta.content : (await api("GET", "/git/blobs/" + meta.sha)).content;
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  }

  /**
   * Cria um commit sobre `parent` e move o branch para ele.
   *
   * @param {string} parent SHA do commit pai.
   * @param {!Array<{path: string, content: ?(string|Buffer)}>} files content null remove o arquivo.
   * @param {string} message Mensagem do commit.
   */
  async function commit(parent, files, message) {
    const base = await api("GET", "/git/commits/" + parent);
    const entries = [];
    for (const f of files) {
      if (f.content == null) {
        entries.push({ path: f.path, mode: "100644", type: "blob", sha: null });
        continue;
      }
      const blob = await api("POST", "/git/blobs", { content: Buffer.from(f.content).toString("base64"), encoding: "base64" });
      entries.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    let tree;
    try {
      tree = await api("POST", "/git/trees", { base_tree: base.tree.sha, tree: entries });
    } catch (e) {
      // Remover um arquivo que já não existe falha; nesse caso grava sem as remoções.
      if (e.status !== 422 || !entries.some((x) => x.sha === null)) throw e;
      tree = await api("POST", "/git/trees", { base_tree: base.tree.sha, tree: entries.filter((x) => x.sha !== null) });
    }
    const c = await api("POST", "/git/commits", { message, tree: tree.sha, parents: [parent] });
    try {
      await api("PATCH", "/git/refs/heads/" + branch, { sha: c.sha, force: false });
    } catch (e) {
      if (e.status === 422 || e.status === 409) throw new Conflito();
      throw e;
    }
  }

  /** Repete a operação quando outro commit chegou antes. */
  async function retry(fn) {
    for (let i = 1; ; i++) {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof Conflito) || i >= TENTATIVAS) throw e;
      }
    }
  }

  return {
    rawBase: "https://raw.githubusercontent.com/" + repo + "/" + branch + "/",
    read: () => readAt(branch),
    update: (mutate, message) => retry(async () => {
      const parent = await head();
      const data = await readAt(parent);
      const out = mutate(data);
      await commit(parent, [
        { path: DATA_FILE, content: JSON.stringify(data, null, 1) + "\n" },
        ...(out.remove || []).map((p) => ({ path: p, content: null })),
      ], message(out));
      return { data, result: out.result };
    }),
    put: (file, content, message) => retry(async () => commit(await head(), [{ path: file, content }], message)),
  };
}

/**
 * Armazenamento numa pasta local (testes e desenvolvimento).
 *
 * @param {string} dir Pasta que contém o dados.json.
 * @return {!Object} Armazenamento.
 */
function localStore(dir) {
  const full = (p) => {
    const f = path.resolve(dir, p);
    if (!f.startsWith(path.resolve(dir) + path.sep)) throw new HttpError(400, "Caminho inválido.");
    return f;
  };
  const read = async () => JSON.parse(await fs.readFile(full(DATA_FILE), "utf8"));
  let fila = Promise.resolve();
  const serial = (fn) => (fila = fila.then(fn, fn));
  return {
    rawBase: null,
    read,
    update: (mutate) => serial(async () => {
      const data = await read();
      const out = mutate(data);
      await fs.writeFile(full(DATA_FILE), JSON.stringify(data, null, 1) + "\n");
      for (const p of out.remove || []) await fs.rm(full(p), { force: true });
      return { data, result: out.result };
    }),
    put: async (file, content) => {
      await fs.mkdir(path.dirname(full(file)), { recursive: true });
      await fs.writeFile(full(file), content);
    },
  };
}

/**
 * Escolhe o armazenamento conforme as variáveis de ambiente.
 *
 * @return {!Object} Armazenamento configurado.
 * @throws {HttpError} Quando nada está configurado.
 */
function getStore() {
  const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, ARMAZENAMENTO_LOCAL } = process.env;
  if (GITHUB_TOKEN && GITHUB_REPO) return githubStore({ token: GITHUB_TOKEN, repo: GITHUB_REPO, branch: GITHUB_BRANCH || "main" });
  if (ARMAZENAMENTO_LOCAL) return localStore(ARMAZENAMENTO_LOCAL);
  throw new HttpError(503, "Servidor sem armazenamento configurado (defina GITHUB_TOKEN e GITHUB_REPO).");
}

module.exports = { getStore, HttpError };
