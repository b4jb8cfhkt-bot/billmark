const SESSION = "20252026";
const OFFICIAL_BASE = "https://leginfo.legislature.ca.gov/faces/";

function normalizeBill(input) {
  const value = String(input || "").trim().toUpperCase().replace(/\s+/g, "");
  const m = value.match(/^(AB|SB)(\d+)$/);
if (!m) throw new Error("Enter a California Assembly or Senate bill, such as AB 222 or SB 123.");  return { chamber: m[1], number: m[2], normalized: `${m[1]} ${m[2]}` };
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function clean(s) {
  return decodeEntities(String(s || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(s) {
  return clean(s);
}

function firstMatch(html, regex) {
  const m = html.match(regex);
  return m ? clean(m[1]) : "";
}

function between(html, start, end) {
  const a = html.search(start);
  if (a < 0) return "";
  const b = html.slice(a).search(end);
  return b < 0 ? html.slice(a) : html.slice(a, a + b);
}

function parseTitle(html) {
  let t = firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!t) t = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  t = t.replace(/^Bill Text\s*-\s*/i, "").replace(/^Bill Status\s*-\s*/i, "");
  const m = t.match(/^(?:AB|SB)-?\d+\s+(.*)$/i);
  return m ? m[1].replace(/\s*\(\d{4}-\d{4}\).*$/, "").trim() : t;
}

function parseAuthor(html) {
  const m = html.match(/Introduced by\s+([^<\n]+?)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i);
  return m ? clean(m[1]) : "";
}

function parseStatusPage(html) {
  const location = firstMatch(html, /House Location:\s*<\/[^>]+>\s*([^<]+)</i);
  const introduced = firstMatch(html, /Introduced Date:\s*<\/[^>]+>\s*([^<]+)</i);
  const typeBlock = firstMatch(html, /Type of Measure([\s\S]{0,3500}?)(?:Last 5 History Actions|<\/body>)/i);
  const active = firstMatch(typeBlock, /(Active Bill\s*-\s*[^<]+)/i);

  let status = active || "";
  if (!status) {
    const candidates = [
      /Bill Status\s*<\/[^>]+>\s*([^<]+)/i,
      /Current Status\s*<\/[^>]+>\s*([^<]+)/i
    ];
    for (const r of candidates) { status = firstMatch(html, r); if (status) break; }
  }

  const historySection = between(html, /Last 5 History Actions/i, /(?:<\/table>|<\/body>)/i);
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm;
  while ((rm = rowRe.exec(historySection)) !== null) {
    const cells = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm;
    while ((cm = cellRe.exec(rm[1])) !== null) cells.push(clean(cm[1]));
    if (cells.length >= 2 && !/Date/i.test(cells[0])) rows.push({date:cells[0], action:cells[1]});
  }

  return { location, introduced, status, history: rows };
}

function summarizeFromDigest(html) {
  const digest = between(html, /LEGISLATIVE COUNSEL'S DIGEST/i, /The people of the State of California do enact|SECTION 1\./i);
  const text = clean(digest).replace(/LEGISLATIVE COUNSEL'S DIGEST/i, "").trim();
  if (!text) return "";
  return text.length > 900 ? text.slice(0, 897).replace(/\s+\S*$/, "") + "â€¦" : text;
}

function inferStatusMeaning(status, history) {
  const s = String(status || "").toLowerCase();
  if (s.includes("pending referral")) return "The bill has been introduced and is awaiting referral to a committee.";
  if (s.includes("committee")) return "The bill is being considered in a legislative committee.";
  if (s.includes("passed")) return "The bill has cleared at least one legislative stage; the official record above shows its current position.";
  if (s.includes("governor")) return "The bill has reached the Governor stage.";
  if (s.includes("chaptered") || s.includes("signed")) return "The measure has become law according to the official record.";
  if (s.includes("veto")) return "The Governor has vetoed the measure.";
  if (s.includes("dead") || s.includes("failed")) return "The measure is no longer advancing according to the official record.";
  if (history.length) return "This is the current procedural position shown by the official California legislative record.";
  return "This is the current procedural position shown by the official California legislative record.";
}

function nextStep(status, history) {
  const s = String(status || "").toLowerCase();
  if (s.includes("pending referral")) return "The next verified step is referral to the appropriate legislative committee.";
  if (s.includes("committee")) return "The next step depends on the committee's action, such as a hearing, vote, or referral.";
  if (s.includes("governor")) return "The next major step is action by the Governor.";
  if (s.includes("chaptered") || s.includes("signed") || s.includes("veto") || s.includes("dead")) return "No further routine legislative step is required based on the current status.";
  if (history.length) return "The next step should be confirmed from the latest official history entry before treating it as certain.";
  return "BillMark could not verify the next procedural step from the available official record.";
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": "BillMark/1.0 (public legislative information viewer)",
      "Accept": "text/html,application/xhtml+xml"
    }
  });
  if (!r.ok) throw new Error(`Official source returned ${r.status}`);
  return await r.text();
}

export default async function handler(req, res) {
  const input = req.query && req.query.bill;
  const bill = normalizeBill(input);

  if (!bill) {
    return res.status(400).json({
      error: "Couldn't understand that bill number. Try something like AB 222 or SB 123."
    });
  }

  const billId = `${SESSION}${bill.chamber}${bill.number}`;
  const sourceUrl = `${OFFICIAL_BASE}billNavClient.xhtml?bill_id=${billId}`;
  const statusUrl = `${OFFICIAL_BASE}billStatusClient.xhtml?bill_id=${billId}`;

  try {
    const [billHtml, statusHtml] = await Promise.all([
      fetchText(sourceUrl),
      fetchText(statusUrl).catch(() => "")
    ]);

    const title = parseTitle(billHtml);
    const author = parseAuthor(billHtml);
    const summary = summarizeFromDigest(billHtml);
    const statusInfo = statusHtml ? parseStatusPage(statusHtml) : {location:"",introduced:"",status:"",history:[]};

    if (!title && !summary) {
      return res.status(404).json({
        error: `Couldn't find ${bill.normalized}. Try a current California bill such as AB 222.`
      });
    }

    const latest = statusInfo.history && statusInfo.history[0];
    const lastUpdated = latest ? latest.date : "";

    return res.status(200).json({
      number: bill.normalized,
      title,
      author,
      houseLocation: statusInfo.location,
      introducedDate: statusInfo.introduced,
      status: statusInfo.status || (latest ? latest.action : "Official record available"),
      lastUpdated,
      summary,
      change: "BillMark will compare versions and amendments in the next product layer. This MVP does not invent a change summary when the official record cannot verify one.",
      statusMeaning: inferStatusMeaning(statusInfo.status, statusInfo.history || []),
      nextStep: nextStep(statusInfo.status, statusInfo.history || []),
      sourceUrl,
      official: true
    });
  } catch (err) {
    console.error("BillMark bill lookup failed:", err);
    return res.status(502).json({
      error: "The official California legislative record could not be reached right now. Please try again."
    });
  }
}
