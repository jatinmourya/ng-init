import chalk from 'chalk';

// Centralized console color palette for consistent CLI output
const colors = {
  success: (s) => chalk.hex('#28a745')(s), // green
  error: (s) => chalk.hex('#dc3545')(s), // red
  warning: (s) => chalk.hex('#ffc107')(s), // amber
  info: (s) => chalk.hex('#17a2b8')(s), // cyan
  accent: (s) => chalk.hex('#6f42c1')(s), // purple
  link: (s) => chalk.hex('#0d6efd')(s), // blue
  muted: (s) => chalk.gray(s), // gray
  boldInfo: (s) => chalk.bold.hex('#17a2b8')(s),
  boldAccent: (s) => chalk.bold.hex('#6f42c1')(s),
  boldSuccess: (s) => chalk.bold.hex('#28a745')(s),
  white: (s) => chalk.white(s),
};

export default colors;
