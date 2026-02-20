import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { printKeyValue, printObjectList } from './table-helper.js';

const PROFILES_DIR = path.join(homedir(), '.ng-init');
const PROFILES_FILE = path.join(PROFILES_DIR, 'profiles.json');

/**
 * Ensure profiles directory exists
 */
async function ensureProfilesDirectory() {
    try {
        await fs.mkdir(PROFILES_DIR, { recursive: true });
        return true;
    } catch (error) {
        console.error(chalk.red('Failed to create profiles directory:'), error.message);
        return false;
    }
}

/**
 * Load all profiles
 */
export async function loadProfiles() {
    try {
        await ensureProfilesDirectory();
        const content = await fs.readFile(PROFILES_FILE, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        // File doesn't exist or is invalid
        return {};
    }
}

/**
 * Save profiles
 */
async function saveProfiles(profiles) {
    try {
        await ensureProfilesDirectory();
        await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
        return true;
    } catch (error) {
        console.error(chalk.red('Failed to save profiles:'), error.message);
        return false;
    }
}

/**
 * Save a profile
 */
export async function saveProfile(name, config) {
    const profiles = await loadProfiles();
    
    profiles[name] = {
        ...config,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    const success = await saveProfiles(profiles);
    
    if (success) {
        console.log(chalk.green(`✓ Profile "${name}" saved successfully`));
    }
    
    return success;
}

/**
 * Load a profile
 */
export async function loadProfile(name) {
    const profiles = await loadProfiles();
    return profiles[name] || null;
}

/**
 * Delete a profile
 */
export async function deleteProfile(name) {
    const profiles = await loadProfiles();
    
    if (!profiles[name]) {
        console.log(chalk.yellow(`Profile "${name}" not found`));
        return false;
    }
    
    delete profiles[name];
    const success = await saveProfiles(profiles);
    
    if (success) {
        console.log(chalk.green(`✓ Profile "${name}" deleted successfully`));
    }
    
    return success;
}

/**
 * List all profiles
 */
export async function listProfiles() {
    const profiles = await loadProfiles();
    return Object.keys(profiles);
}

/**
 * Get profile details
 */
export async function getProfileDetails(name) {
    const profile = await loadProfile(name);
    
    if (!profile) {
        return null;
    }
    
    return {
        name: name,
        angularVersion: profile.angularVersion,
        libraries: profile.libraries?.length || 0,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt
    };
}

/**
 * Export profile to file
 */
export async function exportProfile(name, outputPath) {
    const profile = await loadProfile(name);
    
    if (!profile) {
        console.log(chalk.red(`Profile "${name}" not found`));
        return false;
    }
    
    try {
        const exportData = {
            name: name,
            profile: profile,
            exportedAt: new Date().toISOString(),
            version: '1.0.0'
        };
        
        await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');
        console.log(chalk.green(`✓ Profile exported to ${outputPath}`));
        return true;
    } catch (error) {
        console.error(chalk.red('Failed to export profile:'), error.message);
        return false;
    }
}

/**
 * Import profile from file
 */
export async function importProfile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const importData = JSON.parse(content);
        
        if (!importData.name || !importData.profile) {
            console.log(chalk.red('Invalid profile file format'));
            return false;
        }
        
        const success = await saveProfile(importData.name, importData.profile);
        
        if (success) {
            console.log(chalk.green(`✓ Profile "${importData.name}" imported successfully`));
        }
        
        return success;
    } catch (error) {
        console.error(chalk.red('Failed to import profile:'), error.message);
        return false;
    }
}

/**
 * Display profile information
 */
export function displayProfileInfo(name, profile) {
    const rows = [];
    if (profile.angularVersion) rows.push(['Angular Version', chalk.green(profile.angularVersion)]);
    if (profile.template) rows.push(['Template', chalk.gray(`${profile.template} (deprecated)`)]);
    rows.push(['Libraries', chalk.cyan(profile.libraries?.length || 0)]);
    if (profile.createdAt) rows.push(['Created', chalk.gray(new Date(profile.createdAt).toLocaleString())]);
    if (profile.updatedAt) rows.push(['Updated', chalk.gray(new Date(profile.updatedAt).toLocaleString())]);

    printKeyValue(`📋 Profile: ${name}`, rows);

    if (profile.libraries && profile.libraries.length > 0) {
        const libs = profile.libraries.slice(0, 50).map(lib => ({ Library: lib.name, Version: lib.version, Description: lib.description || '' }));
        printObjectList('Libraries (showing up to 50)', libs, ['Library', 'Version', 'Description']);
        if (profile.libraries.length > 50) {
            console.log(chalk.gray(`  ... and ${profile.libraries.length - 50} more`));
        }
    }

    if (profile.options) {
        const opts = Object.entries(profile.options).map(([k, v]) => ({ Option: k, Value: String(v) }));
        printObjectList('Options', opts, ['Option', 'Value']);
    }
}
