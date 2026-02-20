import Table from 'cli-table3';
import chalk from 'chalk';

export function printKeyValue(title, pairs = []) {
    if (title) console.log(chalk.bold.cyan(`\n${title}\n`));
    const table = new Table({ head: ['Field', 'Value'], style: { head: ['cyan'] } });
    pairs.forEach(([k, v]) => table.push([k, v]));
    console.log(table.toString() + '\n');
}

export function printObjectList(title, data = [], cols = []) {
    if (!Array.isArray(data) || data.length === 0) {
        console.log(chalk.yellow(`No ${title || 'items'} to display.`));
        return;
    }

    if (title) console.log(chalk.bold.cyan(`\n${title}\n`));

    const table = new Table({ head: cols, style: { head: ['cyan'] } });

    data.forEach(item => {
        const row = cols.map(c => item[c] !== undefined ? String(item[c]) : '');
        table.push(row);
    });

    console.log(table.toString() + '\n');
}

export function printSimpleTable(title, data = []) {
    if (!Array.isArray(data) || data.length === 0) {
        console.log(chalk.yellow(`No ${title || 'items'} to display.`));
        return;
    }

    const cols = Object.keys(data[0]);
    printObjectList(title, data, cols);
}

export default { printKeyValue, printObjectList, printSimpleTable };
