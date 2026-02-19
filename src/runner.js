import { select, input, confirm, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import path from 'path';
import { displaySystemVersions, getNodeVersion, isNvmInstalled, switchNodeVersion, installNodeVersion, getInstalledNodeVersions } from './utils/version-checker.js';
import { getAngularVersions, getNodeRequirementsForAngular, getMajorVersions, getMinorVersionsForMajor, getPatchVersionsForMinor } from './utils/npm-search.js';
import { checkNodeCompatibility, displayCompatibilityStatus, findCompatibleVersions, getRecommendedNodeVersion, resolveLibraryVersionsAsync } from './utils/compatibility.js';
import { createAngularProject, installPackages, runNpmInstall, installNodeWithWinget, displayNvmInstallGuide } from './utils/installer.js';
import { interactiveLibrarySearch, simpleLibraryInput, askLibrarySearchPreference } from './utils/prompt-handler.js';
import { validateDirectoryName } from './utils/file-utils.js';
import { saveProfile, loadProfile, listProfiles, displayProfileInfo } from './utils/profile-manager.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

export async function runCli() {
    try {
        // Display welcome banner
        const text = `Angular Project Initialization Automation CLI v${packageJson.version}`;
        const width = 60;

        const line = "═".repeat(width);
        const space = width - text.length;

        console.log(chalk.cyan.bold(`
╔${line}╗
║${" ".repeat(space / 2)}${text}${" ".repeat(Math.ceil(space / 2))}║
╚${line}╝
`));
        // Step 1: Display system versions
        const systemVersions = await displaySystemVersions();

        // Step 2: Check for saved profiles
        const useProfile = await confirm({
            message: 'Would you like to use a saved profile?',
            default: false
        });

        let config = {};

        if (useProfile) {
            const profiles = await listProfiles();

            if (profiles.length === 0) {
                console.log(chalk.yellow('No saved profiles found. Continuing with manual setup...\n'));
            } else {
                const selectedProfile = await select({
                    message: 'Select a profile:',
                    choices: profiles.map(p => ({ name: p, value: p }))
                });

                const profile = await loadProfile(selectedProfile);
                displayProfileInfo(selectedProfile, profile);

                const confirmProfile = await confirm({
                    message: 'Use this profile?',
                    default: true
                });

                if (confirmProfile) {
                    config = profile;
                }
            }
        }

        // Step 3: Select Angular version (if not from profile)
        if (!config.angularVersion) {
            console.log(chalk.bold.cyan('\n📦 Fetching Angular versions...\n'));
            const angularVersions = await getAngularVersions();

            if (angularVersions.versions.length === 0) {
                console.log(chalk.red('Failed to fetch Angular versions. Please check your internet connection.'));
                process.exit(1);
            }

            // Step 3.1: Select Major Version
            const majorVersions = getMajorVersions(angularVersions.versions);
            const majorChoices = majorVersions.map(major => {
                const label = `Angular ${major}`;
                // Check if this major version contains the latest
                const isLatest = angularVersions.latest && angularVersions.latest.startsWith(`${major}.`);
                return {
                    name: isLatest ? `${label} (latest)` : label,
                    value: major
                };
            });

            const majorVersion = await select({
                message: 'Select Angular major version:',
                choices: majorChoices,
                pageSize: 15
            });

            // Step 3.2: Select Minor Version
            const minorVersions = getMinorVersionsForMajor(angularVersions.versions, majorVersion);
            const minorChoices = minorVersions.map(minor => ({
                name: `v${minor}.x`,
                value: minor
            }));

            const minorVersion = await select({
                message: `Select Angular ${majorVersion} minor version:`,
                choices: minorChoices,
                pageSize: 15
            });

            // Step 3.3: Select Patch Version
            const patchVersions = getPatchVersionsForMinor(angularVersions.versions, minorVersion);
            const patchChoices = patchVersions.map(patch => {
                let label = `v${patch}`;
                if (patch === angularVersions.latest) label += ' (latest)';
                if (patch === angularVersions.lts) label += ' (LTS)';
                return { name: label, value: patch };
            });

            const patchVersion = await select({
                message: `Select Angular ${minorVersion} patch version:`,
                choices: patchChoices,
                pageSize: 15
            });

            config.angularVersion = patchVersion;
        }

        console.log(chalk.green(`\n✓ Selected Angular version: ${config.angularVersion}\n`));

        // Step 4: Check Node.js compatibility
        const nodeRequirement = await getNodeRequirementsForAngular(config.angularVersion);
        const currentNodeVersion = await getNodeVersion();
        const compatibility = checkNodeCompatibility(currentNodeVersion, nodeRequirement);

        displayCompatibilityStatus(compatibility);

        // Step 5: Handle Node version incompatibility
        if (!compatibility.compatible) {
            console.log(chalk.yellow('⚠️  Node.js version incompatibility detected!\n'));

            const nvmInstalled = await isNvmInstalled();

            if (nvmInstalled) {
                console.log(chalk.cyan('✓ nvm detected on your system\n'));

                const installedVersions = await getInstalledNodeVersions();
                const compatibleInstalled = findCompatibleVersions(installedVersions, nodeRequirement);

                if (compatibleInstalled.length > 0) {
                    console.log(chalk.green(`Found ${compatibleInstalled.length} compatible Node version(s) installed:\n`));

                    const selectedVersion = await select({
                        message: 'Select Node version to switch to:',
                        choices: compatibleInstalled.map(v => ({ name: `v${v}`, value: v }))
                    });

                    console.log(chalk.cyan(`\nSwitching to Node.js v${selectedVersion}...\n`));
                    const switched = await switchNodeVersion(selectedVersion);

                    if (!switched) {
                        console.log(chalk.red('Failed to switch Node version. Please try manually.'));
                        process.exit(1);
                    }

                    console.log(chalk.green('✓ Node version switched successfully\n'));
                } else {
                    console.log(chalk.yellow('No compatible Node versions installed.\n'));
                    const recommendedVersion = getRecommendedNodeVersion(nodeRequirement);

                    const shouldInstall = await confirm({
                        message: `Install Node.js v${recommendedVersion}?`,
                        default: true
                    });

                    if (shouldInstall) {
                        const installed = await installNodeVersion(recommendedVersion);

                        if (!installed) {
                            console.log(chalk.red('Failed to install Node version.'));
                            process.exit(1);
                        }

                        console.log(chalk.green('✓ Node.js installed successfully\n'));
                        await switchNodeVersion(recommendedVersion);
                    } else {
                        console.log(chalk.red('Cannot proceed without compatible Node.js version.'));
                        process.exit(1);
                    }
                }
            } else {
                console.log(chalk.yellow('⚠️  nvm is not installed on your system\n'));

                const installMethod = await select({
                    message: 'How would you like to proceed?',
                    choices: [
                        { name: 'Install nvm (Recommended)', value: 'nvm' },
                        { name: 'Install Node.js directly (Windows only)', value: 'direct' },
                        { name: 'Exit and install manually', value: 'exit' }
                    ]
                });

                if (installMethod === 'nvm') {
                    displayNvmInstallGuide();
                    console.log(chalk.yellow('\nPlease install nvm and run this CLI again.\n'));
                    process.exit(0);
                } else if (installMethod === 'direct') {
                    if (process.platform !== 'win32') {
                        console.log(chalk.red('Direct installation is only supported on Windows.'));
                        process.exit(1);
                    }

                    const installed = await installNodeWithWinget('LTS');

                    if (!installed) {
                        console.log(chalk.red('Failed to install Node.js. Please install manually.'));
                        process.exit(1);
                    }

                    console.log(chalk.yellow('\nPlease restart your terminal and run this CLI again.\n'));
                    process.exit(0);
                } else {
                    console.log(chalk.yellow('Exiting. Please install a compatible Node.js version manually.\n'));
                    process.exit(0);
                }
            }
        }

        // Step 6: Project configuration
        if (!config.projectName) {
            config.projectName = await input({
                message: 'Enter project name:',
                validate: (value) => {
                    if (!value) return 'Project name is required';
                    const validation = validateDirectoryName(value);
                    return validation === true ? true : validation;
                }
            });
        }

        // Step 7: Project location
        if (!config.location) {
            const location = await select({
                message: 'Where would you like to create the project?',
                choices: [
                    { name: 'Current directory', value: 'current' },
                    { name: 'Specify custom directory', value: 'custom' }
                ]
            });

            if (location === 'custom') {
                config.location = await input({
                    message: 'Enter directory path:',
                    default: process.cwd()
                });
            } else {
                config.location = process.cwd();
            }
        }

        const projectPath = path.join(config.location, config.projectName);

        // Step 8: Project configuration (if not from profile)
        if (!config.options) {
            const routing = await confirm({
                message: 'Enable routing?',
                default: true
            });

            const style = await select({
                message: 'Select stylesheet format:',
                choices: [
                    { name: 'css', value: 'css' },
                    { name: 'scss', value: 'scss' },
                    { name: 'sass', value: 'sass' },
                    { name: 'less', value: 'less' }
                ]
            });

            const strict = await confirm({
                message: 'Enable strict mode?',
                default: true
            });

            const standalone = await confirm({
                message: 'Use standalone components?',
                default: false
            });

            config.options = { routing, style, strict, standalone };
        }

        // Step 9: Library selection (if not from profile)
        if (!config.libraries) {
            const libraryMethod = await askLibrarySearchPreference();
            config.libraries = [];

            if (libraryMethod === 'interactive') {
                config.libraries = await interactiveLibrarySearch(config.angularVersion);
            } else if (libraryMethod === 'manual') {
                config.libraries = await simpleLibraryInput(config.angularVersion);
            }
            // Note: Library bundles feature has been disabled
        }

        // Step 10: Additional features (disabled)
        // Note: Additional features (git, structure, docs, linting) have been disabled
        config.features = [];

        // Step 11: Save profile option
        const shouldSaveProfile = await confirm({
            message: 'Save this configuration as a profile?',
            default: false
        });

        if (shouldSaveProfile) {
            const profileName = await input({
                message: 'Enter profile name:',
                validate: (value) => value ? true : 'Profile name is required'
            });

            await saveProfile(profileName, config);
        }

        // Step 12: Confirm and create project
        console.log(chalk.bold.cyan('\n📋 Project Configuration Summary\n'));
        console.log(chalk.gray('━'.repeat(50)));
        console.log(chalk.white('Project Name:     ') + chalk.green(config.projectName));
        console.log(chalk.white('Location:         ') + chalk.cyan(projectPath));
        console.log(chalk.white('Angular Version:  ') + chalk.green(config.angularVersion));
        console.log(chalk.white('Style:            ') + chalk.cyan(config.options.style));
        console.log(chalk.white('Routing:          ') + chalk.cyan(config.options.routing ? 'Yes' : 'No'));
        console.log(chalk.white('Strict Mode:      ') + chalk.cyan(config.options.strict ? 'Yes' : 'No'));
        console.log(chalk.white('Standalone:       ') + chalk.cyan(config.options.standalone ? 'Yes' : 'No'));
        console.log(chalk.white('Libraries:        ') + chalk.cyan(config.libraries.length));
        console.log(chalk.gray('━'.repeat(50)) + '\n');

        const shouldCreate = await confirm({
            message: 'Create project with this configuration?',
            default: true
        });

        if (!shouldCreate) {
            console.log(chalk.yellow('Project creation cancelled.\n'));
            process.exit(0);
        }

        // Step 13: Create Angular project
        console.log(chalk.bold.cyan('\n🚀 Creating Angular project...\n'));

        const createOptions = {
            ...config.options,
            skipInstall: true
        };

        const created = await createAngularProject(config.projectName, config.angularVersion, createOptions);

        if (!created) {
            console.log(chalk.red('Failed to create Angular project.'));
            process.exit(1);
        }

        // Step 14: Install libraries
        if (config.libraries.length > 0) {
            console.log(chalk.bold.cyan('\n📦 Resolving library versions...\n'));

            // Resolve library versions dynamically for compatibility with Angular version
            const resolvedLibraries = await resolveLibraryVersionsAsync(config.libraries, config.angularVersion);

            // Show adjusted versions if any
            const adjusted = resolvedLibraries.filter(lib => lib.adjusted);
            if (adjusted.length > 0) {
                console.log(chalk.green('✓ Dynamically resolved compatible library versions:\n'));
                adjusted.forEach(lib => {
                    console.log(chalk.gray(`   ${lib.name}: ${lib.originalVersion} → ${lib.version}`));
                    if (lib.reason) {
                        console.log(chalk.gray(`     └─ ${lib.reason}`));
                    }
                });
                console.log('');
            }

            // Show warnings for potentially incompatible libraries
            const warnings = resolvedLibraries.filter(lib => lib.warning);
            if (warnings.length > 0) {
                console.log(chalk.yellow('⚠️  Potential compatibility warnings:\n'));
                warnings.forEach(lib => {
                    console.log(chalk.yellow(`   ${lib.name}@${lib.version}`));
                    if (lib.reason) {
                        console.log(chalk.gray(`     └─ ${lib.reason}`));
                    }
                });
                console.log('');
            }

            // Separate production and dev packages
            const prodLibraries = resolvedLibraries.filter(lib => !lib.isDev);
            const devLibraries = resolvedLibraries.filter(lib => lib.isDev);

            // Install production packages
            if (prodLibraries.length > 0) {
                console.log(chalk.bold.cyan('📦 Installing production libraries...\n'));
                const prodSpecs = prodLibraries.map(lib =>
                    lib.version === 'latest' ? lib.name : `${lib.name}@${lib.version}`
                );
                await installPackages(prodSpecs, projectPath);
            }

            // Install dev packages
            if (devLibraries.length > 0) {
                console.log(chalk.bold.cyan('📦 Installing dev libraries...\n'));
                const devSpecs = devLibraries.map(lib =>
                    lib.version === 'latest' ? lib.name : `${lib.name}@${lib.version}`
                );
                await installPackages(devSpecs, projectPath, true);
            }
        }

        // Step 15: Run npm install
        console.log(chalk.bold.cyan('\n📥 Installing dependencies...\n'));
        await runNpmInstall(projectPath);

        // Note: Additional features (project structure, git, docs, eslint, husky) have been disabled

        // Step 22: Display success message
        console.log(chalk.bold.green('\n✅ Project created successfully! 🎉\n'));
        console.log(chalk.bold.cyan('📊 Next Steps:\n'));
        console.log(chalk.gray('━'.repeat(50)));
        console.log(chalk.white('1. ') + chalk.cyan(`cd ${config.projectName}`));
        console.log(chalk.white('2. ') + chalk.cyan('ng serve'));
        console.log(chalk.white('3. ') + chalk.cyan('Open http://localhost:4200 in your browser'));
        console.log(chalk.gray('━'.repeat(50)));

        console.log(chalk.bold.cyan('\n💡 Useful Commands:\n'));
        console.log(chalk.gray('  ng generate component <name>    ') + chalk.white('Create a component'));
        console.log(chalk.gray('  ng generate service <name>      ') + chalk.white('Create a service'));
        console.log(chalk.gray('  ng build                        ') + chalk.white('Build for production'));
        console.log(chalk.gray('  ng test                         ') + chalk.white('Run unit tests'));
        console.log(chalk.gray('  ng help                         ') + chalk.white('Get more help\n'));

        console.log(chalk.bold.green('Happy coding! 🚀\n'));

    } catch (err) {
        console.error(chalk.red('\n❌ Error:'), err.message);
        process.exit(1);
    }
}