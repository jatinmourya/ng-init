import Table from 'cli-table3';
import colors from './colors.js';

// ═══════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════

const HEAD_STYLE = { head: ['cyan'] };

// ═══════════════════════════════════════════════════════════════════════
//  Internal Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Print an optional title then a cli-table3 instance.
 *
 * Extracted because every public function followed the same
 * "log title → build table → log table" sequence.
 */
function render(title, table) {
  if (title) console.log(colors.boldInfo(`\n${title}\n`));
  console.log(table.toString() + '\n');
}

/**
 * Convert a value to a display-safe string.
 * Handles `null`, `undefined`, and non-string types.
 */
function toStr(value) {
  return value == null ? '' : String(value);
}

// ═══════════════════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Print a two-column key → value table.
 *
 * @param {string}              title  Section heading (optional)
 * @param {[string, unknown][]} pairs  Array of `[field, value]` tuples
 *
 * @example
 *   printKeyValue('Server Info', [
 *       ['Host', 'localhost'],
 *       ['Port', 3000],
 *   ]);
 */
export function printKeyValue(title, pairs = []) {
  if (pairs.length === 0) {
    console.log(colors.warning(`No ${title || 'items'} to display.`));
    return;
  }

  const table = new Table({
    head: ['Field', 'Value'],
    style: HEAD_STYLE,
  });

  for (const [k, v] of pairs) {
    table.push([toStr(k), toStr(v)]);
  }

  render(title, table);
}

/**
 * Print a multi-column table from an array of objects.
 *
 * @param {string}   title  Section heading (optional)
 * @param {object[]} data   Row objects
 * @param {string[]} cols   Column keys to display (in order)
 *
 * @example
 *   printObjectList('Packages', [
 *       { Name: 'lodash', Version: '4.17.21' },
 *   ], ['Name', 'Version']);
 */
export function printObjectList(title, data = [], cols = []) {
  if (!Array.isArray(data) || data.length === 0) {
    console.log(colors.warning(`No ${title || 'items'} to display.`));
    return;
  }

  const table = new Table({
    head: cols,
    style: HEAD_STYLE,
  });

  for (const item of data) {
    table.push(cols.map(c => toStr(item[c])));
  }

  render(title, table);
}

/**
 * Print a table from an array of objects, auto-detecting columns
 * from the keys of the first object.
 *
 * Convenience wrapper — use {@link printObjectList} when you need
 * explicit column control or ordering.
 *
 * @param {string}   title  Section heading (optional)
 * @param {object[]} data   Row objects
 */
// (Removed unused convenience wrapper `printSimpleTable` to reduce
// exported API surface; use `printObjectList` instead.)