import axios from 'axios';
import colors from './colors.js';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

// ═══════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════

const NPM_REGISTRY = 'https://registry.npmjs.org';
const NPM_SEARCH = `${NPM_REGISTRY}/-/v1/search`;
const NPM_DOWNLOADS = 'https://api.npmjs.org/downloads/point/last-week';

const TIMEOUT = 5_000;
const TIMEOUT_EXTENDED = 10_000;
const CACHE_TTL = 5 * 60_000;            // 5 minutes
const PRERELEASE_RE = /-(rc|beta|next|alpha|canary|dev|pre)/i;

// ═══════════════════════════════════════════════════════════════════════
//  HTTP Clients — connection pooling + keep-alive + compression
// ═══════════════════════════════════════════════════════════════════════

const agentOpts = { keepAlive: true, maxSockets: 15, maxFreeSockets: 5 };
const httpAgent = new HttpAgent(agentOpts);
const httpsAgent = new HttpsAgent(agentOpts);

/** Full-metadata client (for description, homepage, license, etc.) */
const api = axios.create({
  timeout: TIMEOUT,
  httpAgent,
  httpsAgent,
  headers: { 'Accept-Encoding': 'gzip, deflate, br' },
});

/**
 * Abbreviated-metadata client.
 * Returns only install-relevant fields: versions (with deps, engines, dist), dist-tags.
 * Payloads are 10–100× smaller than full metadata.
 * @see https://github.com/npm/registry/blob/master/docs/responses/package-metadata.md
 */
const apiLite = axios.create({
  timeout: TIMEOUT_EXTENDED,
  httpAgent,
  httpsAgent,
  headers: {
    Accept: 'application/vnd.npm.install-v1+json',
    'Accept-Encoding': 'gzip, deflate, br',
  },
});

// ═══════════════════════════════════════════════════════════════════════
//  TTL Cache with In-Flight Request Deduplication
// ═══════════════════════════════════════════════════════════════════════

class TTLCache {
  #store = new Map();
  #inflight = new Map();
  #ttl;

  constructor(ttl = CACHE_TTL) {
    this.#ttl = ttl;
  }

  get(key) {
    const entry = this.#store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.exp) {
      this.#store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this.#store.set(key, { value, exp: Date.now() + this.#ttl });
    return this;
  }

  /**
   * Deduplicate concurrent requests for the same key.
   * If a fetch is already in-flight, returns the existing Promise
   * instead of firing a duplicate HTTP request.
   */
  async dedupe(key, fetcher) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    if (!this.#inflight.has(key)) {
      const promise = fetcher()
        .then(value => {
          this.set(key, value);
          this.#inflight.delete(key);
          return value;
        })
        .catch(err => {
          this.#inflight.delete(key);
          throw err;
        });

      this.#inflight.set(key, promise);
    }

    return this.#inflight.get(key);
  }

  clear() {
    this.#store.clear();
    this.#inflight.clear();
  }
}

const cache = new TTLCache();

// ═══════════════════════════════════════════════════════════════════════
//  Version Utilities (zero external dependencies)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Numerically compare two semver strings.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function semverCompare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0, len = Math.max(pa.length, pb.length); i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Sort version strings descending (newest first). Returns a new array. */
function sortDesc(versions) {
  return [...versions].sort((a, b) => semverCompare(b, a));
}

/** Filter out pre-release versions and sort descending. */
function stableSortedDesc(versions) {
  return sortDesc(versions.filter(v => !PRERELEASE_RE.test(v)));
}

