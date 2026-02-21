import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import colors from './colors.js';
import { printKeyValue, printObjectList } from './table-helper.js';

// ═══════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════

const PROFILES_DIR = path.join(homedir(), '.ng-init');
const PROFILES_FILE = path.join(PROFILES_DIR, 'profiles.json');
const EXPORT_FORMAT_VERSION = '1.0.0';
const MAX_DISPLAY_LIBS = 50;

// ═══════════════════════════════════════════════════════════════════════
//  Internal: Lazy Directory Init + Cached Disk I/O
// ═══════════════════════════════════════════════════════════════════════

/**
 * Ensure the profiles directory exists. Called at most once per process
 * via the `_dirReady` promise. Subsequent calls are free.
 */
let _dirReady = null;

function ensureDir() {
  _dirReady ??= fs.mkdir(PROFILES_DIR, { recursive: true }).catch(err => {
    console.error(colors.error('Failed to create profiles directory:'), err.message);
    throw err;
  });
  return _dirReady;
}

/**
 * In-memory cache of the entire profiles map.
 * Avoids redundant disk reads when multiple operations happen in the
 * same CLI session (e.g. `listProfiles` → `loadProfile` → `saveProfile`).
 */
let _cache = null;

/**
 * Read and parse the profiles file from disk (or return empty object).
 * Result is cached — subsequent calls within the same process are free.
 */
async function readProfiles() {
  if (_cache !== null) return _cache;

  await ensureDir();

  try {
    const content = await fs.readFile(PROFILES_FILE, 'utf-8');
    _cache = JSON.parse(content);
  } catch {
    // File doesn't exist or contains invalid JSON → start fresh
    _cache = {};
  }

  return _cache;
}

/**
 * Persist the current in-memory profiles map to disk.
 * Always writes through to the file system and updates the cache.
 */
async function writeProfiles(profiles) {
  await ensureDir();

  try {
    await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
    _cache = profiles;
    return true;
  } catch (err) {
    console.error(colors.error('Failed to save profiles:'), err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — CRUD
// ═══════════════════════════════════════════════════════════════════════

/**
 * Load all profiles.
 * @returns {Promise<Record<string, object>>}
 */
export function loadProfiles() {
  return readProfiles();
}

/**
 * Load a single profile by name.
 * @returns {Promise<object | null>}
 */
export async function loadProfile(name) {
  const profiles = await readProfiles();
  return profiles[name] ?? null;
}

/**
 * List all profile names.
 * @returns {Promise<string[]>}
 */
export async function listProfiles() {
  const profiles = await readProfiles();
  return Object.keys(profiles);
}

/**
 * Save (create or update) a named profile.
 * @returns {Promise<boolean>}
 */
export async function saveProfile(name, config) {
  const profiles = await readProfiles();
  const now = new Date().toISOString();

  profiles[name] = {
    ...config,
    createdAt: profiles[name]?.createdAt ?? now,
    updatedAt: now,
  };

  const ok = await writeProfiles(profiles);
  if (ok) console.log(colors.success(`✓ Profile "${name}" saved successfully`));
  return ok;
}

/**
 * Delete a profile by name.
 * @returns {Promise<boolean>}
 */
export async function deleteProfile(name) {
  const profiles = await readProfiles();

  if (!profiles[name]) {
    console.log(colors.warning(`Profile "${name}" not found`));
    return false;
  }

  delete profiles[name];

  const ok = await writeProfiles(profiles);
  if (ok) console.log(colors.success(`✓ Profile "${name}" deleted successfully`));
  return ok;
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Detail & Display
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get a summary of a profile's key properties.
 * @returns {Promise<object | null>}
 */
export async function getProfileDetails(name) {
  const profile = await loadProfile(name);
  if (!profile) return null;

  return {
    name,
    angularVersion: profile.angularVersion,
    libraries: profile.libraries?.length ?? 0,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

/**
 * Display a formatted profile summary.
 */
export function displayProfileInfo(name, profile) {
  // ── Key-value header ────────────────────────────────────────
  const rows = [];

  if (profile.angularVersion) {
    rows.push(['Angular Version', colors.success(profile.angularVersion)]);
  }
  if (profile.template) {
    rows.push(['Template', colors.muted(`${profile.template} (deprecated)`)]);
  }

  rows.push(['Libraries', colors.info(String(profile.libraries?.length ?? 0))]);

  if (profile.createdAt) {
    rows.push(['Created', colors.muted(new Date(profile.createdAt).toLocaleString())]);
  }
  if (profile.updatedAt) {
    rows.push(['Updated', colors.muted(new Date(profile.updatedAt).toLocaleString())]);
  }

  printKeyValue(`📋 Profile: ${name}`, rows);

  // ── Libraries table ─────────────────────────────────────────
  const libs = profile.libraries;
  if (libs?.length > 0) {
    const displayed = libs.slice(0, MAX_DISPLAY_LIBS).map(lib => ({
      Library: lib.name,
      Version: lib.version,
      Description: lib.description ?? '',
    }));

    printObjectList(
      `Libraries (showing up to ${MAX_DISPLAY_LIBS})`,
      displayed,
      ['Library', 'Version', 'Description'],
    );

    if (libs.length > MAX_DISPLAY_LIBS) {
      console.log(colors.muted(`  … and ${libs.length - MAX_DISPLAY_LIBS} more`));
    }
  }

  // ── Options table ───────────────────────────────────────────
  if (profile.options) {
    printObjectList(
      'Options',
      Object.entries(profile.options).map(([k, v]) => ({
        Option: k,
        Value: String(v),
      })),
      ['Option', 'Value'],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API — Import / Export
// ═══════════════════════════════════════════════════════════════════════

/**
 * Export a profile to a standalone JSON file.
 * @returns {Promise<boolean>}
 */
export async function exportProfile(name, outputPath) {
  const profile = await loadProfile(name);

  if (!profile) {
    console.log(colors.error(`Profile "${name}" not found`));
    return false;
  }

  try {
    const data = {
      name,
      profile,
      exportedAt: new Date().toISOString(),
      version: EXPORT_FORMAT_VERSION,
    };

    await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(colors.success(`✓ Profile exported to ${outputPath}`));
    return true;
  } catch (err) {
    console.error(colors.error('Failed to export profile:'), err.message);
    return false;
  }
}

/**
 * Import a profile from a previously exported JSON file.
 *
 * Bug fix: the original code called `saveProfile()` which printed its
 * own "saved successfully" message, then printed *another* "imported
 * successfully" message. Now we write directly to avoid the double log.
 *
 * @returns {Promise<boolean>}
 */
export async function importProfile(filePath) {
  let importData;

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    importData = JSON.parse(content);
  } catch (err) {
    console.error(colors.error('Failed to read profile file:'), err.message);
    return false;
  }

  if (!importData.name || !importData.profile) {
    console.log(colors.error('Invalid profile file format'));
    return false;
  }

  const profiles = await readProfiles();
  const now = new Date().toISOString();

  profiles[importData.name] = {
    ...importData.profile,
    createdAt: importData.profile.createdAt ?? now,
    updatedAt: now,
  };

  const ok = await writeProfiles(profiles);
  if (ok) console.log(colors.success(`✓ Profile "${importData.name}" imported successfully`));
  return ok;
}

// Lifecycle helpers removed: `clearCache` was unused in-repo.