const SESSIONS = ["20252026", "20232024", "20212022"];
const OFFICIAL_ORIGIN = "https://leginfo.legislature.ca.gov";

export function normalizeBill(input) {
  const compact = String(input ?? "").toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^(AB|SB)(\d{1,4})$/);

  if (!match) {
    throw new Error(
      "Enter a California Assembly or Senate bill, such as AB 222 or SB 123."
    );
  }

  return {
    chamber: match[1],
    number: match[2],
    display: `${match[1]} ${match[2]}`
  };
}

function decode(value = "") {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(
      /&#(?:x([\da-f]+)|([\d]+));/gi,
      (_, hex, decimal) =>
        String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10))
    );
}

function clean(value = "") {
  return decode(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function section(html, labels) {
  for (const label of labels) {
    const start = html.search(label);

    if (start >= 0) {
      return html.slice(start, start + 16000);
    }
  }

  return "";
}

function firstMatch(value, expressions) {
  for (const expression of expressions) {
    const match = value.match(expression);

    if (match?.[1]) {
      return clean(match[1]);
    }
  }

  return "";
}

/*
 * Parse the actual California "Bill Status" page.
 *
 * This page contains the authoritative:
 * - House Location
 * - Last Amended Date
 * - Committee Action Date
 * - Committee Motion
 * - Committee Vote Result
 * - Type of Measure
 * - Last 5 History Actions
 */
function parseStatusPage(html) {
  const text = clean(html);

  const houseLocation = firstMatch(text, [
    /House Location\s+([A-Za-z]+)/i
  ]);

  const lastAmendedDate = firstMatch(text, [
    /Last Amended Date\s+(\d{2}\/\d{2}\/\d{2})/i
  ]);

  const committeeActionDate = firstMatch(text, [
    /Committee Action Date\s+(\d{2}\/\d{2}\/\d{2})/i
  ]);

  const committeeMotion = firstMatch(text, [
    /Committee Motion\s+(.+?)\s+Committee Vote Result/i
  ]);

  const committeeVoteResult = firstMatch(text, [
    /Committee Vote Result\s+(.+?)\s+Type of Measure/i
  ]);

  const typeOfMeasure = firstMatch(text, [
    /Type of Measure\s+(.+?)\s+Last 5 History Actions/i
  ]);

  const historySection = section(html, [
    /Last\s+5\s+History\s+Actions/i
  ]);

  const historyText = clean(historySection);

  /*
   * California's status page currently renders the last five
   * history actions in a simple Date / Action table.
   */
  const history = [];

  const historyRegex =
    /(\d{2}\/\d{2}\/\d{2})\s+(.+?)(?=\s+\d{2}\/\d{2}\/\d{2}\s+|$)/g;

  for (const match of historyText.matchAll(historyRegex)) {
    const date = match[1];
    const action = match[2].trim();

    if (action.length > 3) {
      history.push({
        date,
        action
      });
    }
  }

  /*
   * Fallback for HTML table markup if the text parser doesn't
   * find the history rows.
   */
  if (!history.length) {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

    for (const row of html.matchAll(rowRegex)) {
      const cells = [];

      const cellRegex =
        /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

      for (const cell of row[1].matchAll(cellRegex)) {
        cells.push(clean(cell[1]));
      }

      if (
        cells.length >= 2 &&
        /^\d{2}\/\d{2}\/\d{2}$/.test(cells[0])
      ) {
        history.push({
          date: cells[0],
          action: cells[1]
        });
      }
    }
  }

  return {
    houseLocation,
    lastAmendedDate,
    committeeActionDate,
    committeeMotion,
    committeeVoteResult,
    typeOfMeasure,
    history: history.slice(0, 5)
  };
}

function extractDigest(html) {
  const digestBlock = section(html, [
    /LEGISLATIVE\s+COUNSEL'?S\s+DIGEST/i
  ]);

  if (!digestBlock) {
    return "";
  }

  const digest = clean(digestBlock)
    .replace(
      /^.*?LEGISLATIVE\s+COUNSEL'?S\s+DIGEST\s*/i,
      ""
    )
    .trim();

  return digest.length > 2400
    ? digest.slice(0, 2397).replace(/\s+\S*$/, "") + "..."
    : digest;
}

function extractTitle(html, bill) {
  const titleText = firstMatch(html, [
    /<title>\s*([^<]+)<\/title>/i
  ]);

  if (titleText) {
    return titleText
      .replace(/^Bill\s+(?:Text|Status)\s*-\s*/i, "")
      .replace(
        new RegExp(
          `^${bill.chamber}-${bill.number}\\s*`,
          "i"
        ),
        ""
      )
      .replace(/\(\d{4}-\d{4}\)\s*$/i, "")
      .trim();
  }

  return "Title unavailable from the official record";
}

function extractAuthor(html) {
  const text = clean(html);

  return firstMatch(text, [
    /Introduced by\s+(.+?)(?=\s+(?:on\s+)?\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /Lead Authors\s+([A-Za-zÀ-ÿ ,.'-]+)/i
  ]);
}

function explainStatus(status, typeOfMeasure) {
  const combined = `${status || ""} ${typeOfMeasure || ""}`.toLowerCase();

  if (/chaptered|chapter\s+\d+/.test(combined)) {
    return "The measure has become law according to the official California legislative record.";
  }

  if (/veto/.test(combined)) {
    return "The official record indicates that the Governor vetoed this measure.";
  }

  if (/governor/.test(combined)) {
    return "The measure has reached the Governor stage of the legislative process.";
  }

  if (/held under submission/.test(combined)) {
    return "The bill remains in committee. The latest official action says it was held under submission.";
  }

  if (/suspense/.test(combined)) {
    return "The bill is in a fiscal committee process and has been placed on the suspense file.";
  }

  if (/committee/.test(combined)) {
    return "The bill is currently in the committee stage of the legislative process.";
  }

  if (/introduced|referred/.test(combined)) {
    return "The bill has entered the legislative process and has been referred for further action.";
  }

  return "This is the latest procedural position BillMark could verify from the official California legislative record.";
}

function nextStep(status, typeOfMeasure) {
  const combined = `${status || ""} ${typeOfMeasure || ""}`.toLowerCase();

  if (/chaptered|veto/.test(combined)) {
    return "The official record shows a final action. No further routine legislative step is implied here.";
  }

  if (/held under submission/.test(combined)) {
    return "The bill remains in committee. The next action will depend on whether the committee takes it up again.";
  }

  if (/suspense/.test(combined)) {
    return "The next step depends on action by the fiscal committee on the suspense file.";
  }

  if (/governor/.test(combined)) {
    return "The next major step is action by the Governor.";
  }

  if (/committee/.test(combined)) {
    return "The committee may schedule another hearing, amend the bill, or vote on whether to advance it.";
  }

  return "Follow the official bill history for the next recorded legislative action.";
}

function formatSession(session) {
  const match = String(session).match(/^(\d{4})(\d{4})$/);

  return match
    ? `${match[1]}–${match[2].slice(2)} Regular Session`
    : "California Legislative Session";
}

function parseOfficialBill(
  billHtml,
  statusHtml,
  bill,
  sourceUrl,
  session
) {
  const digest = extractDigest(billHtml);
  const statusData = parseStatusPage(statusHtml);

  const title = extractTitle(statusHtml || billHtml, bill);
  const author =
    extractAuthor(statusHtml) ||
    extractAuthor(billHtml);

  const history = statusData.history || [];
  const latest = history[0];

  const status =
    latest?.action ||
    statusData.typeOfMeasure ||
    undefined;

  const plainEnglish = digest
    ? digest
    : "BillMark couldn't verify a plain-English summary from the available official record.";

  return {
    number: bill.display,
    title,
    author: author || undefined,

    status,
    statusDate: latest?.date || undefined,

    houseLocation:
      statusData.houseLocation || undefined,

    lastAmendedDate:
      statusData.lastAmendedDate || undefined,

    committeeActionDate:
      statusData.committeeActionDate || undefined,

    committeeMotion:
      statusData.committeeMotion || undefined,

    committeeVoteResult:
      statusData.committeeVoteResult || undefined,

    typeOfMeasure:
      statusData.typeOfMeasure || undefined,

    lastUpdated:
      latest?.date ||
      statusData.lastAmendedDate ||
      undefined,

    history,

    sourceUrl,

    official: true,

    session: formatSession(session),

    analysis: {
      plainEnglish,
      whereItStands: explainStatus(
        status,
        statusData.typeOfMeasure
      ),
      whatChanged:
        statusData.lastAmendedDate
          ? `The official record shows the bill was last amended on ${statusData.lastAmendedDate}. BillMark will provide a detailed version comparison in the next product layer.`
          : "BillMark couldn't verify a meaningful version comparison from the available official record.",

      whatHappensNext: nextStep(
        status,
        statusData.typeOfMeasure
      ),

      whyItMatters:
        "BillMark will identify affected groups only when that analysis can be grounded in verified bill text and official legislative actions."
    }
  };
}

export async function retrieveBill(
  input,
  fetchImpl = fetch
) {
  const bill = normalizeBill(input);

  let lastError;
  let receivedResponse = false;

  for (const session of SESSIONS) {
    const billId =
      `${session}0${bill.chamber}${bill.number}`;

    const sourceUrl =
      `${OFFICIAL_ORIGIN}/faces/billNavClient.xhtml?bill_id=${billId}`;

    const statusUrl =
      `${OFFICIAL_ORIGIN}/faces/billStatusClient.xhtml?bill_id=${billId}`;

    try {
      const requestOptions = {
        headers: {
          Accept: "text/html",
          "User-Agent":
            "BillMark/1.0 (official legislative information viewer)"
        },
        signal: AbortSignal.timeout(9000)
      };

      /*
       * Fetch both the bill page and the dedicated status page.
       *
       * The status page is the authoritative source for:
       * current location, committee action, and recent history.
       */
      const [billResponse, statusResponse] =
        await Promise.all([
          fetchImpl(sourceUrl, requestOptions),
          fetchImpl(statusUrl, requestOptions)
        ]);

      receivedResponse = true;

      if (!billResponse.ok) {
        lastError = new Error(
          `Official source returned ${billResponse.status}`
        );
        continue;
      }

      if (!statusResponse.ok) {
        lastError = new Error(
          `Official status source returned ${statusResponse.status}`
        );
        continue;
      }

      const billHtml =
        await billResponse.text();

      const statusHtml =
        await statusResponse.text();

      /*
       * Make sure this is actually the requested bill.
       */
      if (
        !new RegExp(
          `${bill.chamber}-${bill.number}`,
          "i"
        ).test(statusHtml)
      ) {
        continue;
      }

      return parseOfficialBill(
        billHtml,
        statusHtml,
        bill,
        sourceUrl,
        session
      );
    } catch (error) {
      lastError = error;
    }
  }

  if (
    !receivedResponse ||
    lastError?.name === "TimeoutError"
  ) {
    throw new Error(
      "The official California legislative record is unavailable. Please try again shortly."
    );
  }

  throw new Error(
    `Couldn't find ${bill.display} in the available California legislative sessions.`
  );
}
