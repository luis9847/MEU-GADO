import { getForecast } from './forecast.mjs';

function json(status: number, value: unknown, req: Request) {
  const origin = req.headers.get('origin') || '';
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  });
  if (['https://www.sistemameugado.com.br', 'https://sistemameugado.com.br', 'https://localhost', 'http://localhost', 'capacitor://localhost'].includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return new Response(status === 204 ? null : JSON.stringify(value), { status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json(204, null, req);
  if (req.method !== 'POST') return json(405, { error: 'Método inválido.' }, req);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/.test(authorization)) return json(401, { error: 'Entre na sua conta.' }, req);
  const base = Deno.env.get('SUPABASE_URL')!;
  const apikey = Deno.env.get('SUPABASE_ANON_KEY')!;
  try {
    const user = await fetch(base + '/auth/v1/user', { headers: { apikey, authorization }, signal: AbortSignal.timeout(5000) });
    if (!user.ok) return json(401, { error: 'Entre na sua conta.' }, req);
    const body = await req.json().catch(() => null);
    const id = body?.farm_id;
    if (!Number.isSafeInteger(id) || id <= 0) return json(400, { error: 'Fazenda inválida.' }, req);
    // Use the caller's JWT so the farm lookup remains subject to RLS.
    const farm = await fetch(base + '/rest/v1/farms?select=city,state&id=eq.' + id, { headers: { apikey, authorization }, signal: AbortSignal.timeout(5000) });
    const rows = farm.ok ? await farm.json() : [];
    if (rows.length !== 1) return json(403, { error: 'Fazenda indisponível para esta conta.' }, req);
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return json(200, await getForecast({ ...rows[0], token: Deno.env.get('CLIMATEMPO_ADVISOR_TOKEN'), today }), req);
  } catch {
    // The provider URL can contain a token; never return or log upstream errors.
    return json(200, { message: 'Não foi possível consultar a previsão agora. Tente novamente ou consulte no Climatempo.' }, req);
  }
});
