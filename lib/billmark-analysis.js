const gateway = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const guidanceKeys = ['plainEnglish', 'whatChanged', 'whatHappensNext', 'whyItMatters'];

function parseGuidance(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    return guidanceKeys.every((key) => typeof parsed[key] === 'string' && parsed[key].trim()) ? parsed : null;
  } catch { return null; }
}

export async function addAiSummary(bill) {
  if (!process.env.AI_GATEWAY_API_KEY || !bill.analysis?.plainEnglish) return bill;
  const facts = {
    number: bill.number, title: bill.title, author: bill.author, status: bill.status,
    statusDate: bill.statusDate, history: bill.history?.slice(0, 8),
    digest: bill.analysis.plainEnglish.replace(/^The official Legislative Counsel's Digest says:\s*/, '')
  };
  const instructions = `You are BillMark, a trusted and approachable advisor. Use only the supplied official facts. Return one JSON object with exactly these string keys: plainEnglish, whatChanged, whatHappensNext, whyItMatters. Each value must be one or two short sentences and under 48 words. Be clear, professional, and practical. Do not add facts, dates, supporters, opponents, legal conclusions, or outcomes. For changes, only compare when history or digest verifies a change; otherwise state that BillMark could not verify a meaningful change. For next steps, label an inference as “Likely next step:”. For relevance, only identify affected groups when the digest supports it; otherwise state that BillMark could not verify who may be affected.`;
  try {
    const response = await fetch(gateway, { method: 'POST', headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openai/gpt-4o-mini', temperature: 0, max_tokens: 440, messages: [{ role: 'system', content: instructions }, { role: 'user', content: JSON.stringify(facts) }] }), signal: AbortSignal.timeout(8000) });
    const json = await response.json();
    if (!response.ok) { console.warn('BillMark AI guidance unavailable', { status: response.status }); return bill; }
    const guidance = parseGuidance(json?.choices?.[0]?.message?.content);
    if (!guidance) { console.warn('BillMark AI guidance rejected: invalid response shape'); return bill; }
    bill.analysis = { ...bill.analysis, ...guidance };
  } catch (error) {
    console.warn('BillMark AI guidance unavailable', { reason: error?.name || 'request-error' });
  }
  return bill;
}
