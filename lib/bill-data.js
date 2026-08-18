const SESSIONS = ["20252026", "20232024", "20212022"];
const OFFICIAL_ORIGIN = "https://leginfo.legislature.ca.gov";

export function normalizeBill(input) {
  const compact = String(input ?? "").toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^(AB|SB)(\d{1,4})$/);
  if (!match) {
    throw new Error("Enter a California Assembly or Senate bill, such as AB 222 or SB 123.");
  }
  return { chamber: match[1], number: match[2], display: `${match[1]} ${match[2]}` };
}

function decode(value = "") {
  return value
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(?:x([\da-f]+)|([\d]+));/gi, (_, hex, decimal) => String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10)));
}

function clean(value = "") {
  return decode(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function section(html, labels) {
  for (const label of labels) {
    const start = html.search(label);
    if (start >= 0) return html.slice(start, start + 14000);
  }
  return "";
}

function firstMatch(value, expressions) {
  for (const expression of expressions) {
    const match = value.match(expression);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

function extractHistory(html) {
  const historyHtml = section(html, [/Bill\s+History/i, /History/i]);
  const historyText = clean(historyHtml);
  const matches = [...historyText.matchAll(/(\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]+\s+\d{1,2},\s+\d{4})\s+(.+?)(?=(?:\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]+\s+\d{1,2},\s+\d{4})\s+|$)/g)];
  return matches.slice(0, 30).map((match) => ({ date: match[1], action: match[2].replace(/\s+/g, " ").trim() })).filter((item) => item.action.length > 3);
}

function explainStatus(status) {
  const lower = status.toLowerCase();
  if (/chaptered|chapter\s+\d+/i.test(status)) return "The Governor signed this measure into law. The chapter number is part of the official record.";
  if (/veto/i.test(status)) return "The official record indicates the Governor vetoed this measure.";
  if (/governor/i.test(status) && /present|enroll|sent|transmit/i.test(status)) return "The Legislature has sent this measure to the Governor for action.";
  if (/senate/i.test(status) && /assembly/i.test(status) && /pass|concur|enroll/i.test(status)) return "The official record shows action by both houses; review the latest action for the precise procedural step.";
  if (/committee/i.test(status)) return "The bill is in the committee stage. A committee must act before it can continue through the legislative process.";
  if (/introduced|referred/i.test(status)) return "The bill has entered the legislative process and has been referred for its next official action.";
  return "This is the latest procedural action BillMark could verify from the official California legislative record.";
}

function nextStep(status) {
  if (!status) return "BillMark couldn't verify a next step from the available official record.";
  if (/chaptered|veto/i.test(status)) return "Known: the official record shows a final Governor action. No further legislative step is implied here.";
  if (/governor/i.test(status) && /present|enroll|sent|transmit/i.test(status)) return "Likely next step: the Governor may sign, veto, or allow the bill to become law without a signature.";
  if (/committee/i.test(status)) return "Likely next step: the committee may schedule a hearing, amend the bill, or vote on whether to advance it.";
  return "Likely next step: follow the official bill history for the next recorded legislative action.";
}

function parseOfficialBill(html, bill, sourceUrl, session) {
  const page = clean(html);
  const title = firstMatch(html, [
    /<title>\s*([^<]*?(?:AB|SB)[-\s]?\d+[^<]*)<\/title>/i,
    new RegExp(`${bill.chamber}[-\\s]?${bill.number}\\s*[-–:]?\\s*([^<(]{8,500})`, "i")
  ]) || "Title unavailable from the official record";
  const author = firstMatch(page, [/Introduced by\s+(.+?)(?=\s+(?:\(|on\s+|\d{1,2}\/|[A-Z][a-z]+\s+\d|$))/i]);
  const digestBlock = section(html, [/LEGISLATIVE\s+COUNSEL'?S\s+DIGEST/i]);
  const digest = clean(digestBlock).replace(/^.*?LEGISLATIVE\s+COUNSEL'?S\s+DIGEST\s*/i, "").slice(0, 2400);
  const history = extractHistory(html);
  const latest = history[0] || history.at(-1);
  const updated = firstMatch(page, [/Last\s+(?:amended|updated)\s*:?[\s]+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i]);

  return {
    number: bill.display,
    title,
    author: author || undefined,
    status: latest?.action || undefined,
    statusDate: latest?.date || undefined,
    introducedDate: firstMatch(page, [/Introduced\s+(?:by\s+.+?\s+)?(?:on\s+)?([A-Z][a-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i]) || undefined,
    lastUpdated: updated || latest?.date || undefined,
    history,
    sourceUrl,
    official: true,
    session,
    analysis: {
      plainEnglish: digest ? `The official Legislative Counsel's Digest says: ${digest}` : "BillMark couldn't verify a plain-English summary from the available official record.",
      whereItStands: explainStatus(latest?.action || ""),
      whatChanged: "BillMark couldn't verify a meaningful version comparison from the available official record.",
      whatHappensNext: nextStep(latest?.action || ""),
      whyItMatters: "BillMark doesn't infer affected groups until it can ground that analysis in verified bill text and official actions."
    }
  };
}

export async function retrieveBill(input, fetchImpl = fetch) {
  const bill = normalizeBill(input);
  let lastError;
  let receivedResponse = false;
  for (const session of SESSIONS) {
    const billId = `${session}0${bill.chamber}${bill.number}`;
    const sourceUrl = `${OFFICIAL_ORIGIN}/faces/billNavClient.xhtml?bill_id=${billId}`;
    try {
      const response = await fetchImpl(sourceUrl, { headers: { Accept: "text/html", "User-Agent": "BillMark/1.0 (official-record lookup)" }, signal: AbortSignal.timeout(9000) });
      receivedResponse = true;
      if (!response.ok) { lastError = new Error(`Official source returned ${response.status}`); continue; }
      const html = await response.text();
      if (!new RegExp(`${bill.chamber}[-\\s]?${bill.number}`, "i").test(html)) continue;
      return parseOfficialBill(html, bill, sourceUrl, session);
    } catch (error) { lastError = error; }
  }
  if (!receivedResponse || lastError?.name === "TimeoutError") {
    throw new Error("The official California legislative record is unavailable. Please try again shortly.");
  }
  throw new Error(`Couldn't find ${bill.display} in the available California legislative sessions.`);
}
