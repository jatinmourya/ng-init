import { Command } from 'commander';
import colors from './utils/colors.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ═══════════════════════════════════════════════════════════════════════
//  Package metadata (read once at module load)
// ═══════════════════════════════════════════════════════════════════════

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8'),
);

// ═══════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Wrap an async commander action with consistent error handling.
 *
 * Every subcommand had an identical try/catch that logged
 * `chalk.red('Error <verb> profile:')` — this removes that duplication
 * and guarantees a non-zero exit code on failure.
 */
function action(fn) {
  return async (...args) => {
    try {
      await fn(...args);
      } catch (err) {
      console.error(colors.error('Error:'), err.message);
      process.exitCode = 1;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  CLI Definition
// ═══════════════════════════════════════════════════════════════════════

const program = new Command();

program
  .name('ng-init')
  .description('Angular project initializer with intelligent version management and automation')
  .version(version);

// ── Default command: create ─────────────────────────────────────────

program
  .command('create', { isDefault: true })
  .alias('new')
  .description('Create a new Angular project with interactive setup')
  .action(action(async () => {
    const { runCli } = await import('./runner.js');
    await runCli();
  }));

// ── Profile management ─────────────────────────────────────────────

const profile = program
  .command('profile')
  .description('Manage configuration profiles');

profile
  .command('list')
  .description('List all saved profiles')
  .action(action(async () => {
    const { listProfiles, getProfileDetails } = await import('./utils/profile-manager.js');
    const { printObjectList } = await import('./utils/table-helper.js');

    const names = await listProfiles();

    if (names.length === 0) {
      console.log(colors.warning('No saved profiles found.'));
      return;
    }

    const rows = await Promise.all(
      names.map(async name => {
        const d = await getProfileDetails(name);
        return {
          Name: d.name,
          Angular: d.angularVersion || '-',
          Libraries: d.libraries ?? 0,
          Created: d.createdAt || '-',
        };
      }),
    );

    printObjectList('Saved Profiles', rows, ['Name', 'Angular', 'Libraries', 'Created']);
  }));

profile
  .command('show <name>')
  .description('Show details of a profile')
  .action(action(async (name) => {
    const { loadProfile, displayProfileInfo } = await import('./utils/profile-manager.js');

    const p = await loadProfile(name);
    if (!p) {
      console.log(colors.error(`Profile "${name}" not found.`));
      return;
    }

    displayProfileInfo(name, p);
  }));

profile
  .command('delete <name>')
  .description('Delete a profile')
  .action(action(async (name) => {
    const { deleteProfile } = await import('./utils/profile-manager.js');
    await deleteProfile(name);
  }));

profile
  .command('export <name> <output>')
  .description('Export a profile to a file')
  .action(action(async (name, output) => {
    const { exportProfile } = await import('./utils/profile-manager.js');
    await exportProfile(name, output);
  }));

profile
  .command('import <file>')
  .description('Import a profile from a file')
  .action(action(async (file) => {
    const { importProfile } = await import('./utils/profile-manager.js');
    await importProfile(file);
  }));

// ── System check ────────────────────────────────────────────────────

program
  .command('check')
  .description('Check system versions and compatibility')
  .action(action(async () => {
    const { displaySystemVersions } = await import('./utils/version-checker.js');
    await displaySystemVersions();
  }));

// ── Examples ────────────────────────────────────────────────────────

program
  .command('examples')
  .description('Show usage examples')
  .action(() => {
    const divider = colors.muted('━'.repeat(50));
    const examples = [
      ['Create new project (interactive)', 'ng-init', 'or ng-init create'],
      ['Check system versions', 'ng-init check'],
      ['List saved profiles', 'ng-init profile list'],
      ['Show profile details', 'ng-init profile show my-profile'],
      ['Delete a profile', 'ng-init profile delete my-profile'],
      ['Export a profile', 'ng-init profile export my-profile ./profile.json'],
      ['Import a profile', 'ng-init profile import ./profile.json'],
    ];

    console.log(colors.boldInfo('\n📚 Usage Examples:\n'));
    console.log(divider);

    for (const [desc, cmd, alt] of examples) {
      console.log(colors.white(`${desc}:`));
      console.log(colors.success(`  $ ${cmd}`) + (alt ? colors.muted(` ${alt}`) : '') + '\n');
    }

    console.log(divider + '\n');
  });

// ═══════════════════════════════════════════════════════════════════════
//  Parse & Run
// ═══════════════════════════════════════════════════════════════════════

program.parse(process.argv);