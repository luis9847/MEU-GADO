const host = 'https://apiadvisor.climatempo.com.br';
const slug = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const number = (v) => typeof v === 'number' && Number.isFinite(v);
const pathDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export async function getForecast({ city, state, token, fetcher = fetch, today }) {
  const uf = String(state ?? '').trim().toUpperCase();
  const name = String(city ?? '').trim();
  if (!/^[A-Z]{2}$/.test(uf) || !name || name.length > 120) return { message: 'Preencha o município e a UF no cadastro da fazenda.' };
  if (!token) return { message: 'A previsão ainda não está disponível no painel. Consulte seu município no Climatempo.' };
  async function query(path, params) {
    const url = new URL(path, host);
    url.search = new URLSearchParams({ ...params, token }).toString();
    const r = await fetcher(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!r.ok) throw new Error('Provedor indisponível');
    return r.json();
  }
  const list = await query('/api/v1/locale/city', { name, state: uf, country: 'BR' });
  const locale = Array.isArray(list) && list.find((c) => c.state === uf && slug(c.name) === slug(name) && Number.isSafeInteger(c.id) && c.id > 0);
  if (!locale) return { message: 'Município não localizado. Confira o cadastro ou consulte no Climatempo.' };
  const data = await query('/api/v1/forecast/locale/' + locale.id + '/days/15', {});
  if (Number(data?.id) !== locale.id || data?.state !== uf || slug(data?.name) !== slug(name)) throw new Error('Localidade inesperada');
  const days = (Array.isArray(data.data) ? data.data : [])
    .filter((item) => pathDate(item.date) && item.date >= today && number(item.temperature?.min) && number(item.temperature?.max) && item.temperature.min <= item.temperature.max)
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3)
    .map((item) => ({ date: item.date, min: item.temperature.min, max: item.temperature.max, rain: number(item.rain?.probability) && item.rain.probability >= 0 && item.rain.probability <= 100 ? item.rain.probability : null }));
  return days.length ? { days } : { message: 'Não há previsão disponível para os próximos dias.' };
}
