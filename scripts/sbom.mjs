// Generates a CycloneDX 1.5 SBOM for Facts Only.
//
//   node scripts/sbom.mjs            write dist/facts-only-sbom-vX.Y.Z.cdx.json
//   node scripts/sbom.mjs --check    verify the committed SBOM still matches
//
// Two things make this SBOM worth reading rather than ceremonial.
//
// First, the interesting claim is a NEGATIVE one: nothing ships at runtime. The
// extension and the web app run on browser APIs alone, so the dependency list a
// reviewer cares about - the code that executes on a user's machine - is empty,
// and this file is the evidence rather than the assertion. The dev toolchain is
// listed separately and scoped "excluded", which is what CycloneDX means by a
// component that is not part of the delivered artifact.
//
// Second, it carries a SHA-256 for every file that actually ships, so the SBOM
// doubles as an integrity manifest: a published .zip can be checked against it
// file by file, not just as one opaque archive hash.
//
// No dependencies, by the same rule the project holds everywhere else - which
// is the only honest way to ship an SBOM asserting zero dependencies.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, posix, sep } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DIST = join(ROOT, "dist");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(ROOT, "extension", "manifest.json"), "utf8"));

if (pkg.version !== manifest.version) {
  console.error(`version mismatch: package.json ${pkg.version} vs manifest.json ${manifest.version}`);
  process.exit(1);
}
const VERSION = pkg.version;

// Everything that reaches a user: the extension as published to the stores, and
// the web app as deployed to Pages.
const SHIPPED = ["extension", "webapp"];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = SHIPPED.flatMap((d) => walk(join(ROOT, d)))
  .map((f) => relative(ROOT, f).split(sep).join(posix.sep))
  .sort();

const sha256 = (p) => createHash("sha256").update(readFileSync(join(ROOT, p))).digest("hex");

// Dev-only toolchain. scope "excluded" is the CycloneDX way of saying present in
// the build, absent from the artifact.
const devComponents = Object.entries(pkg.devDependencies || {}).map(([name, range]) => ({
  type: "library",
  "bom-ref": `pkg:npm/${name}@${range}`,
  name,
  version: range,
  purl: `pkg:npm/${name}@${range}`,
  scope: "excluded",
  description: "Build-time only; not present in the extension or the deployed web app."
}));

const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  // No serialNumber and no timestamp: both would change on every run and make
  // --check useless. The SBOM is a function of the tree, nothing else.
  metadata: {
    component: {
      type: "application",
      "bom-ref": `facts-only@${VERSION}`,
      name: pkg.name,
      version: VERSION,
      description: pkg.description,
      licenses: [{ license: { id: pkg.license } }],
      externalReferences: [
        { type: "website", url: pkg.homepage },
        { type: "vcs", url: (pkg.repository && pkg.repository.url) || "" }
      ]
    },
    properties: [
      { name: "facts-only:runtime-dependencies", value: String(Object.keys(pkg.dependencies || {}).length) },
      { name: "facts-only:shipped-files", value: String(files.length) }
    ]
  },
  components: [
    {
      type: "application",
      "bom-ref": `facts-only-extension@${VERSION}`,
      name: "facts-only-extension",
      version: VERSION,
      description: `Manifest V3 browser extension. ${manifest.permissions.length} permissions, ` +
        `no required host permissions; <all_urls> is optional and requested at point of use.`,
      properties: [
        { name: "extension:permissions", value: manifest.permissions.join(",") },
        { name: "extension:host_permissions", value: (manifest.host_permissions || []).join(",") || "(none)" },
        { name: "extension:optional_host_permissions", value: (manifest.optional_host_permissions || []).join(",") }
      ]
    },
    ...devComponents
  ],
  // Integrity manifest for the shipped tree.
  files: files.map((f) => ({ path: f, hashes: [{ alg: "SHA-256", content: sha256(f) }] }))
};

const json = JSON.stringify(bom, null, 2) + "\n";

// The canonical SBOM is committed, so CI can fail when the shipped tree changes
// and the SBOM does not. dist/ gets a version-stamped copy at release time.
const CANONICAL = join(ROOT, "sbom.cdx.json");

if (process.argv.includes("--check")) {
  let existing;
  try {
    existing = readFileSync(CANONICAL, "utf8");
  } catch {
    console.error("no sbom.cdx.json - run: node scripts/sbom.mjs");
    process.exit(1);
  }
  if (existing !== json) {
    console.error("SBOM is stale: the shipped tree changed but sbom.cdx.json did not.");
    console.error("Regenerate with: node scripts/sbom.mjs");
    process.exit(1);
  }
  console.log(`SBOM up to date (${files.length} shipped files, ${Object.keys(pkg.dependencies || {}).length} runtime deps)`);
  process.exit(0);
}

writeFileSync(CANONICAL, json);
console.log(`wrote ${relative(ROOT, CANONICAL)}`);

if (process.argv.includes("--dist")) {
  mkdirSync(DIST, { recursive: true });
  const stamped = join(DIST, `facts-only-sbom-v${VERSION}.cdx.json`);
  writeFileSync(stamped, json);
  console.log(`wrote ${relative(ROOT, stamped)}`);
}
console.log(`  ${files.length} shipped files hashed`);
console.log(`  ${Object.keys(pkg.dependencies || {}).length} runtime dependencies`);
console.log(`  ${devComponents.length} dev-only components (scope: excluded)`);
