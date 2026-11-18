import { withSupabase } from 'npm:@supabase/server@1';

const reply = (body: unknown, status = 200) => Response.json(body, { status });
const requestsByUser = new Map<string, number[]>();

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

    const baseUrlValue = Deno.env.get('AI_BASE_URL');
    const apiKey = Deno.env.get('AI_API_KEY');
    const model = Deno.env.get('AI_MODEL');
    if (!baseUrlValue || !apiKey || !model) return reply({ error: 'AI service is not configured' }, 503);

    let baseUrl: URL;
    try { baseUrl = new URL(baseUrlValue); }
    catch { return reply({ error: 'AI_BASE_URL must be a valid HTTPS URL' }, 503); }
    if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
      return reply({ error: 'AI_BASE_URL must be a clean HTTPS URL' }, 503);
    }

    const { data: authData, error: authError } = await context.supabase.auth.getUser();
    if (authError || !authData.user) return reply({ error: 'Sign in is required' }, 401);

    let body: { coupleId?: string; today?: string; hour?: number };
    try { body = await request.json(); }
    catch { return reply({ error: 'Invalid request body' }, 400); }
    if (!body.coupleId || !/^\d{4}-\d{2}-\d{2}$/.test(body.today || '') || !Number.isInteger(body.hour) || body.hour! < 0 || body.hour! > 23) {
      return reply({ error: 'Invalid request fields' }, 400);
    }

    const now = Date.now();
    const recentRequests = (requestsByUser.get(authData.user.id) || []).filter(timestamp => now - timestamp < 60_000);
    if (recentRequests.length >= 5) return reply({ error: 'Too many requests. Please wait a minute.' }, 429);
    requestsByUser.set(authData.user.id, [...recentRequests, now]);

    const { data: membership, error: membershipError } = await context.supabase
      .from('couple_members').select('couple_id').eq('couple_id', body.coupleId).eq('user_id', authData.user.id).maybeSingle();
    if (membershipError || !membership) return reply({ error: 'Couple membership could not be verified' }, 403);

    const { data: entries, error: entriesError } = await context.supabase
      .from('shared_entries').select('entry_date,metadata').eq('couple_id', body.coupleId).eq('kind', 'cycle')
      .is('deleted_at', null).lte('entry_date', body.today!).order('entry_date', { ascending: false }).limit(30);
    if (entriesError) return reply({ error: 'Could not read shared care records' }, 500);

    const periodStartDates = (entries || [])
      .filter(entry => entry.metadata?.status === 'period')
      .map(entry => entry.entry_date)
      .slice(0, 8)
      .reverse();
    const timeOfDay = body.hour! < 11 ? '早上' : body.hour! < 14 ? '中午' : body.hour! < 18 ? '下午' : '晚上';
    const endpoint = new URL(baseUrl.toString().replace(/\/+$/, '') + '/chat/completions');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(18_000),
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 140,
          messages: [
            { role: 'system', content: '你是情侣间的温柔关怀文案助手。只写一句自然、尊重、不控制对方的简体中文关心话，约20到45字。只能依据当前时段和是否有经期开始记录来写；不得推断症状、情绪、排卵、怀孕或健康状况，不提供医疗建议。没有记录时只写不带预设的日常问候。不要提及AI。' },
            { role: 'user', content: JSON.stringify({ 今天: body.today, 当前时段: timeOfDay, 最近记录的经期开始日期: periodStartDates }) },
          ],
        }),
      });
      if (!response.ok) return reply({ error: `AI provider returned HTTP ${response.status}` }, 502);
      const result = await response.json();
      const message = typeof result.choices?.[0]?.message?.content === 'string'
        ? result.choices[0].message.content.trim().slice(0, 300)
        : '';
      if (!message) return reply({ error: 'AI provider returned an empty response' }, 502);
      return reply({ message });
    } catch (error) {
      return reply({ error: error instanceof DOMException && error.name === 'TimeoutError' ? 'AI request timed out' : 'AI provider request failed' }, 502);
    }
  }),
};
