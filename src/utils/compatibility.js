import semver from 'semver';
import colors from './colors.js';
import { printKeyValue } from './table-helper.js';
import { fetchAbbreviated } from './npm-search.js';

// ═══════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════

/** Peer-dependency keys that indicate Angular coupling (checked in priority order). */
const ANGULAR_DEP_KEYS = [
  '@angular/core',
  '@angular/common',
  '@angular/platform-browser',
];

/** Package prefixes that follow Angular's major-version cadence. */
const ANGULAR_ECOSYSTEM_PREFIXES = [
  '@angular/',
  '@ngrx/',
  '@ngxs/',
  '@ng-bootstrap/',
  '@angular-eslint/',
];

// ═══════════════════════════════════════════════════════════════════════
//  Internal Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Find the first Angular peer-dependency value in a peerDependencies map.
 * @returns {string | null}
 */
function findAngularPeerDep(peerDeps) {
  for (const key of ANGULAR_DEP_KEYS) {
    if (peerDeps[key]) return peerDeps[key];
  }
  return null;
}

/**
 * Return stable (non-prerelease), valid semver strings from abbreviated
 * metadata, sorted newest-first.
 *
 * Uses `semver.prerelease()` instead of fragile regex — correctly
 * catches rc, beta, alpha, next, canary, and any other prerelease tag.
 */
function stableVersionsDesc(data) {
  return Object.keys(data.versions || {})
    .filter(v => semver.valid(v) && !semver.prerelease(v))
    .sort(semver.rcompare);
}

/**
 * Safely check if `version` satisfies `range`.
 * Falls back to major-version string heuristic when semver
 * can't parse a non-standard range.
 */
function satisfiesSafe(version, range) {
  try {
    return semver.satisfies(version, range);
  } catch {
    const major = version.split('.')[0];
    return (
      range.includes(`^${major}.`) ||
      range.includes(`~${major}.`) ||
      range.includes(`>=${major}.`) ||
      range.includes(`${major}.x`)
    );
  }
}

/**
 * Check if a package name belongs to the Angular ecosystem
 * (and therefore follows Angular's major-version cadence).
 */
function isEcosystemPackage(name) {
  return ANGULAR_ECOSYSTEM_PREFIXES.some(p => name.startsWith(p));
}

// ═══════════════════════════════════════════════════════════════════════
//  Node.js Compatibility
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if the current Node.js version satisfies the required range.
 */
export function checkNodeCompatibility(currentNodeVersion, requiredNodeVersion) {
  try {
    return {
      compatible: semver.satisfies(currentNodeVersion, requiredNodeVersion),
      current: currentNodeVersion,
      required: requiredNodeVersion,
    };
  } catch (error) {
    return {
      compatible: false,
      current: currentNodeVersion,
      required: requiredNodeVersion,
      error: error.message,
    };
  }
}

/**
 * Display a formatted compatibility-check table.
 * @returns {boolean} Whether the versions are compatible.
 */
export function displayCompatibilityStatus(compatibility) {
  printKeyValue('📋 Compatibility Check', [
    ['Current Node.js', colors.info(`v${compatibility.current}`)],
    ['Required Node.js', colors.info(compatibility.required)],
    ['Status', compatibility.compatible
      ? colors.success('✓ Compatible')
      : colors.error('✗ Incompatible')],
  ]);
  return compatibility.compatible;
}

/**
 * Filter installed Node.js versions to those satisfying a range,
 * sorted newest-first.
 */
export function findCompatibleVersions(availableVersions, requiredRange) {
  return availableVersions
    .filter(v => {
      try { return semver.satisfies(v, requiredRange); }
      catch { return false; }
    })
    .sort(semver.rcompare);
}

/**
 * Extract the minimum compatible Node.js version from a range string.
 *
 * Uses `semver.minVersion` for correct parsing of complex OR-ranges
 * like `^18.0.0 || ^20.0.0 || ^22.0.0` → `18.0.0`.
 */
