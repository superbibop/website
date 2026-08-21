let counter = 0;

export function uid(prefix: string): string {
  counter = (counter + 1) % 100000;
  return prefix + '_' + Date.now().toString(36) + '_' + counter.toString(36);
}
