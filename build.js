#!/usr/bin/env node

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { rm, chmod } from 'fs/promises';

// ═══════════════════════════════════════════════════════════════════════
//  Paths & Mode
// ═══════════════════════════════════════════════════════════════════════

const __dirname = dirname(fileURLToPath(import.meta.url));

const SRC_ENTRY = join(__dirname, 'src/index.js');
const DIST_DIR = join(__dirname, 'dist');
const OUT_FILE = join(DIST_DIR, 'cli.js');

const isWatch = process.argv.includes('--watch') || process.argv.includes('-w');
const isProd = !isWatch;
const MODE = isProd ? 'production' : 'development';

// ═══════════════════════════════════════════════════════════════════════
//  esbuild Configuration
// ═══════════════════════════════════════════════════════════════════════

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: [SRC_ENTRY],
  outfile: OUT_FILE,

  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',

  // Keep node_modules external — they're installed at runtime
  packages: 'external',

  // Shebang for direct CLI execution
  banner: { js: '#!/usr/bin/env node' },

  // Production optimizations
  minify: isProd,
  sourcemap: isProd ? false : 'linked',
  treeShaking: true,
  keepNames: true,

  define: {
    'process.env.NODE_ENV': JSON.stringify(MODE),
  },

  metafile: true,
  logLevel: 'info',
};

// ═══════════════════════════════════════════════════════════════════════
//  Clean
// ═══════════════════════════════════════════════════════════════════════

/**
 * Remove the dist directory.
 *
 * `force: true` already handles the "doesn't exist" case — no need
 * for a preceding `existsSync` check. esbuild creates the output
 * directory automatically, so a separate `mkdir` is unnecessary.
 */
function clean() {
  return rm(DIST_DIR, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════
//  Build
// ═══════════════════════════════════════════════════════════════════════

async function build() {
  console.log(`🚀 Building CLI…`);
  console.log(`🔧 Mode: ${MODE.toUpperCase()}\n`);

  await clean();

  const result = await esbuild.build(config);

  // Make the output executable on Unix (no-op on Windows)
  await chmod(OUT_FILE, 0o755).catch(() => { });

  console.log('\n✅ Build successful');
  console.log(`📦 Output: ${OUT_FILE}`);

  // Show bundle analysis in dev; skip in prod (noise reduction)
  if (result.metafile && !isProd) {
    const analysis = await esbuild.analyzeMetafile(result.metafile, {
      verbose: true,
    });
    console.log('\n📊 Bundle analysis:\n');
    console.log(analysis);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Watch
// ═══════════════════════════════════════════════════════════════════════

async function watch() {
  console.log('👀 Watch mode enabled\n');

  await clean();

  const ctx = await esbuild.context(config);
  await ctx.watch();

  console.log('✅ Watching for changes… (Ctrl+C to stop)\n');

  // Graceful shutdown — dispose the esbuild context so the process
  // can exit cleanly and temp files are cleaned up.
  const shutdown = async () => {
    console.log('\n🛑 Stopping watcher…');
    await ctx.dispose();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ═══════════════════════════════════════════════════════════════════════
//  Run
// ═══════════════════════════════════════════════════════════════════════

try {
  await (isWatch ? watch() : build());
} catch (err) {
  console.error('\n❌ Build failed');
  console.error(err);
  process.exit(1);
}