/**
 * GET /api/products/<code> — the product detail sheet reads this.
 *
 * It returns the masterlist record and the knowledge sheet for one code, from
 * lib/details.ts. The data is static and holds list prices only, so the route
 * caches for an hour and has no rate limit. It never reads cost data.
 */
import { getProductDetails } from '@/lib/details';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const details = getProductDetails(decodeURIComponent(code).trim().toUpperCase());
  if (details.status === 'unknown_code') {
    return Response.json({ error: 'unknown_code' }, { status: 404 });
  }
  return Response.json(details, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
