/**
 * Gera as fichas em Markdown a partir do dados.json.
 *
 * Cria fichas-md/<id>.md para cada personagem e fichas-md/README.md com o índice.
 * Rode de novo sempre que as fichas mudarem no site (depois de um git pull).
 *
 * Uso: node ferramentas/gerar-markdown.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const SAIDA = path.join(RAIZ, "fichas-md");
const GRAUS = ["Grau 4", "Grau 3", "Grau 2", "Grau 1", "Especial"];
const LADOS = { heroi: "Herói", vilao: "Vilão", neutro: "Neutro" };
const PLURAL = { heroi: "Heróis", vilao: "Vilões", neutro: "Neutros" };

/** Escapa caracteres que quebram células de tabela. */
const cel = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** Caminho de mídia visto a partir de fichas-md/ (links https ficam como estão). */
const midia = (p) => (/^https?:/.test(p) ? p : "../" + p);

/**
 * Converte uma ficha em Markdown.
 *
 * @param {!Object} c Ficha do dados.json.
 * @return {string} Conteúdo do arquivo.
 */
function ficha(c) {
  const out = ["# " + c.name, ""];
  if (c.subtitle) out.push("**" + c.subtitle + "**", "");
  const imgs = [c.photo && "![" + cel(c.photoAlt || "Foto de " + c.name) + "](" + midia(c.photo) + ")",
    c.logo && "![" + cel(c.logoAlt || "Logo de " + c.name) + "](" + midia(c.logo) + ")"].filter(Boolean);
  if (imgs.length) out.push(imgs.join(" "), "");
  if (c.quote) out.push("> “" + c.quote + "”", "");
  if (c.audio) out.push("🔊 [Ouvir a fala](" + midia(c.audio) + ")", "");

  out.push("| Lado | Classificação | Função | Série |", "|---|---|---|---|",
    "| " + cel(LADOS[c.side] || "—") + " | " + cel(GRAUS[(c.grade || 1) - 1] + (c.gradeNote ? " · " + c.gradeNote : "")) + " | " + cel(c.role) + " | " + cel(c.series) + " |", "");

  if (c.stats && c.stats.length) {
    const comBase = !!c.legend && c.stats.every((s) => s.base != null);
    out.push("## Atributos", "", "_Escala de 0 a 5_", "");
    out.push(comBase ? "| Atributo | " + cel(c.legend[0]) + " | " + cel(c.legend[1]) + " |" : "| Atributo | Valor |");
    out.push(comBase ? "|---|:-:|:-:|" : "|---|:-:|");
    for (const s of c.stats) out.push("| " + cel(s.label) + " | " + s.value + (comBase ? " | " + s.base : "") + " |");
    out.push("");
  }

  for (const g of c.groups || []) {
    if (!g.rows.length) continue;
    out.push("## " + g.title, "");
    for (const r of g.rows) {
      const titulo = [r.label && "_" + r.label + "_", r.value && "**" + r.value + "**"].filter(Boolean).join(" · ");
      out.push("- " + (titulo || "—") + (r.desc ? "  \n  " + r.desc : ""));
    }
    out.push("");
  }
  return out.join("\n");
}

function main() {
  const dados = JSON.parse(fs.readFileSync(path.join(RAIZ, "dados.json"), "utf8"));
  const lista = (dados.characters || []).slice().sort((a, b) => a.name.localeCompare(b.name, "pt"));
  fs.mkdirSync(SAIDA, { recursive: true });
  for (const c of lista) fs.writeFileSync(path.join(SAIDA, c.id + ".md"), ficha(c));
  const indice = ["# Conselho dos Pássaros", "", lista.length + " fichas.", ""];
  const grupos = [...Object.keys(LADOS), ""].map((k) => [k, lista.filter((c) => (LADOS[c.side] ? c.side : "") === k)]);
  for (const [k, membros] of grupos) {
    if (!membros.length) continue;
    indice.push("## " + (k ? PLURAL[k] : "Sem lado definido") + " (" + membros.length + ")", "",
      "| Personagem | Subtítulo | Classificação |", "|---|---|---|",
      ...membros.map((c) => "| [" + cel(c.name) + "](" + c.id + ".md) | " + cel(c.subtitle) + " | " + cel(GRAUS[(c.grade || 1) - 1]) + " |"), "");
  }
  fs.writeFileSync(path.join(SAIDA, "README.md"), indice.join("\n"));
  console.log(lista.length + " fichas geradas em " + SAIDA);
}

main();
