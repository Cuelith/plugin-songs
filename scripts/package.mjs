// Crea il pacchetto del modulo: dist/cuelith.songs-<versione>.cpkg (uno zip
// con manifest, testi e interfaccia) e stampa impronta e dimensione da
// scrivere nel registry.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "cuelith-plugin.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

if (manifest.version !== pkg.version) {
  console.error(`Versioni diverse: manifest ${manifest.version}, package.json ${pkg.version}`);
  process.exit(1);
}
const ui = join(root, "dist", "ui");
if (!existsSync(join(ui, "index.html"))) {
  console.error("Manca dist/ui/index.html: esegui prima vite build.");
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Percorsi nello zip sempre con "/". */
const entry = (base, file) => relative(base, file).split(sep).join("/");

// Data fissa: lo stesso sorgente produce lo stesso pacchetto (e la stessa impronta).
const mtime = new Date("2020-01-01T00:00:00Z");
const files = {
  "cuelith-plugin.json": [readFileSync(join(root, "cuelith-plugin.json")), { mtime }],
  LICENSE: [readFileSync(join(root, "LICENSE")), { mtime }],
};
if (existsSync(join(root, "README.md"))) {
  files["README.md"] = [readFileSync(join(root, "README.md")), { mtime }];
}
for (const file of walk(join(root, "locales"))) {
  files[`locales/${entry(join(root, "locales"), file)}`] = [readFileSync(file), { mtime }];
}
for (const file of walk(ui)) {
  files[`ui/${entry(ui, file)}`] = [readFileSync(file), { mtime }];
}

const zip = zipSync(files, { level: 9 });
const name = `${manifest.id}-${manifest.version}.cpkg`;
writeFileSync(join(root, "dist", name), zip);
const sha256 = createHash("sha256").update(zip).digest("hex");
console.log(`dist/${name}`);
console.log(`sha256 ${sha256}`);
console.log(`size   ${zip.length}`);
