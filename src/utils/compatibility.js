import semver from 'semver';
import chalk from 'chalk';
import axios from 'axios';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';

// Cache for npm registry responses to avoid repeated requests
const packageCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Maximum number of cached packages

/**
 * Check if current Node version is compatible with Angular version
 */
export function checkNodeCompatibility(currentNodeVersion, requiredNodeVersion) {
    try {
        const isCompatible = semver.satisfies(currentNodeVersion, requiredNodeVersion);
        return {
            compatible: isCompatible,
            current: currentNodeVersion,
            required: requiredNodeVersion
        };
    } catch (error) {
        return {
            compatible: false,
            current: currentNodeVersion,
            required: requiredNodeVersion,
            error: error.message
        };
    }
}

/**
 * Display compatibility status
 */
export function displayCompatibilityStatus(compatibility) {
    console.log(chalk.bold.cyan('\n📋 Compatibility Check\n'));
    console.log(chalk.gray('━'.repeat(50)));
    
    console.log(chalk.white('Current Node.js:  ') + chalk.cyan(`v${compatibility.current}`));
    console.log(chalk.white('Required Node.js: ') + chalk.cyan(compatibility.required));
    
    if (compatibility.compatible) {
        console.log(chalk.white('Status:           ') + chalk.green('✓ Compatible'));
    } else {
        console.log(chalk.white('Status:           ') + chalk.red('✗ Incompatible'));
    }
    
    console.log(chalk.gray('━'.repeat(50)) + '\n');
    
    return compatibility.compatible;
}

/**
 * Find compatible Node versions from available versions
 */
export function findCompatibleVersions(availableVersions, requiredRange) {
    try {
        return availableVersions.filter(version => {
            try {
                return semver.satisfies(version, requiredRange);
            } catch {
                return false;
            }
        }).sort((a, b) => semver.rcompare(a, b)); // Sort descending (newest first)
    } catch (error) {
        return [];
    }
}

/**
 * Get recommended Node version from range (fully dynamic)
 * Extracts the lowest compatible major version and suggests a base version
 */
export function getRecommendedNodeVersion(requiredRange) {
    try {
        const ranges = requiredRange.split('||').map(r => r.trim());
        
        // Extract all major versions from the range
        const majorVersions = [];
        for (const range of ranges) {
            const match = range.match(/[~^><=]*\s*(\d+)\./g);
            if (match) {
                match.forEach(m => {
                    const major = parseInt(m.match(/(\d+)/)[1]);
                    if (!majorVersions.includes(major)) {
                        majorVersions.push(major);
                    }
                });
            }
        }
        
        if (majorVersions.length === 0) {
            // If we can't parse, suggest installing latest stable (no hardcoded version)
            console.log(chalk.yellow('⚠️  Could not parse Node version range. Please install the latest LTS version.'));
            return null;
        }
        
        // Sort and get the lowest major version (most compatible)
        majorVersions.sort((a, b) => a - b);
        const recommendedMajor = majorVersions[0];
        
        // Return the major version - let the installer determine the latest patch
        return `${recommendedMajor}.0.0`;
    } catch (error) {
        console.log(chalk.yellow('⚠️  Could not parse Node version range. Please install a compatible version manually.'));
        return null;
    }
}

/**
 * Angular version to Node.js compatibility matrix
 * This is fetched dynamically but we keep a fallback for offline use
 */
export async function getAngularNodeCompatibility(angularVersion) {
    try {
        // Fetch from @angular/cli package to get accurate engine requirements
        const response = await axios.get(`${NPM_REGISTRY_URL}/@angular/cli/${angularVersion}`, {
            timeout: 5000
        });
        
        const engines = response.data.engines || {};
        return engines.node || null;
    } catch (error) {
        // Fallback to estimated requirements based on major version
        return null;
    }
}

/**
 * Minimal fallback for when npm registry is unavailable
 * Returns a generic conservative range based on Angular version (fully dynamic)
 */
function getFallbackNodeRequirement(angularMajor) {
    // When npm registry is unavailable, we can't determine exact requirements
    // Return a very conservative range that suggests even major versions (LTS lines)
    // This is a last-resort fallback and should rarely be used
    
    // Generate a range based on the Angular major version
    // Even Node versions are LTS (12, 14, 16, 18, 20, 22...)
    // Strategy: suggest 3 Node LTS versions starting from a base derived from Angular version
    
    // Calculate base Node version (ensure it's even for LTS)
    // Use formula: if Angular is 15+, base is around Angular major, otherwise slightly higher
    let baseNode;
    if (angularMajor >= 15) {
        baseNode = Math.floor(angularMajor / 2) * 2; // Ensure even number
    } else if (angularMajor >= 10) {
        baseNode = Math.floor((angularMajor + 2) / 2) * 2; // Slightly higher for older Angular
    } else {
        baseNode = Math.floor((angularMajor * 1.5) / 2) * 2; // Even older Angular
    }
    
    const node1 = baseNode;
    const node2 = baseNode + 2;
    const node3 = baseNode + 4;
    
    return `^${node1}.0.0 || ^${node2}.0.0 || ^${node3}.0.0`;
}