export function getRecommendedNodeVersion(requiredRange) {
  try {
    const min = semver.minVersion(requiredRange);
    if (min) return min.version;
  } catch { /* fall through */ }

  console.log(colors.warning(
    '⚠️  Could not parse Node version range. Please install the latest LTS version.'
  ));
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
//  Angular CLI Utilities
// ═══════════════════════════════════════════════════════════════════════

/** Validate that a string is a well-formed semver. */
export function isValidAngularVersion(version) {
  return semver.valid(version) !== null;
}

/** Determine whether the Angular CLI needs to be installed or updated. */
export function needsAngularCli(currentVersion, targetVersion) {
  if (!currentVersion) {
    return { needed: true, reason: 'Angular CLI is not installed' };
  }

  const currentMajor = semver.major(currentVersion);
  const targetMajor = semver.major(targetVersion);

  if (currentMajor !== targetMajor) {
    return {
      needed: true,
      reason: `Angular CLI version mismatch (current: ${currentMajor}, target: ${targetMajor})`,
      suggestion: `Consider using npx @angular/cli@${targetVersion} instead`,
    };
  }

  return { needed: false, reason: 'Angular CLI version is compatible' };
}

// ═══════════════════════════════════════════════════════════════════════
//  Library ↔ Angular Compatibility  (single-request · in-memory)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check whether a specific library version is compatible with an Angular version.
 *
 * ⚡ Reads from the npm-search.js shared cache — **0 extra HTTP requests**
 *    if the package has been fetched before.
 *
 * @returns {{ compatible: boolean, peerDependency?: string, hasPeerDependency: boolean, reason: string }}
 */
export async function isVersionCompatibleWithAngular(packageName, version, angularVersion) {
  try {
    const data = await fetchAbbreviated(packageName);
    const peerDeps = data.versions?.[version]?.peerDependencies ?? {};
    const dep = findAngularPeerDep(peerDeps);

    if (!dep) {
      return {
        compatible: true,
        hasPeerDependency: false,
        reason: 'No Angular peer dependency found',
      };
    }

    const ok = satisfiesSafe(angularVersion, dep);
    return {
      compatible: ok,
      peerDependency: dep,
      hasPeerDependency: true,
      reason: ok
        ? `Angular ${angularVersion} satisfies ${dep}`
        : `Angular ${angularVersion} does not satisfy ${dep}`,
    };
  } catch {
    return {
      compatible: true,
      hasPeerDependency: false,
      reason: 'Could not verify compatibility',
    };
  }
}

/**
 * Find all stable versions of a package that are compatible with a given
 * Angular version.
 *
 * ⚡ **1 HTTP request** (or cached) — evaluates every version in-memory.
 *    Previous implementation made N+1 HTTP requests.
 */
export async function getAllCompatibleVersions(packageName, angularVersion, maxResults = 10) {
  try {
    const data = await fetchAbbreviated(packageName);
    const versions = stableVersionsDesc(data);
    const results = [];

    for (const version of versions) {
      if (results.length >= maxResults) break;

      const peerDeps = data.versions[version]?.peerDependencies ?? {};
      const dep = findAngularPeerDep(peerDeps);

      // Compatible if no Angular peer dep OR the range is satisfied
      if (!dep || satisfiesSafe(angularVersion, dep)) {
        results.push({
          version,
          peerDependency: dep ?? 'No Angular peer dependency',
          reason: dep ? `Satisfies ${dep}` : 'No peer dependency constraint',
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Dynamically find the best compatible version of a library for a given
 * Angular version.
 *
 * Strategy (in order):
 *   1. **Ecosystem packages** (`@angular/*`, `@ngrx/*`, …) → match major version
 *   2. **Peer-dependency check** → newest version whose peer deps are satisfied
 *   3. **No peer dep** → newest version (framework-agnostic)
 *   4. **Fallback** → `latest` dist-tag with a warning
 *
 * ⚡ Single HTTP request per package (cached + deduplicated via npm-search.js).
 */
export async function findCompatibleLibraryVersion(packageName, angularVersion) {
  let data;
  try {
    data = await fetchAbbreviated(packageName);
  } catch {
    return {
      version: 'latest',
      source: 'fallback',
      reason: 'Could not fetch package data',
      warning: true,
      matchType: 'fallback',
    };
  }

  const angularMajor = semver.major(angularVersion);
  const versions = stableVersionsDesc(data);
  const latest = data['dist-tags']?.latest;

  // ── 1. Angular ecosystem → match major version ──────────────
  if (isEcosystemPackage(packageName)) {
    const match = versions.find(
      v => parseInt(v.split('.')[0], 10) === angularMajor,
    );
    if (match) {
      return {
        version: `^${match}`,
        source: 'dynamic',
        reason: `Matched Angular major version ${angularMajor}`,
        matchType: 'ecosystem',
      };
    }
    // No matching major → fall through to peer-dep check
  }

  // ── 2 & 3. Peer-dependency or no-peer-dep check ─────────────
  for (const version of versions) {
    const peerDeps = data.versions[version]?.peerDependencies ?? {};
    const dep = findAngularPeerDep(peerDeps);

    if (!dep) {
      return {
        version: `^${version}`,
        source: 'dynamic',
        reason: 'No Angular peer dependency',
        matchType: 'no-peer',
      };
    }

    if (satisfiesSafe(angularVersion, dep)) {
      return {
        version: `^${version}`,
        source: 'dynamic',
        reason: `Angular ${angularVersion} satisfies ${dep}`,
        peerDependency: dep,
        matchType: 'peer-dependency',
      };
    }
  }

  // ── 4. Fallback ─────────────────────────────────────────────
  return {
    version: latest ? `^${latest}` : 'latest',
    source: 'fallback',
    reason: 'No version with compatible Angular peer dependency found',
    warning: true,
    matchType: 'fallback',
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  Batch Library Resolution
// ═══════════════════════════════════════════════════════════════════════

/**
 * Resolve compatible versions for a list of libraries against a target
 * Angular version.
 *
 * ⚡ **Parallel execution** — all libraries resolved concurrently.
 *    Each resolution is a single cached HTTP request at most.
 */
export async function resolveLibraryVersionsAsync(libraries, angularVersion) {
  return Promise.all(
    libraries.map(lib => resolveLibrary(lib, angularVersion)),
  );
}

/**
 * Resolve a single library entry.
 * @private
 */
async function resolveLibrary(lib, angularVersion) {
  const requested = lib.version || 'latest';

  // ── User asked for "latest" → find the best compatible version ──
  if (requested === 'latest') {
    const result = await findCompatibleLibraryVersion(lib.name, angularVersion);

    return {
      ...lib,
      version: result.version,
      originalVersion: requested,
      adjusted: result.source === 'dynamic',
      source: result.source,
      reason: result.reason,
      warning: result.warning || false,
    };
  }

  // ── Specific version → verify compatibility ─────────────────
  const clean = requested.replace(/^[\^~]/, '');
  const compat = await isVersionCompatibleWithAngular(lib.name, clean, angularVersion);

  return {
    ...lib,
    adjusted: false,
    compatible: compat.compatible,
    reason: compat.reason,
    warning: !compat.compatible,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  Legacy / Backward-Compatible Exports
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check compatibility using a raw peer-dependency range string.
 * Kept for any remaining call sites that pass pre-fetched peer dep strings.
 */
export function checkLibraryCompatibility(peerDependency, angularVersion) {
  if (!peerDependency || peerDependency === 'No Angular peer dependency') {
    return { compatible: true, reason: 'No Angular peer dependency specified' };
  }

  const ok = satisfiesSafe(angularVersion, peerDependency);
  return {
    compatible: ok,
    reason: ok
      ? `Angular ${angularVersion} satisfies peer dependency '${peerDependency}'`
      : `Angular ${angularVersion} does not satisfy peer dependency '${peerDependency}'`,
  };
}

/**
 * Synchronous fallback for library version resolution.
 * Only handles `@angular/` scoped packages — everything else gets "latest".
 *
 * @deprecated Prefer {@link resolveLibraryVersionsAsync} for accurate results.
 */
export function resolveLibraryVersions(libraries, angularVersion) {
  const major = angularVersion.split('.')[0];

  return libraries.map(lib => {
    const requested = lib.version || 'latest';

    if (requested !== 'latest') {
      return { ...lib, adjusted: false };
    }

    if (lib.name.startsWith('@angular/')) {
      return {
        ...lib,
        version: `^${major}.0.0`,
        originalVersion: requested,
        adjusted: true,
      };
    }

    return { ...lib, adjusted: false };
  });
}