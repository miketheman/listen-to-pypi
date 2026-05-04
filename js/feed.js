// RSS feed fetching, parsing, and deduplication

class FeedManager {
  constructor(options = {}) {
    this.updatesUrl = options.updatesUrl;
    this.packagesUrl = options.packagesUrl;
    this.maxSeen = options.maxSeen || 500;
    this.log = options.log || null;
    this.seen = new Set();
    this.initialized = false;
    this.lastFetchTime = null;
    this.lastFetchStatus = null;
    this.fetchCount = 0;
  }

  async fetchFeed(url) {
    this.log?.verbose(`Fetching ${url}`);

    const response = await fetch(url);
    this.lastFetchStatus = response.status;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }

    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/xml");

    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error(`XML parse error (${url}): ${parseError.textContent.slice(0, 100)}`);
    }

    return doc;
  }

  parseItems(doc, type) {
    const items = doc.querySelectorAll("item");
    const results = [];
    for (const item of items) {
      // Check link against seen set before doing full parse
      const link = this.getTagText(item, "link");
      if (this.seen.has(link)) continue;

      const rawTitle = this.getTagText(item, "title");
      const description = this.getTagText(item, "description");
      const pubDate = this.getTagText(item, "pubDate");
      const author = this.getTagText(item, "author");
      const { name, version } = this.parseTitle(rawTitle, type);

      results.push({
        type,
        rawTitle,
        name,
        version,
        versionType: type === "new_package" ? "new" : classifyVersion(version),
        category: classifyCategory(name, description),
        maturity: classifyMaturity(version),
        hasAuthor: author.length > 0,
        noteIndex: hashString(name) % 5,
        link,
        description,
        pubDate,
        author,
      });
    }
    return results;
  }

  getTagText(parent, tagName) {
    // Use getElementsByTagName for reliability across XML parsers
    const els = parent.getElementsByTagName(tagName);
    if (els.length === 0) return "";
    return (els[0].textContent || "").trim();
  }

  parseTitle(title, type) {
    if (type === "new_package") {
      return {
        name: title.replace(" added to PyPI", "").trim(),
        version: "new",
      };
    }
    // Updates: "package-name 1.2.3"
    const lastSpace = title.lastIndexOf(" ");
    if (lastSpace > 0) {
      return {
        name: title.substring(0, lastSpace).trim(),
        version: title.substring(lastSpace + 1).trim(),
      };
    }
    return { name: title.trim(), version: "" };
  }

  async poll() {
    this.fetchCount++;
    this.lastFetchTime = new Date();

    const [updatesDoc, packagesDoc] = await Promise.all([
      this.fetchFeed(this.updatesUrl),
      this.fetchFeed(this.packagesUrl),
    ]);

    // parseItems skips already-seen links, so these only contain new items
    const packages = this.parseItems(packagesDoc, "new_package");
    const updates = this.parseItems(updatesDoc, "update");

    // Mark all new items as seen
    const newPackageNames = new Set();
    for (const item of packages) {
      this.seen.add(item.link);
      newPackageNames.add(item.name);
    }
    for (const item of updates) {
      this.seen.add(item.link);
    }

    // Deduplicate: if a package appears in both feeds, prefer new_package
    let deduped = [...packages, ...updates.filter((u) => !newPackageNames.has(u.name))];

    if (!this.initialized) {
      // Initial seed: drop events older than 1 hour. The packages feed
      // can span ~100 minutes, which would feel stale - "live" should
      // mean roughly the last hour at most.
      const cutoff = Date.now() - 60 * 60 * 1000;
      const total = deduped.length;
      deduped = deduped.filter((e) => new Date(e.pubDate).getTime() >= cutoff);
      this.initialized = true;
      this.log?.info(
        `Initial load: seeded ${this.seen.size} seen items, queuing ${deduped.length} (${total - deduped.length} older than 1h skipped)`,
      );
    }

    this.log?.verbose(
      `Poll: ${packages.length} new packages, ${updates.length} updates, ${deduped.length} events`,
    );

    // Prune seen set to prevent unbounded growth
    if (this.seen.size > this.maxSeen) {
      const arr = Array.from(this.seen);
      this.seen = new Set(arr.slice(-(this.maxSeen - 200)));
      this.log?.verbose(`Pruned seen set to ${this.seen.size}`);
    }

    return deduped;
  }

  getStats() {
    return {
      seenSize: this.seen.size,
      fetchCount: this.fetchCount,
      lastFetchTime: this.lastFetchTime?.toISOString() || null,
      lastFetchStatus: this.lastFetchStatus,
      initialized: this.initialized,
    };
  }
}

// Classify version as major/minor/patch based on which part is the "significant" change
function classifyVersion(versionStr) {
  if (!versionStr) return "patch";

  // Strip common prefixes
  const cleaned = versionStr.replace(/^v/i, "");
  const parts = cleaned.split(".").map((p) => parseInt(p, 10));

  // Filter to only numeric parts
  const numeric = parts.filter((n) => !Number.isNaN(n));
  if (numeric.length === 0) return "patch";
  if (numeric.length === 1) return "major";

  // Find the last non-zero part index
  let lastNonZero = 0;
  for (let i = 0; i < numeric.length; i++) {
    if (numeric[i] !== 0) lastNonZero = i;
  }

  if (lastNonZero === 0) return "major";
  if (lastNonZero === 1) return "minor";
  return "patch";
}

// Classify version maturity: how established is this package?
// Higher major versions → 'mature', pre-1.0 → 'early', in between → 'growing'
function classifyMaturity(versionStr) {
  if (!versionStr || versionStr === "new") return "early";
  const major = parseInt(versionStr.replace(/^v/i, ""), 10);
  if (Number.isNaN(major)) return "early";
  if (major === 0) return "early";
  if (major >= 3) return "mature";
  return "growing";
}

// Classify package into a sound category based on description keywords.
// Categories map to different timbral voices in the audio engine.
const CATEGORY_PATTERNS = [
  ["web", /\b(django|flask|fastapi|http|rest|api|web|server|request|route|endpoint|wsgi|asgi)\b/i],
  ["data", /\b(data|pandas|numpy|csv|parquet|sql|database|db|query|etl|pipeline|warehouse)\b/i],
  ["ml", /\b(ml|ai|model|train|neural|torch|tensorflow|llm|gpt|embedding|inference|nlp|bert)\b/i],
  ["cli", /\b(cli|command|terminal|console|argparse|click|shell|prompt)\b/i],
  ["test", /\b(test|pytest|mock|fixture|assert|coverage|lint|check|ci)\b/i],
  [
    "infra",
    /\b(docker|kubernetes|k8s|deploy|cloud|aws|gcp|azure|terraform|infra|devops|monitor)\b/i,
  ],
];

function classifyCategory(name, description) {
  const text = `${name} ${description}`.toLowerCase();
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return "general";
}

// Simple string hash for deterministic note assignment
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export default FeedManager;
export { classifyCategory, classifyMaturity, classifyVersion, hashString };
