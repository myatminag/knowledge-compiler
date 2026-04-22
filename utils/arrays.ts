export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function cleanArray(arr: string[]): string[] {
  return unique(arr.map((x) => x.trim()).filter((x) => x.length > 0));
}

export function dedupeCaseInsensitive(arr: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of arr) {
    const key = item.trim().toLowerCase();

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(item.trim());
  }

  return result;
}