/** Map a package search result object to our normalized shape. */
function mapSearchResult({ package: pkg }) {
  return {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description || 'No description',
    author: pkg.publisher?.username || 'Unknown',
    date: pkg.date,
    verified: pkg.publisher?.verified ?? false,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  Internal Data Fetching (cached + deduplicated)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fetch abbreviated metadata — versions, dist-tags, deps, engines only.
 * Dramatically smaller than full metadata. Cached and deduplicated.
 */
export function fetchAbbreviated(packageName) {
  return cache.dedupe(`abbr:${packageName}`, async () => {
    const { data } = await apiLite.get(`${NPM_REGISTRY}/${packageName}`);
    return data;
  });
}

/**
 * Fetch full metadata — includes description, homepage, license, etc.
 * Larger payload; use only when those fields are needed.
 */
function fetchFull(packageName) {
  return cache.dedupe(`full:${packageName}`, async () => {
    const { data } = await api.get(`${NPM_REGISTRY}/${packageName}`);
    return data;
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Search & Package Info
// ═══════════════════════════════════════════════════════════════════════

/**
 * Search npm packages by query string.
 * Accepts an optional AbortSignal to cancel in-flight requests (e.g. from inquirer's search).
 */
export async function searchNpmPackages(query, size = 10, { signal } = {}) {
    if (!query?.trim()) return [];

    try {
        const { data } = await api.get(NPM_SEARCH, {
            params: { text: query, size },
            signal,
        });
        return data.objects.map(mapSearchResult);
    } catch (error) {
        if (error.name === 'CanceledError' || signal?.aborted) return [];
        console.error('Error searching npm packages:', error.message);
        return [];
    }
}

/**
 * Get detailed package info (requires full metadata).
 */
export async function getPackageDetails(packageName) {
  try {
    const data = await fetchFull(packageName);

    return {
      name: data.name,
      description: data.description || 'No description',
      latestVersion: data['dist-tags']?.latest,
      versions: Object.keys(data.versions || {}),
      homepage: data.homepage,
      repository: data.repository,
      license: data.license,
      keywords: data.keywords || [],
    };
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}

/**
 * Get weekly download count for a package.
 */
export async function getPackageDownloads(packageName) {
  try {
    const { data } = await api.get(`${NPM_DOWNLOADS}/${packageName}`);
    return data.downloads;
  } catch {
    return 0;
  }
}

/**
 * Check whether a package exists (uses lightweight abbreviated metadata).
 */
export async function validatePackage(packageName) {
  try {
    await fetchAbbreviated(packageName);
    return true;
  } catch (error) {
    if (error.response?.status === 404) return false;
    throw error;
  }
}

/**
 * Get enriched package info: details + weekly downloads (parallel fetch).
 */
export async function getEnhancedPackageInfo(packageName) {
  try {
    const [details, downloads] = await Promise.all([
      getPackageDetails(packageName),
      getPackageDownloads(packageName),
    ]);

    return details ? { ...details, weeklyDownloads: downloads } : null;
  } catch (error) {
    console.error(`Error getting package info for ${packageName}:`, error.message);
    return null;
  }
}

/**
 * Format a download count for human-readable display.
 */
export function formatDownloads(count) {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

// ═══════════════════════════════════════════════════════════════════════
//  Debounced Search (with stale-request cancellation)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a debounced search function that automatically cancels
 * in-flight HTTP requests when a newer keystroke arrives.
 */
export function createDebouncedSearch(delay = 300) {
  let timer = null;
  let controller = null;

  return function debouncedSearch(query, callback) {
    if (timer) clearTimeout(timer);
    if (controller) controller.abort();

    if (!query || query.length < 2) {
      callback([]);
      return;
    }

    const ac = (controller = new AbortController());

    timer = setTimeout(async () => {
      try {
        const { data } = await api.get(NPM_SEARCH, {
          params: { text: query, size: 10 },
          signal: ac.signal,
        });
        if (!ac.signal.aborted) {
          callback(data.objects.map(mapSearchResult));
        }
      } catch (error) {
        if (!ac.signal.aborted) callback([]);
      }
    }, delay);
  };
}

/** Default debounced search instance (backward-compatible export). */
export const debouncedSearch = createDebouncedSearch();

// ═══════════════════════════════════════════════════════════════════════
//  Version Listing (abbreviated metadata — fast)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get all stable versions of a package, sorted newest-first.
 * Uses abbreviated metadata for minimal payload size.
 */
export async function getPackageVersions(packageName) {
  try {
    const data = await fetchAbbreviated(packageName);
    const versions = stableSortedDesc(Object.keys(data.versions || {}));
    const distTags = data['dist-tags'] || {};

    return {
      versions,
      latest: distTags.latest ?? null,
      lts: distTags.lts ?? null,
    };
  } catch (error) {
    console.error(`Error fetching versions for ${packageName}:`, error.message);
    return { versions: [], latest: null, lts: null };
  }
}

/**
 * Get all stable @angular/cli versions.
 * Convenience wrapper — identical cache as getPackageVersions('@angular/cli').
 */
export function getAngularVersions() {
  return getPackageVersions('@angular/cli');
}

// ═══════════════════════════════════════════════════════════════════════
//  Version Grouping Helpers
// ═══════════════════════════════════════════════════════════════════════

/** Extract unique major version numbers, sorted descending. */
export function getMajorVersions(versions) {
  const majors = [...new Set(versions.map(v => v.split('.')[0]))];
  return majors.sort((a, b) => Number(b) - Number(a));
}

/** Get minor version groups for a given major (e.g. "16.2", "16.1"), sorted descending. */
export function getMinorVersionsForMajor(versions, major) {
  const prefix = `${major}.`;
  const minors = [
    ...new Set(
      versions
        .filter(v => v.startsWith(prefix))
        .map(v => v.split('.').slice(0, 2).join('.'))
    ),
  ];
  return sortDesc(minors);
}

/** Get patch versions for a specific major.minor prefix, sorted descending. */
export function getPatchVersionsForMinor(versions, majorMinor) {
  return sortDesc(versions.filter(v => v.startsWith(`${majorMinor}.`)));
}

// ═══════════════════════════════════════════════════════════════════════
//  Angular-Specific Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get Node.js engine requirements for a specific @angular/cli version.
 * Reads from the (cached) abbreviated metadata — no extra HTTP request
 * if any Angular version data was already fetched.
 */
export async function getNodeRequirementsForAngular(angularVersion) {
  const major = parseInt(angularVersion.split('.')[0], 10);

  try {
    const data = await fetchAbbreviated('@angular/cli');
    const nodeEngine = data.versions?.[angularVersion]?.engines?.node;

    if (nodeEngine) return nodeEngine;

    return deriveNodeRequirement(major);
  } catch {
    console.log(colors.muted(
      `Unable to fetch Node requirements, deriving from Angular ${major}…`
    ));
    return deriveNodeRequirement(major);
  }
}

/**
 * Heuristic Node.js requirement based on Angular major version.
 * Generates three even (LTS-eligible) Node version ranges.
 */
function deriveNodeRequirement(angularMajor) {
  let base;
  if (angularMajor >= 15) base = Math.floor(angularMajor / 2) * 2;
  else if (angularMajor >= 10) base = Math.floor((angularMajor + 2) / 2) * 2;
  else base = Math.floor((angularMajor * 1.5) / 2) * 2;

  return `^${base}.0.0 || ^${base + 2}.0.0 || ^${base + 4}.0.0`;
}

// ═══════════════════════════════════════════════════════════════════════
//  Compatibility Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get peer dependencies for a specific version of a package.
 * Reads from cached abbreviated metadata — no additional HTTP request
 * if the package was already fetched.
 */
export async function getPackagePeerDependencies(packageName, version) {
  try {
    const data = await fetchAbbreviated(packageName);
    return data.versions?.[version]?.peerDependencies || {};
  } catch (error) {
    console.error(
      `Error fetching peer dependencies for ${packageName}@${version}:`,
      error.message
    );
    return {};
  }
}

/**
 * Find versions of `packageName` compatible with a given Angular version.
 *
 * ⚡ Performance: fetches abbreviated metadata ONCE (single HTTP request)
 *    and evaluates all versions in-memory — vs. the previous N+1 approach.
 */
export async function findCompatiblePackageVersions(
  packageName,
  angularVersion,
  maxResults = 5
) {
  try {
    const data = await fetchAbbreviated(packageName);
    const allVersions = stableSortedDesc(Object.keys(data.versions || {}));
    const angularMajor = angularVersion.split('.')[0];
    const compatible = [];

    for (const version of allVersions) {
      if (compatible.length >= maxResults) break;

      const peers = data.versions[version]?.peerDependencies || {};
      const angularDep = peers['@angular/core'] || peers['@angular/common'];

      if (angularDep) {
        if (
          angularDep.includes(`^${angularMajor}.`) ||
          angularDep.includes(`~${angularMajor}.`) ||
          angularDep.includes(`>=${angularMajor}.`) ||
          angularDep.includes(`${angularMajor}.x`)
        ) {
          compatible.push({ version, peerDependency: angularDep });
        }
      } else {
        compatible.push({ version, peerDependency: 'No Angular peer dependency' });
      }
    }

    return compatible;
  } catch (error) {
    console.error(
      `Error finding compatible versions for ${packageName}:`,
      error.message
    );
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Lifecycle
// ═══════════════════════════════════════════════════════════════════════

/** Flush all cached data. */
export function clearCache() {
  cache.clear();
}

/** Destroy keep-alive sockets (call on process exit if needed). */
export function destroy() {
  cache.clear();
  httpAgent.destroy();
  httpsAgent.destroy();
}