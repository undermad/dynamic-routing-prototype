// Writing to a terminal: colour, a table with aligned columns, and the headings and markers
// the CLI uses. Nothing here knows what is being shown.
export const WIDTH = 92;

// Colour is dropped when the output is not a terminal, so piped runs stay readable.
const colourful = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

const colour = (open: number) => (text: string): string =>
  colourful ? `\u001b[${open}m${text}\u001b[0m` : text;

export const bold = colour(1);
export const dim = colour(2);
export const red = colour(31);
export const green = colour(32);
export const amber = colour(33);
export const blue = colour(34);
export const magenta = colour(35);
export const cyan = colour(36);

const ANSI = /\u001b\[[0-9;]*m/g;

export const plain = (text: string): string => text.replace(ANSI, '');

export const visibleWidth = (text: string): number => [...plain(text)].length;

export const pad = (text: string, to: number, align: 'left' | 'right' = 'left'): string => {
  const fill = ' '.repeat(Math.max(0, to - visibleWidth(text)));
  return align === 'right' ? `${fill}${text}` : `${text}${fill}`;
};

export const truncate = (text: string, to: number): string =>
  visibleWidth(text) <= to ? text : `${[...text].slice(0, to - 1).join('')}…`;

export interface Column {
  header: string;
  align?: 'left' | 'right';
}

// Aligns every cell to the widest value in its column, ignoring colour codes.
export const table = (columns: Column[], rows: string[][]): string[] => {
  const widths = columns.map((column, index) =>
    Math.max(visibleWidth(column.header), ...rows.map(row => visibleWidth(row[index] ?? '')))
  );

  const line = (cells: string[]): string =>
    `  ${cells
      .map((cell, index) => pad(cell ?? '', widths[index], columns[index].align))
      .join('  ')
      .trimEnd()}`;

  const separator = columns.map((column, index) =>
    column.header === '' ? ' '.repeat(widths[index]) : '─'.repeat(widths[index])
  );

  return [
    dim(line(columns.map(column => column.header))),
    dim(line(separator)),
    ...rows.map(line)
  ];
};

export const banner = (left: string, right = ''): string => {
  const head = `═══ ${left} `;
  const tail = right === '' ? '' : ` ${right} ═══`;
  const fill = '═'.repeat(Math.max(3, WIDTH - visibleWidth(head) - visibleWidth(tail)));

  return `\n${bold(blue(`${head}${fill}${tail}`))}`;
};

export const rule = (title: string): string => {
  const head = `── ${title} `;
  return `\n${cyan(head)}${dim('─'.repeat(Math.max(0, WIDTH - visibleWidth(head))))}`;
};

export const decision = (text: string): string => `\n${bold(magenta(`▸ ENGINE  ${text}`))}`;

export const prompt = (text: string): string => `\n${bold(amber(`➡  ${text}`))}`;

export const question = (text: string): string => `\n${bold(text)}`;

export const cursor = (): string => bold(cyan('> '));

export const warn = (text: string): string => red(text);

export const print = (lines: string[]): void => {
  for (const line of lines) console.log(line);
};
