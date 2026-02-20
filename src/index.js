import { Command } from 'commander';
import { runCli } from './runner.js';
import { listProfiles, loadProfile, deleteProfile, displayProfileInfo, exportProfile, importProfile, getProfileDetails } from './utils/profile-manager.js';
import { printObjectList } from './utils/table-helper.js';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
    .name('ng-init')
    .description('Angular project initializer with intelligent version management and automation')
    .version(packageJson.version);

// Main command - create new project
program
    .command('create', { isDefault: true })
    .alias('new')
    .description('Create a new Angular project with interactive setup')
    .action(() => {
        runCli();
    });

// Profile management commands
const profileCommand = program
    .command('profile')
    .description('Manage configuration profiles');

profileCommand
    .command('list')
    .description('List all saved profiles')
    .action(async () => {
        try {
            const profiles = await listProfiles();
            
            if (profiles.length === 0) {
                console.log(chalk.yellow('No saved profiles found.'));
                return;
            }

            const rows = [];
            for (const name of profiles) {
                const details = await getProfileDetails(name);
                rows.push({ Name: details.name, Angular: details.angularVersion || '-', Libraries: details.libraries || 0, Created: details.createdAt || '-' });
            }
            printObjectList('Saved Profiles', rows, ['Name', 'Angular', 'Libraries', 'Created']);
        } catch (error) {
            console.error(chalk.red('Error listing profiles:'), error.message);
        }
    });

profileCommand
    .command('show <name>')
    .description('Show details of a profile')
    .action(async (name) => {
        try {
            const profile = await loadProfile(name);
            
            if (!profile) {
                console.log(chalk.red(`Profile "${name}" not found.`));
                return;
            }

            displayProfileInfo(name, profile);
        } catch (error) {
            console.error(chalk.red('Error loading profile:'), error.message);
        }
    });

profileCommand
    .command('delete <name>')
    .description('Delete a profile')
    .action(async (name) => {
        try {
            await deleteProfile(name);
        } catch (error) {
            console.error(chalk.red('Error deleting profile:'), error.message);
        }
    });

profileCommand
    .command('export <name> <output>')
    .description('Export a profile to a file')
    .action(async (name, output) => {
        try {
            await exportProfile(name, output);
        } catch (error) {
            console.error(chalk.red('Error exporting profile:'), error.message);
        }
    });

profileCommand
    .command('import <file>')
    .description('Import a profile from a file')
    .action(async (file) => {
        try {
            await importProfile(file);
        } catch (error) {
            console.error(chalk.red('Error importing profile:'), error.message);
        }
    });

// Version check command
program
    .command('check')
    .description('Check system versions and compatibility')
    .action(async () => {
        try {
            const { displaySystemVersions } = await import('./utils/version-checker.js');
            await displaySystemVersions();
        } catch (error) {
            console.error(chalk.red('Error checking versions:'), error.message);
        }
    });

// Help command with examples
program
    .command('examples')
    .description('Show usage examples')
    .action(() => {
        console.log(chalk.bold.cyan('\n📚 Usage Examples:\n'));
        console.log(chalk.gray('━'.repeat(50)));
        console.log(chalk.white('Create new project (interactive):'));
        console.log(chalk.green('  $ ng-init') + chalk.gray(' or ') + chalk.green('ng-init create\n'));
        
        console.log(chalk.white('Check system versions:'));
        console.log(chalk.green('  $ ng-init check\n'));
        
        console.log(chalk.white('List saved profiles:'));
        console.log(chalk.green('  $ ng-init profile list\n'));
        
        console.log(chalk.white('Show profile details:'));
        console.log(chalk.green('  $ ng-init profile show my-profile\n'));
        
        console.log(chalk.white('Delete a profile:'));
        console.log(chalk.green('  $ ng-init profile delete my-profile\n'));
        
        console.log(chalk.white('Export a profile:'));
        console.log(chalk.green('  $ ng-init profile export my-profile ./profile.json\n'));
        
        console.log(chalk.white('Import a profile:'));
        console.log(chalk.green('  $ ng-init profile import ./profile.json\n'));
        
        console.log(chalk.gray('━'.repeat(50)) + '\n');
    });

program.parse(process.argv);

