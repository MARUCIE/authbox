/**
 * Fetch every page of an offset-paginated list. Stops at the first short
 * page. `maxItems` bounds the loop if the server ever keeps returning full
 * pages.
 */
export async function collectPages<T>(
  fetchPage: (limit: number, offset: number) => Promise<T[]>,
  pageSize: number,
  maxItems = 100_000,
): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; offset < maxItems; offset += pageSize) {
    const page = await fetchPage(pageSize, offset);
    all.push(...page);
    if (page.length < pageSize) return all;
  }
  throw new Error(`More than ${maxItems} items; refusing to load an incomplete list`);
}
