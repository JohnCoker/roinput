// Auto-discovers the example files under test/data so dropping in a new pair from
// Chuck needs no test edits. Each suite globs its folder and runs a parametrized
// battery (see *.test.ts). Fixtures are paired across folders by identical base name,
// or by stripping a trailing " (variant)" suffix for cosmetic variants.

type RawModules = Record<string, string>;

function baseName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.[^.]+$/, "");
}

function byBase(modules: RawModules): Map<string, string> {
  const map = new Map<string, string>();
  for (const [path, text] of Object.entries(modules)) {
    map.set(baseName(path), text);
  }
  return map;
}

const validDat = byBase(
  import.meta.glob("./data/valid/*.dat", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as RawModules,
);
const validOut = byBase(
  import.meta.glob("./data/valid/*.out", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as RawModules,
);
const cosmeticDat = byBase(
  import.meta.glob("./data/cosmetic/*.dat", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as RawModules,
);
const brokenDat = byBase(
  import.meta.glob("./data/broken/*.dat", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as RawModules,
);

export interface ValidFixture {
  name: string;
  dat: string;
  out: string;
}

export interface DatFixture {
  name: string;
  dat: string;
}

export const validFixtures: ValidFixture[] = [...validDat.entries()]
  .map(([name, dat]) => ({ name, dat, out: validOut.get(name) ?? "" }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const cosmeticFixtures: DatFixture[] = [...cosmeticDat.entries()]
  .map(([name, dat]) => ({ name, dat }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const brokenFixtures: DatFixture[] = [...brokenDat.entries()]
  .map(([name, dat]) => ({ name, dat }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Map a cosmetic variant filename to its corrected counterpart in valid/. */
export function validName(variantName: string): string {
  return variantName.replace(/ \([^)]+\)$/, "");
}

/** The canonical golden produced by our serializer, paired by base name. */
export function canonicalPath(name: string): string {
  return `./data/canonical/${name}.dat`;
}
