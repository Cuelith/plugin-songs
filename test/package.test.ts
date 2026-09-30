import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AUTHOR_ROLES, CatalogSchema, PluginManifestSchema } from "@cuelith/protocol";
import { describe, expect, it } from "vitest";
import { SECTION_KINDS } from "../src/model/song.js";

const root = join(import.meta.dirname, "..");
const readJson = (file: string): unknown => JSON.parse(readFileSync(join(root, file), "utf8"));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("pacchetto del modulo", () => {
  it("il manifest e' valido e ha la stessa versione del pacchetto", () => {
    const manifest = PluginManifestSchema.parse(readJson("cuelith-plugin.json"));
    const pkg = readJson("package.json") as { version: string };
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.id).toBe("cuelith.songs");
  });

  it("il catalogo italiano e' valido e contiene ogni chiave usata", () => {
    const catalog = CatalogSchema.parse(readJson("locales/it.json"));
    const has = (key: string) => key in catalog || `${key}#other` in catalog;
    const text = [
      readFileSync(join(root, "cuelith-plugin.json"), "utf8"),
      ...sources(join(root, "src")).map((file) => readFileSync(file, "utf8")),
    ].join("\n");
    const used = new Set(
      [...text.matchAll(/"(cuelith\.songs\.[a-zA-Z0-9.]+[a-zA-Z0-9])"/g)].map((m) => m[1] ?? ""),
    );
    used.delete("cuelith.songs.song");
    for (const kind of SECTION_KINDS) {
      used.add(`cuelith.songs.kind.${kind === "pre-chorus" ? "preChorus" : kind}`);
    }
    for (const role of AUTHOR_ROLES) used.add(`cuelith.songs.role.${role}`);
    const missing = [...used].filter((key) => !has(key));
    expect(missing).toEqual([]);
  });
});
