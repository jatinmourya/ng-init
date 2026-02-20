import { execa } from 'execa';
import chalk from 'chalk';
import semver from 'semver';
import { printObjectList } from './table-helper.js';

/**
 * Get the current Node.js version
 */
export async function getNodeVersion() {
    try {
        const { stdout } = await execa('node', ['--version']);
        return stdout.trim().replace('v', '');
    } catch (error) {
        return null;
    }
}

/**
 * Get the current npm version
 */
export async function getNpmVersion() {
    try {
        const { stdout } = await execa('npm', ['--version']);
        return stdout.trim();
    } catch (error) {
        return null;
    }
}

/**
 * Get the current nvm version
 */
export async function getNvmVersion() {
    try {
        const { stdout } = await execa('nvm', ['--version'], { shell: true });
        return stdout.trim();
    } catch (error) {
        return null;
    }
}

/**
 * Check if nvm is installed
 */
export async function isNvmInstalled() {
    const version = await getNvmVersion();
    return version !== null;
}

/**
 * Get the current Angular CLI version
 */
export async function getAngularCliVersion() {
    try {
        const { stdout } = await execa('ng', ['--version'], { shell: true });
        return stdout.trim() || null;
    } catch (error) {
        return null;
    }
}

/**
 * Display all system versions
 */
export async function displaySystemVersions() {
    // console.log(chalk.bold.cyan('\n🔍 System Environment Check\n'));

    const nodeVersion = await getNodeVersion();
    const npmVersion = await getNpmVersion();
    const nvmVersion = await getNvmVersion();
    const ngRaw = await getAngularCliVersion();

    // Try to extract a semantic version for Angular CLI from the raw output
    let ngVersion = null;
    if (ngRaw) {
        const m = ngRaw.match(/(\d+\.\d+\.\d+)/);
        ngVersion = m ? m[1] : (ngRaw.split('\n')[0] || null);
    }

    const tableData = [
        { Tool: "Node.js", Version: nodeVersion ? `${nodeVersion}` : "Not installed" },
        { Tool: "npm", Version: npmVersion ? `${npmVersion}` : "Not installed" },
        { Tool: "nvm", Version: nvmVersion ? `${nvmVersion}` : "Not installed" },
        { Tool: "Angular CLI", Version: ngVersion ? `${ngVersion}` : "Not installed" }
    ];

    // Use table-helper to render the versions table (consistent cli-table3 usage centralized)
    try {
        const rows = tableData.map(r => ({ Tool: r.Tool, Version: r.Version }));
        printObjectList('🔍 System Environment Check', rows, ['Tool', 'Version']);
    } catch (err) {
        // fallback to console.table if anything unexpected happens
        console.table(tableData);
    }

    return {
        node: nodeVersion,
        npm: npmVersion,
        nvm: nvmVersion,
        angularCli: ngVersion
    };
}

/**
 * Get available Node versions from nvm
 */
export async function getAvailableNodeVersions() {
    try {
        const { stdout } = await execa('nvm', ['list', 'available'], { shell: true });
        const versions = [];
        const lines = stdout.split('\n');
        
        for (const line of lines) {
            const match = line.match(/(\d+\.\d+\.\d+)/);
            if (match) {
                versions.push(match[1]);
            }
        }
        
        return versions;
    } catch (error) {
        return [];
    }
}

/**
 * Get installed Node versions from nvm
 */
export async function getInstalledNodeVersions() {
    try {
        const { stdout } = await execa('nvm', ['list'], { shell: true });
        const versions = [];
        const lines = stdout.split('\n');
        
        for (const line of lines) {
            const match = line.match(/(\d+\.\d+\.\d+)/);
            if (match) {
                versions.push(match[1]);
            }
        }
        
        return versions;
    } catch (error) {
        return [];
    }
}

/**
 * Switch Node version using nvm
 */
export async function switchNodeVersion(version) {
    try {
        await execa('nvm', ['use', version], { shell: true, stdio: 'inherit' });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Install Node version using nvm
 */
export async function installNodeVersion(version) {
    try {
        await execa('nvm', ['install', version], { shell: true, stdio: 'inherit' });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Compare two semantic versions
 */
export function compareVersions(v1, v2) {
    return semver.compare(v1, v2);
}

/**
 * Check if version satisfies range
 */
export function satisfiesVersion(version, range) {
    return semver.satisfies(version, range);
}