/**
 * Get Node requirement from npm registry (dynamic fetch preferred)
 */
export async function getNodeRequirementFromMatrix(angularVersion) {
    // First try to fetch dynamically from npm registry
    const dynamicRequirement = await getAngularNodeCompatibility(angularVersion);
    if (dynamicRequirement) {
        return dynamicRequirement;
    }
    
    // Fallback to conservative estimate based on Angular major version
    const majorVersion = parseInt(angularVersion.split('.')[0]);
    console.log(chalk.yellow(`⚠️  Could not fetch Node requirements from npm registry, using fallback for Angular ${majorVersion}`));
    return getFallbackNodeRequirement(majorVersion);
}

/**
 * Validate Angular version format
 */
export function isValidAngularVersion(version) {
    return semver.valid(version) !== null;
}

/**
 * Check if Angular CLI is installed globally
 */
export function needsAngularCli(currentAngularCliVersion, targetAngularVersion) {
    if (!currentAngularCliVersion) {
        return {
            needed: true,
            reason: 'Angular CLI is not installed'
        };
    }

    const currentMajor = parseInt(currentAngularCliVersion.split('.')[0]);
    const targetMajor = parseInt(targetAngularVersion.split('.')[0]);

    if (currentMajor !== targetMajor) {
        return {
            needed: true,
            reason: `Angular CLI version mismatch (current: ${currentMajor}, target: ${targetMajor})`,
            suggestion: `Consider using npx @angular/cli@${targetAngularVersion} instead`
        };
    }

    return {
        needed: false,
        reason: 'Angular CLI version is compatible'
    };
}

/**
 * Fetch package data from npm registry with caching
 */
async function fetchPackageData(packageName) {
    const cacheKey = packageName;
    const cached = packageCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }
    
    try {
        const response = await axios.get(`${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}`, {
            timeout: 10000
        });
        
        const data = response.data;
        
        // Clean up old cache entries if cache is too large
        if (packageCache.size >= MAX_CACHE_SIZE) {
            const oldestKey = packageCache.keys().next().value;
            packageCache.delete(oldestKey);
        }
        
        packageCache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
    } catch (error) {
        console.error(chalk.gray(`Could not fetch package data for ${packageName}: ${error.message}`));
        return null;
    }
}

/**
 * Fetch specific version data from npm registry
 */
