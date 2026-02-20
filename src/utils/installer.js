import { execa } from 'execa';
import ora from 'ora';
import chalk from 'chalk';
import { printKeyValue, printObjectList } from './table-helper.js';
import { platform } from 'os';

/**
 * Install Node.js using winget (Windows)
 */
export async function installNodeWithWinget(version = 'LTS') {
    const spinner = ora('Installing Node.js with winget...').start();
    
    try {
        const packageId = version === 'LTS' ? 'OpenJS.NodeJS.LTS' : 'OpenJS.NodeJS';
        await execa('winget', ['install', packageId], { stdio: 'inherit' });
        
        spinner.succeed('Node.js installed successfully');
        return true;
    } catch (error) {
        spinner.fail('Failed to install Node.js');
        console.error(chalk.red(error.message));
        return false;
    }
}

/**
 * Get nvm installation instructions based on OS
 */
export function getNvmInstallInstructions() {
    const os = platform();

    switch (os) {
        case 'win32':
            return {
                os: 'Windows',
                download: 'https://github.com/coreybutler/nvm-windows/releases',
                steps: [
                    'Download nvm-setup.exe',
                    'Run the installer',
                    'Restart your terminal'
                ]
            };

        case 'darwin':
            return {
                os: 'macOS',
                repo: 'https://github.com/nvm-sh/nvm',

                install:
                    'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash',

                postInstall: [
                    'Restart terminal',
                    'If using zsh: source ~/.zshrc',
                    'If using bash: source ~/.bash_profile'
                ],

                steps: [
                    'Run the install command',
                    'Reload your shell configuration',
                    'Verify: nvm --version',
                    'Install Node: nvm install node'
                ]
            };

        default:
            return {
                os: 'Linux',
                repo: 'https://github.com/nvm-sh/nvm',

                install:
                    'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash',

                alternative:
                    'wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash',

                steps: [
                    'Run install command',
                    'Restart terminal or run: source ~/.bashrc',
                    'Verify: nvm --version',
                    'Install Node: nvm install node'
                ]
            };
    }
}

/**
 * Display nvm installation guide
 */
export function displayNvmInstallGuide() {
    const data = getNvmInstallInstructions();

    printKeyValue('📚 NVM Installation Guide', [
        ['OS', chalk.cyan(data.os)],
        ['Download/Repo', data.download ? chalk.blue(data.download) : (data.repo ? chalk.blue(data.repo) : '-')],
        ['Install', data.install ? chalk.green(data.install) : '-'],
        ['Alternative', data.alternative ? chalk.green(data.alternative) : '-']
    ]);

    if (Array.isArray(data.steps)) {
        const steps = data.steps.map((s, i) => ({ Step: `${i + 1}`, Instruction: s }));
        printObjectList('Steps', steps, ['Step', 'Instruction']);
    }

    if (Array.isArray(data.postInstall)) {
        const post = data.postInstall.map((s, i) => ({ Step: `${i + 1}`, Instruction: s }));
        printObjectList('Post-Install', post, ['Step', 'Instruction']);
    }

    // Benefits
    const benefits = [
        { Benefit: 'Manage multiple Node.js versions' },
        { Benefit: 'Switch instantly' },
        { Benefit: 'No sudo/admin required' },
        { Benefit: 'Per-project Node versions' }
    ];
    printObjectList('Why use NVM?', benefits, ['Benefit']);
}

/**
 * Install npm package globally
 */
export async function installGlobalPackage(packageName, version = 'latest') {
    const spinner = ora(`Installing ${packageName}@${version}...`).start();
    
    try {
        const packageSpec = version === 'latest' ? packageName : `${packageName}@${version}`;
        await execa('npm', ['install', '-g', packageSpec], { stdio: 'inherit' });
        
        spinner.succeed(`${packageName} installed successfully`);
        return true;
    } catch (error) {
        spinner.fail(`Failed to install ${packageName}`);
        console.error(chalk.red(error.message));
        return false;
    }
}

/**
 * Install npm packages in project
 */
