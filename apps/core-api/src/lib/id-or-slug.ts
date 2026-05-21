/**
 * Helper untuk lookup row by id (UUID) ATAU slug (string).
 *
 * Background: kalau langsung `where: { OR: [{ id: key }, { slug: key }] }`,
 * Prisma akan kirim kedua predicate ke Postgres. Saat key adalah slug
 * (mis. "retreat-pemuda-2026"), Postgres throw error `invalid input syntax
 * for type uuid` karena `id` column adalah UUID — bukan VARCHAR yang aman
 * untuk arbitrary string.
 *
 * Solusi: cek dulu apakah `key` valid UUID format. Kalau iya, query by id
 * OR slug. Kalau tidak, query by slug saja.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Build Prisma `where` predicate untuk lookup by id atau slug, aman untuk
 * UUID columns.
 *
 * Usage:
 *   const item = await prisma.event.findFirst({
 *     where: idOrSlugWhere(req.params.idOrSlug),
 *     ...
 *   });
 *
 *   // dengan additional filter:
 *   where: {
 *     tipe: 'NEWS',
 *     ...idOrSlugWhere(key),
 *   }
 *
 * Return shape selalu compatible dengan `where: { ...idOrSlugWhere(...) }`.
 */
export function idOrSlugWhere(
  key: string,
): { id: string; slug?: never } | { slug: string; id?: never } | { OR: [{ id: string }, { slug: string }] } {
  if (isUuid(key)) {
    // Bisa keduanya — Postgres handle UUID di id column dgn aman.
    return { OR: [{ id: key }, { slug: key }] };
  }
  // Bukan UUID — query by slug saja, supaya Postgres tidak crash di id column.
  return { slug: key };
}
