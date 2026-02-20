import { search, select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { searchNpmPackages, getEnhancedPackageInfo, formatDownloads, getPackageVersions, getMajorVersions, getMinorVersionsForMajor, getPatchVersionsForMinor, getPackagePeerDependencies, findCompatiblePackageVersions } from './npm-search.js';
import { checkLibraryCompatibility, isVersionCompatibleWithAngular, getAllCompatibleVersions } from './compatibility.js';
import { printObjectList, printKeyValue } from './table-helper.js';

/**
 * Library tracker to prevent duplicate selections
 */
class LibraryTracker {
    constructor() {
        this.selectedLibraries = new Map(); // Map of libraryName -> {name, version, description}
    }

    add(library) {
        this.selectedLibraries.set(library.name, library);
    }

    remove(libraryName) {
        this.selectedLibraries.delete(libraryName);
    }

    has(libraryName) {
        return this.selectedLibraries.has(libraryName);
    }

    getAll() {
        return Array.from(this.selectedLibraries.values());
    }

    size() {
        return this.selectedLibraries.size;
    }

    clear() {
        this.selectedLibraries.clear();
    }

    displaySelected() {
        if (this.selectedLibraries.size === 0) {
            console.log(chalk.gray('  No libraries selected yet.\n'));
            return;
        }
        const libs = this.getAll().map(lib => ({ Library: lib.name, Version: lib.version, Description: lib.description ? lib.description.substring(0, 70) : '' }));
        printObjectList('📦 Currently Selected Libraries', libs, ['Library', 'Version', 'Description']);
    }
}

/**
 * Interactive library search with autocomplete and duplicate prevention
 */
export async function interactiveLibrarySearch(angularVersion = null) {
    const tracker = new LibraryTracker();
    let continueSearching = true;

    console.log(chalk.bold.cyan('\n📦 Interactive Library Search\n'));
    if (angularVersion) {
        console.log(chalk.gray(`Angular version: ${angularVersion} (compatibility will be checked)\n`));
    }
    console.log(chalk.gray('Type to search npm packages. Press Enter to select.\n'));

    while (continueSearching) {
        try {
            // Show currently selected libraries if any
            if (tracker.size() > 0) {
                tracker.displaySelected();
            }

            const packageName = await search({
                message: 'Search for a library:',
                source: async (input, { signal }) => {
                    if (!input || input.length < 2) {
                        return [];
                    }

                    const results = await searchNpmPackages(input, 15);
                    
                    // Filter out already selected libraries
                    const availableResults = results.filter(pkg => !tracker.has(pkg.name));
                    
                    if (availableResults.length === 0 && results.length > 0) {
                        return [{
                            name: chalk.yellow('All matching libraries have already been selected'),
                            value: null,
                            disabled: true
                        }];
                    }
                    
                    return availableResults.map(pkg => ({
                        name: formatPackageChoice(pkg),
                        value: pkg.name,
                        description: pkg.description
                    }));
                },
                pageSize: 10
            });

            if (!packageName) {
                // User may have cancelled or selected a disabled option
                continueSearching = await confirm({
                    message: 'Continue searching for libraries?',
                    default: false
                });
                continue;
            }

            // Get detailed info
            const info = await getEnhancedPackageInfo(packageName);
            
            if (info) {
                printKeyValue('\nSelected Package', [
                    ['Name', chalk.green(info.name)],
                    ['Description', chalk.gray(info.description)],
                    ['Latest version', chalk.cyan(info.latestVersion)],
                    ['Weekly downloads', chalk.gray(formatDownloads(info.weeklyDownloads))]
                ]);

                // Ask for version selection method
                const versionMethod = await select({
                    message: 'How would you like to select the version?',
                    choices: [
                        { name: `Use latest (${info.latestVersion})`, value: 'latest' },
                        { name: 'Choose specific version (major.minor.patch)', value: 'specific' },
                        { name: 'Enter version manually', value: 'manual' }
                    ],
                    default: 'latest'
                });

                let version = info.latestVersion;
                
                if (versionMethod === 'specific') {
                    // Fetch all versions for the package
                    console.log(chalk.cyan(`\n📦 Fetching versions for ${info.name}...\n`));
                    const packageVersions = await getPackageVersions(info.name);

                    if (packageVersions.versions.length === 0) {
                        console.log(chalk.yellow('Could not fetch versions. Using latest version.'));
                        version = info.latestVersion;
                    } else {
                        // Step 1: Select Major Version
                        const majorVersions = getMajorVersions(packageVersions.versions);
                        const majorChoices = majorVersions.map(major => {
                            const label = `${info.name} ${major}`;
                            const isLatest = packageVersions.latest && packageVersions.latest.startsWith(`${major}.`);
                            return { 
                                name: isLatest ? `${label} (latest)` : label, 
                                value: major 
                            };
                        });

                        const majorVersion = await select({
                            message: `Select ${info.name} major version:`,
                            choices: majorChoices,
                            pageSize: 15
                        });

                        // Step 2: Select Minor Version
                        const minorVersions = getMinorVersionsForMajor(packageVersions.versions, majorVersion);
                        const minorChoices = minorVersions.map(minor => ({
                            name: `v${minor}.x`,
                            value: minor
                        }));

                        const minorVersion = await select({
                            message: `Select ${info.name} ${majorVersion} minor version:`,
                            choices: minorChoices,
                            pageSize: 15
                        });

                        // Step 3: Select Patch Version
                        const patchVersions = getPatchVersionsForMinor(packageVersions.versions, minorVersion);
                        const patchChoices = patchVersions.map(patch => {
                            let label = `v${patch}`;
                            if (patch === packageVersions.latest) label += ' (latest)';
                            if (patch === packageVersions.lts) label += ' (LTS)';
                            return { name: label, value: patch };
                        });

                        const patchVersion = await select({
                            message: `Select ${info.name} ${minorVersion} patch version:`,
                            choices: patchChoices,
                            pageSize: 15
                        });

                        version = patchVersion;
                    }
                } else if (versionMethod === 'manual') {
                    version = await input({
                        message: 'Enter version:',
                        default: info.latestVersion,
                        validate: (inputValue) => {
                            return inputValue ? true : 'Version is required';
                        }
                    });
                }

                // Check compatibility with Angular version if provided
                if (angularVersion && version !== 'latest') {
                    console.log(chalk.cyan(`\n🔍 Checking compatibility with Angular ${angularVersion}...\n`));
                    
                    // Use dynamic compatibility check
                    const compatibility = await isVersionCompatibleWithAngular(info.name, version, angularVersion);
                    
                    if (compatibility.compatible) {
                        console.log(chalk.green(`✓ ${info.name}@${version} is compatible with Angular ${angularVersion}`));
                        if (compatibility.peerDependency) {
                            console.log(chalk.gray(`  Peer dependency: ${compatibility.peerDependency}\n`));
                        }
                    } else {
                        console.log(chalk.red(`✗ ${info.name}@${version} may not be compatible with Angular ${angularVersion}`));
                        console.log(chalk.gray(`  ${compatibility.reason}\n`));
                        
                        // Suggest compatible versions
                        const wantSuggestions = await confirm({
                            message: 'Would you like to see compatible versions?',
                            default: true
                        });

                        if (wantSuggestions) {
                            console.log(chalk.cyan(`\n🔍 Dynamically searching for compatible versions...\n`));
                            // Use dynamic compatibility search
                            const compatibleVersions = await getAllCompatibleVersions(info.name, angularVersion, 10);
                            
                            if (compatibleVersions.length > 0) {
                                const versionChoices = compatibleVersions.map(cv => ({
                                    name: `${cv.version}${cv.peerDependency ? ` (peer: ${cv.peerDependency})` : ''}`,
                                    value: cv.version
                                }));
                                
                                versionChoices.push({ name: 'Keep selected version anyway', value: version });

                                version = await select({
                                    message: 'Select a compatible version:',
                                    choices: versionChoices,
                                    pageSize: 12
                                });
                            } else {
                                console.log(chalk.yellow('No compatible versions found automatically.'));
                                const keepVersion = await confirm({
                                    message: 'Continue with the selected version anyway?',
                                    default: false
                                });

                                if (!keepVersion) {
                                    console.log(chalk.yellow('Skipping this library.\n'));
                                    continueSearching = await confirm({
                                        message: 'Search for another library?',
                                        default: true
                                    });
                                    continue;
                                }
                            }
                        }
                    }
                }

                // Add to tracker
                const library = {
                    name: info.name,
                    version: version,
                    description: info.description
                };
                tracker.add(library);

                console.log(chalk.green(`✓ Added ${info.name}@${version} to installation queue\n`));
            }

            // Ask if user wants to add more or manage selections
            const nextAction = await select({
                message: 'What would you like to do next?',
                choices: [
                    { name: 'Add another library', value: 'add' },
                    { name: 'Remove a library', value: 'remove', disabled: tracker.size() === 0 },
                    { name: 'Finish library selection', value: 'finish' }
                ],
                default: 'add'
            });

            if (nextAction === 'remove') {
                const libraryChoices = tracker.getAll().map(lib => ({
                    name: `${lib.name}@${lib.version}`,
                    value: lib.name
                }));

                const toRemove = await select({
                    message: 'Select library to remove:',
                    choices: libraryChoices
                });

                tracker.remove(toRemove);
                console.log(chalk.yellow(`\n✓ Removed ${toRemove}\n`));
                continueSearching = true;
            } else if (nextAction === 'finish') {
                continueSearching = false;
            } else {
                continueSearching = true;
            }

        } catch (error) {
            console.error(chalk.red('Error during library search:', error.message));
            continueSearching = false;
        }
    }

    return tracker.getAll();
}

/**
 * Format package choice for display
 */
function formatPackageChoice(pkg) {
    const downloads = formatDownloads(pkg.weeklyDownloads || 0);
    const verified = pkg.verified ? ' ✓' : '';
    const desc = pkg.description.substring(0, 50) + (pkg.description.length > 50 ? '...' : '');
    
    return `${pkg.name}${verified} - ${desc} (v${pkg.version}, ⬇ ${downloads}/week)`;
}

/**
 * Simple library input (no autocomplete) with duplicate prevention
 */
export async function simpleLibraryInput(angularVersion = null) {
    const tracker = new LibraryTracker();
    let continueAdding = true;

    console.log(chalk.bold.cyan('\n📦 Add Libraries\n'));
    if (angularVersion) {
        console.log(chalk.gray(`Angular version: ${angularVersion} (compatibility will be checked)\n`));
    }

    while (continueAdding) {
        // Show currently selected libraries if any
        if (tracker.size() > 0) {
            tracker.displaySelected();
        }

        const library = await input({
            message: 'Enter library name (or press Enter to skip):',
            validate: async (inputValue) => {
                if (!inputValue) return true;
                
                // Basic validation
                if (!inputValue.match(/^[@a-z0-9-~][a-z0-9-._~]*$/)) {
                    return 'Invalid package name format';
                }
                
                // Check for duplicates
                if (tracker.has(inputValue)) {
                    return `${inputValue} has already been selected`;
                }
                
                return true;
            }
        });

        if (!library) {
            break;
        }

        const version = await input({
            message: `Enter version for ${library} (or 'latest'):`,
            default: 'latest'
        });

        // Check compatibility with Angular version if provided
        if (angularVersion && version !== 'latest') {
            console.log(chalk.cyan(`\n🔍 Checking compatibility with Angular ${angularVersion}...\n`));
            
            // Use dynamic compatibility check
            const compatibility = await isVersionCompatibleWithAngular(library, version, angularVersion);
            
            if (compatibility.compatible) {
                console.log(chalk.green(`✓ ${library}@${version} is compatible with Angular ${angularVersion}`));
                if (compatibility.peerDependency) {
                    console.log(chalk.gray(`  Peer dependency: ${compatibility.peerDependency}\n`));
                }
            } else {
                console.log(chalk.red(`✗ ${library}@${version} may not be compatible with Angular ${angularVersion}`));
                console.log(chalk.gray(`  ${compatibility.reason}\n`));
                console.log(chalk.yellow('⚠️  This may cause installation issues. Consider using a different version.\n'));
            }
        }

        tracker.add({
            name: library,
            version: version
        });

        console.log(chalk.green(`✓ Added ${library}@${version}\n`));

        const nextAction = await select({
            message: 'What would you like to do next?',
            choices: [
                { name: 'Add another library', value: 'add' },
                { name: 'Remove a library', value: 'remove', disabled: tracker.size() === 0 },
                { name: 'Finish library selection', value: 'finish' }
            ],
            default: 'add'
        });

        if (nextAction === 'remove') {
            const libraryChoices = tracker.getAll().map(lib => ({
                name: `${lib.name}@${lib.version}`,
                value: lib.name
            }));

            const toRemove = await select({
                message: 'Select library to remove:',
                choices: libraryChoices
            });

            tracker.remove(toRemove);
            console.log(chalk.yellow(`\n✓ Removed ${toRemove}\n`));
            continueAdding = true;
        } else if (nextAction === 'finish') {
            continueAdding = false;
        } 
    }

    return tracker.getAll();
}

/**
 * Ask user for library search preference
 */
export async function askLibrarySearchPreference() {
    const method = await select({
        message: 'How would you like to add libraries?',
        choices: [
            { name: 'Interactive search with autocomplete (Recommended)', value: 'interactive' },
            { name: 'Manual entry', value: 'manual' },
            { name: 'Skip for now', value: 'skip' }
        ],
        default: 'interactive'
    });

    return method;
}