export async function installPackages(packages, projectPath, dev = false) {
    const spinner = ora(`Installing ${packages.length} package(s)...`).start();
    
    try {
        const args = ['install'];
        if (dev) args.push('--save-dev');
        args.push(...packages);
        
        await execa('npm', args, { 
            cwd: projectPath
        });
        
        spinner.succeed('Packages installed successfully');
        return true;
    } catch (error) {
        spinner.warn('Failed with strict dependencies, retrying with --legacy-peer-deps...');
        
        // Retry with --legacy-peer-deps flag
        try {
            const args = ['install', '--legacy-peer-deps'];
            if (dev) args.push('--save-dev');
            args.push(...packages);
            
            await execa('npm', args, { 
                cwd: projectPath
            });
            
            spinner.succeed('Packages installed successfully with --legacy-peer-deps');
            console.log(chalk.yellow('⚠️  Note: Installed with --legacy-peer-deps flag due to peer dependency conflicts'));
            return true;
        } catch (retryError) {
            spinner.fail('Failed to install packages');
            console.error(chalk.red(retryError.message));
            console.log(chalk.yellow('\n💡 Tip: You can try installing manually with:'));
            console.log(chalk.cyan(`   cd ${projectPath}`));
            console.log(chalk.cyan(`   npm install ${packages.join(' ')} --force`));
            return false;
        }
    }
}

/**
 * Initialize npm project
 */
export async function initNpmProject(projectPath) {
    try {
        await execa('npm', ['init', '-y'], { 
            cwd: projectPath,
            stdio: 'inherit'
        });
        return true;
    } catch (error) {
        console.error(chalk.red('Failed to initialize npm project'));
        return false;
    }
}

/**
 * Run npm install in project
 */
export async function runNpmInstall(projectPath) {
    const spinner = ora('Installing dependencies...').start();
    
    try {
        await execa('npm', ['install'], { 
            cwd: projectPath
        });
        
        spinner.succeed('Dependencies installed successfully');
        return true;
    } catch (error) {
        spinner.warn('Failed with strict dependencies, retrying with --legacy-peer-deps...');
        
        // Retry with --legacy-peer-deps flag
        try {
            await execa('npm', ['install', '--legacy-peer-deps'], { 
                cwd: projectPath
            });
            
            spinner.succeed('Dependencies installed successfully with --legacy-peer-deps');
            console.log(chalk.yellow('⚠️  Note: Installed with --legacy-peer-deps flag due to peer dependency conflicts'));
            return true;
        } catch (retryError) {
            spinner.fail('Failed to install dependencies');
            console.error(chalk.red(retryError.message));
            console.log(chalk.yellow('\n💡 Tip: You can try installing manually with:'));
            console.log(chalk.cyan(`   cd ${projectPath}`));
            console.log(chalk.cyan(`   npm install --force`));
            return false;
        }
    }
}

/**
 * Install Angular CLI globally
 */
export async function installAngularCli(version = 'latest') {
    return installGlobalPackage('@angular/cli', version);
}

/**
 * Create Angular project using CLI
 */
export async function createAngularProject(projectName, angularVersion, options = {}) {
    const spinner = ora(`Creating Angular project: ${projectName}...`).start();
    
    try {
        const args = ['new', projectName];
        
        // Add options
        if (options.skipInstall) args.push('--skip-install');
        if (options.routing !== undefined) args.push(`--routing=${options.routing}`);
        if (options.style) args.push(`--style=${options.style}`);
        if (options.strict !== undefined) args.push(`--strict=${options.strict}`);
        if (options.standalone !== undefined) args.push(`--standalone=${options.standalone}`);
        
        const cliCommand = angularVersion ? `@angular/cli@${angularVersion}` : '@angular/cli';
        
        await execa('npx', [cliCommand, ...args], { 
            stdio: 'inherit'
        });
        
        spinner.succeed(`Angular project ${projectName} created successfully`);
        return true;
    } catch (error) {
        spinner.fail('Failed to create Angular project');
        console.error(chalk.red(error.message));
        return false;
    }
}
