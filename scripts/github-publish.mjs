// Publishes the local git history to GitHub via the REST API (Git Data API).
// Use when the local git binary cannot reach github.com directly (e.g. a
// firewall silently dropping git-remote-https.exe while allowing other
// processes). Recreates every commit (blobs, trees, commits, refs) with the
// exact author/committer metadata — so the resulting remote commit SHAs match
// the local ones and a later normal `git push` is a no-op fast-forward.
//
// Usage:
//   GITHUB_TOKEN=github_pat_… GITHUB_REPO=MohammadThabetHassan/facts-only \
//     node scripts/github-publish.mjs
//
// The token is read from the environment only and never stored or logged.

import { execFileSync } from "node:child_process";

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO;
if (!TOKEN || !REPO) {
  console.error("Usage: GITHUB_TOKEN=… GITHUB_REPO=<owner>/<repo> node scripts/github-publish.mjs");
  process.exit(1);
}

const API = `https://api.github.com/repos/${REPO}`;
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "facts-only-publish"
};

function git(...args) {
  return execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 })
    .toString()
    .trim();
}

async function api(method, path, body) {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// Build an ISO date with the ORIGINAL offset preserved (needed to reproduce SHAs).
function isoWithOffset(unixTs, tz) {
  const sign = tz[0] === "-" ? -1 : 1;
  const hh = Number(tz.slice(1, 3));
  const mm = Number(tz.slice(3, 5));
  const d = new Date((unixTs + sign * (hh * 3600 + mm * 60)) * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `${tz.slice(0, 1)}${tz.slice(1)}`
  );
}

function personToApi(raw, label, commitSha) {
  const m = raw.match(new RegExp(`^${label} (.+) <(.+)> (\\d+) ([+-]\\d{4})$`, "m"));
  if (!m) throw new Error(`commit ${commitSha}: cannot parse ${label} line`);
  const [, name, email, ts, tz] = m;
  return { name, email, date: isoWithOffset(Number(ts), tz) };
}

async function ensureBlob(sha, uploaded) {
  if (uploaded.has(sha)) return;
  const content = execFileSync("git", ["cat-file", "blob", sha], { maxBuffer: 64 * 1024 * 1024 });
  const res = await api("POST", "git/blobs", { content: content.toString("base64"), encoding: "base64" });
  if (res.sha !== sha) throw new Error(`blob sha mismatch: local ${sha} vs remote ${res.sha}`);
  uploaded.add(sha);
}

// The Git Data API refuses blob creation on an EMPTY repo (409). Bootstrap the
// repo with a single marker commit via the Contents API, then chain the
// recreated local history on top of it. NOTE: this makes the remote lineage
// start one root commit earlier than local, so recreated commit SHAs differ
// from local SHAs (content identical).
async function bootstrapIfEmpty() {
  try {
    await api("GET", "commits?per_page=1");
    console.log("repository already has commits — no bootstrap needed");
    return null;
  } catch (e) {
    if (e.status !== 409) throw e;
  }
  console.log("empty repository → creating bootstrap commit…");
  const content = Buffer.from(
    "Bootstrap commit created because the GitHub Git Data API requires a non-empty repository. " +
    "The full Facts Only history follows this commit (see docs/VERIFICATION.md)."
  ).toString("base64");
  const res = await fetch(`${API}/contents/.facts-only-bootstrap`, {
    method: "PUT",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "chore: bootstrap empty repository",
      content
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`bootstrap failed: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  console.log(`  ✓ bootstrap commit ${json.commit.sha.slice(0, 8)}`);
  return json.commit.sha;
}

const bootstrapParent = await bootstrapIfEmpty();
const commits = git("rev-list", "--reverse", "main").split("\n");
console.log(`publishing ${commits.length} commits to ${REPO}…`);

const uploadedBlobs = new Set();
const remapped = {}; // local commit sha → remote commit sha

for (const sha of commits) {
  const raw = execFileSync("git", ["cat-file", "commit", sha], { maxBuffer: 16 * 1024 * 1024 }).toString();
  const treeSha = (raw.match(/^tree ([0-9a-f]{40})$/m) || [])[1];
  const parents = [...raw.matchAll(/^parent ([0-9a-f]{40})$/gm)].map((m) => m[1]);
  const entries = git("ls-tree", "-r", treeSha)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [meta, ...pathParts] = line.split("\t");
      const [mode, type, blobSha] = meta.split(" ");
      return { mode, type, blobSha, path: pathParts.join("\t") };
    });

  for (const e of entries) if (e.type === "blob") await ensureBlob(e.blobSha, uploadedBlobs);

  const tree = await api("POST", "git/trees", {
    tree: entries.map((e) => ({ path: e.path, mode: e.mode, type: e.type, sha: e.blobSha }))
  });
  if (tree.sha !== treeSha) throw new Error(`tree sha mismatch on ${sha}: local ${treeSha} vs remote ${tree.sha}`);

  const commit = await api("POST", "git/commits", {
    message: execFileSync("git", ["log", "-1", "--format=%B", sha]).toString(),
    tree: tree.sha,
    // local root commits are chained onto the bootstrap commit on the remote;
    // non-root parents use the already-recreated remote SHAs
    parents: parents.length ? parents.map((p) => remapped[p] || p) : [bootstrapParent],
    author: personToApi(raw, "author", sha),
    committer: personToApi(raw, "committer", sha)
  });
  console.log(`  ✓ ${sha.slice(0, 8)} → remote ${commit.sha.slice(0, 8)} (${entries.length} files)`);
  remapped[sha] = commit.sha;
}

// Collect lightweight-tag targets (tag → tagged commit).
const tags = git("tag", "--list").split("\n").filter(Boolean);
const tagTargets = {};
for (const tag of tags) tagTargets[tag] = remapped[git("rev-list", "-1", tag)];

async function createRef(ref, sha) {
  try {
    await api("POST", "git/refs", { ref, sha });
    console.log(`  ✓ created ${ref}`);
  } catch (e) {
    if (e.status === 422) {
      await api("PATCH", `git/refs/${ref.replace("refs/", "")}`, { sha, force: true });
      console.log(`  ✓ force-updated ${ref}`);
    } else {
      throw e;
    }
  }
}

await createRef("refs/heads/main", commits[commits.length - 1]);
for (const tag of tags) {
  await createRef(`refs/tags/${tag}`, tagTargets[tag]);
}

console.log("\nPUBLISH COMPLETE");
console.log(`Verify: https://github.com/${REPO}/commits/main`);