async function fetchPackageVersionData(packageName, version) {
    try {
        const response = await axios.get(`${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}/${version}`, {
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        return null;
    }
}

/**
 * Get peer dependencies for a specific package version
 */
export async function getPackagePeerDependencies(packageName, version) {
    const versionData = await fetchPackageVersionData(packageName, version);
    return versionData?.peerDependencies || {};
}

/**
 * Check if a specific library version is compatible with Angular version
 * Improved with better error handling and flexible pattern matching
 */
export async function isVersionCompatibleWithAngular(packageName, version, angularVersion) {
    const peerDeps = await getPackagePeerDependencies(packageName, version);
    
    // Check for Angular peer dependencies (check multiple possible keys)
    const angularDepKeys = ['@angular/core', '@angular/common', '@angular/platform-browser'];
    let angularDep = null;
    
    for (const key of angularDepKeys) {
        if (peerDeps[key]) {
            angularDep = peerDeps[key];
            break;
        }
    }
    
    if (!angularDep) {
        // No Angular peer dependency - likely compatible or not Angular-specific
        return { 
            compatible: true, 
            reason: 'No Angular peer dependency found',
            hasPeerDependency: false
        };
    }
    
    try {
        // Check if the Angular version satisfies the peer dependency using semver
        const isCompatible = semver.satisfies(angularVersion, angularDep);
        return {
            compatible: isCompatible,
            peerDependency: angularDep,
            hasPeerDependency: true,
            reason: isCompatible 
                ? `Angular ${angularVersion} satisfies ${angularDep}`
                : `Angular ${angularVersion} does not satisfy ${angularDep}`
        };
    } catch (error) {
        // If semver fails, use flexible pattern matching
        return checkLibraryCompatibility(angularDep, angularVersion);
    }
}

/**
 * Dynamically find a compatible version of a library for a given Angular version
 * Improved with better performance and smarter version selection
 */
export async function findCompatibleLibraryVersion(packageName, angularVersion, preferLatest = true) {
    const packageData = await fetchPackageData(packageName);
    
    if (!packageData) {
        return { version: 'latest', source: 'fallback', reason: 'Could not fetch package data' };
    }
    
    const angularMajor = parseInt(angularVersion.split('.')[0]);
    const versions = Object.keys(packageData.versions || {})
        .filter(v => !v.includes('rc') && !v.includes('beta') && !v.includes('alpha') && !v.includes('next'))
        .sort((a, b) => semver.rcompare(a, b)); // Newest first
    
    // For Angular-scoped packages, match major version (they follow Angular versioning)
    if (packageName.startsWith('@angular/')) {
        const matchingVersions = versions.filter(v => {
            const vMajor = parseInt(v.split('.')[0]);
            return vMajor === angularMajor;
        });
        
        if (matchingVersions.length > 0) {
            return { 
                version: `^${matchingVersions[0]}`, 
                source: 'dynamic', 
                reason: `Matched Angular major version ${angularMajor}`,
                matchType: 'angular-scope'
            };
        }
    }
    
    // For other popular Angular ecosystem packages that follow Angular versioning
    const angularEcosystemPackages = ['@ngrx/', '@ngxs/', '@ng-bootstrap/', '@angular-eslint/'];
    if (angularEcosystemPackages.some(prefix => packageName.startsWith(prefix))) {
        const matchingVersions = versions.filter(v => {
            const vMajor = parseInt(v.split('.')[0]);
            return vMajor === angularMajor;
        });
        
        if (matchingVersions.length > 0) {
            return { 
                version: `^${matchingVersions[0]}`, 
                source: 'dynamic', 
                reason: `Matched Angular ecosystem major version ${angularMajor}`,
                matchType: 'ecosystem'
            };
        }
    }
    
    // For other packages, check peer dependencies
    const compatibleVersions = [];
    
    // Intelligent version checking - check more versions for popular packages
    const maxVersionsToCheck = versions.length > 50 ? 30 : 20;
    const versionsToCheck = versions.slice(0, maxVersionsToCheck);
    
    for (const version of versionsToCheck) {
        const compatibility = await isVersionCompatibleWithAngular(packageName, version, angularVersion);
        
        if (compatibility.compatible) {
            compatibleVersions.push({
                version,
                peerDependency: compatibility.peerDependency,
                hasPeerDependency: compatibility.hasPeerDependency
            });
            
            // If we found a compatible version and prefer latest, return immediately
            if (preferLatest) {
                return {
                    version: `^${version}`,
                    source: 'dynamic',
                    reason: compatibility.reason,
                    peerDependency: compatibility.peerDependency,
                    matchType: 'peer-dependency'
                };
            }
        }
    }
    
    if (compatibleVersions.length > 0) {
        const selected = compatibleVersions[0];
        return {
            version: `^${selected.version}`,
            source: 'dynamic',
            reason: `Found ${compatibleVersions.length} compatible version(s)`,
            peerDependency: selected.peerDependency,
            matchType: 'peer-dependency'
        };
    }
    
    // No compatible version found, return latest with warning
    const latest = packageData['dist-tags']?.latest;
    return {
        version: latest ? `^${latest}` : 'latest',
        source: 'fallback',
        reason: 'No version with compatible Angular peer dependency found',
        warning: true,
        matchType: 'fallback'
    };
}

/**
 * Get compatible version for a library based on Angular version (async version)
 */
export async function getCompatibleLibraryVersionAsync(libraryName, angularVersion) {
    const result = await findCompatibleLibraryVersion(libraryName, angularVersion);
    return result.version;
}

/**
 * Get compatible version for a library based on Angular version (sync fallback)
 * @deprecated Use getCompatibleLibraryVersionAsync for accurate results
 * This function now has minimal hardcoded logic and relies on dynamic checks
 */
export function getCompatibleLibraryVersion(libraryName, angularVersion) {
    const angularMajor = angularVersion.split('.')[0];
    
    // For packages in the @angular scope, match the major version
    // This is a safe assumption for official Angular packages
    if (libraryName.startsWith('@angular/')) {
        return `^${angularMajor}.0.0`;
    }
    
    // For all other packages, use 'latest' and let dynamic resolution handle it
    // The async version (getCompatibleLibraryVersionAsync) should be preferred
    return 'latest';
}

/**
 * Resolve library versions for compatibility with Angular (async version)
 */
export async function resolveLibraryVersionsAsync(libraries, angularVersion) {
    const resolved = [];
    
    for (const lib of libraries) {
        const requestedVersion = lib.version || 'latest';
        
        if (requestedVersion === 'latest') {
            const result = await findCompatibleLibraryVersion(lib.name, angularVersion);
            
            resolved.push({
                ...lib,
                version: result.version,
                originalVersion: requestedVersion,
                adjusted: result.source === 'dynamic',
                source: result.source,
                reason: result.reason,
                warning: result.warning || false
            });
        } else {
            // Verify the specific version is compatible
            const compatibility = await isVersionCompatibleWithAngular(lib.name, requestedVersion.replace(/[\^~]/, ''), angularVersion);
            
            resolved.push({
                ...lib,
                adjusted: false,
                compatible: compatibility.compatible,
                reason: compatibility.reason,
                warning: !compatibility.compatible
            });
        }
    }
    
    return resolved;
}

/**
 * Resolve library versions for compatibility with Angular (sync fallback)
 */
export function resolveLibraryVersions(libraries, angularVersion) {
    return libraries.map(lib => {
        const requestedVersion = lib.version || 'latest';
        
        if (requestedVersion === 'latest') {
            const compatibleVersion = getCompatibleLibraryVersion(lib.name, angularVersion);
            return {
                ...lib,
                version: compatibleVersion,
                originalVersion: requestedVersion,
                adjusted: compatibleVersion !== 'latest'
            };
        }
        
        return {
            ...lib,
            adjusted: false
        };
    });
}

/**
 * Check if a library version is compatible with Angular version using semver
 * Uses dynamic pattern matching with no hardcoded logic
 */
export function checkLibraryCompatibility(peerDependency, angularVersion) {
    if (!peerDependency || peerDependency === 'No Angular peer dependency') {
        return { compatible: true, reason: 'No Angular peer dependency specified' };
    }

    try {
        // Use semver to check if Angular version satisfies the peer dependency
        const isCompatible = semver.satisfies(angularVersion, peerDependency);
        
        if (isCompatible) {
            return { 
                compatible: true, 
                reason: `Angular ${angularVersion} satisfies peer dependency '${peerDependency}'` 
            };
        } else {
            return { 
                compatible: false, 
                reason: `Angular ${angularVersion} does not satisfy peer dependency '${peerDependency}'` 
            };
        }
    } catch (error) {
        // Fallback to flexible pattern matching if semver fails (for complex ranges)
        const angularMajor = angularVersion.split('.')[0];
        const angularMinor = angularVersion.split('.')[1] || '0';
        
        // Generate dynamic patterns based on actual version
        const patterns = [
            `^${angularMajor}.`,      // Caret range
            `~${angularMajor}.`,      // Tilde range
            `>=${angularMajor}.`,     // Greater than or equal
            `${angularMajor}.x`,      // X-range
            `${angularMajor}.${angularMinor}.`, // Specific minor
            ` ${angularMajor}.`,      // With space
            `||.*${angularMajor}\.`  // In OR range
        ];

        // Check if any pattern matches
        const isCompatible = patterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            return regex.test(peerDependency);
        });

        if (isCompatible) {
            return { 
                compatible: true, 
                reason: `Peer dependency '${peerDependency}' appears compatible with Angular ${angularMajor}` 
            };
        } else {
            return { 
                compatible: false, 
                reason: `Peer dependency '${peerDependency}' may not support Angular ${angularMajor}` 
            };
        }
    }
}

/**
 * Get all compatible versions of a package for a given Angular version
 */
export async function getAllCompatibleVersions(packageName, angularVersion, maxResults = 10) {
    const packageData = await fetchPackageData(packageName);
    
    if (!packageData) {
        return [];
    }
    
    const versions = Object.keys(packageData.versions || {})
        .filter(v => !v.includes('rc') && !v.includes('beta') && !v.includes('alpha') && !v.includes('next'))
        .sort((a, b) => semver.rcompare(a, b));
    
    const compatibleVersions = [];
    
    for (const version of versions) {
        if (compatibleVersions.length >= maxResults) break;
        
        const compatibility = await isVersionCompatibleWithAngular(packageName, version, angularVersion);
        
        if (compatibility.compatible) {
            compatibleVersions.push({
                version,
                peerDependency: compatibility.peerDependency,
                reason: compatibility.reason
            });
        }
    }
    
    return compatibleVersions;
}
