const gateway = 'https://ai-gateway.vercel.sh/v1/chat/completions';
export async function addAiSummary(bill) {
  if (!process.env.AI_GATEWAY_API_KEY || !bill.analysis?.plainEnglish) return bill;
  const facts = { number: bill.number, title: bill.title, author: bill.author, status: bill.status, statusDate: bill.statusDate, digest: bill.analysis.plainEnglish.replace(/^The official Legislative Counsel's Digest says:\s*/, '') };
  try {
    const response = await fetch(gateway, { method: 'POST', headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openai/gpt-4o-mini', temperature: 0, max_tokens: 220, messages: [{ role: 'system', content: 'You are BillMark, a trusted and approachable advisor. Using only the supplied official facts, write exactly three short lines in this format: Bottom line: [plain-English purpose]. What it would do: [specific action from the digest]. What to know: [a careful, practical takeaway grounded in the digest]. Each line must be 22 words or fewer. Do not add facts, dates, supporters, opponents, legal conclusions, or outcomes. If the digest lacks a point, say BillMark could not verify it. Return plain text only.' }, { role: 'user', content: JSON.stringify(facts) }] }), signal: AbortSignal.timeout(8000) });
    const json = await response.json(); const summary = json?.choices?.[0]?.message?.content?.trim();
    if (response.ok && summary) bill.analysis.plainEnglish = summary;
  } catch { /* Official-digest fallback remains visible. */ }
  return bill;
}
