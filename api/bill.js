import { retrieveBill } from "../lib/bill-data.js";

const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  const key = String(req.query?.bill || "").trim().toUpperCase().replace(/\s+/g, "");
  try {
    const cached = cache.get(key);
    const bill = cached && Date.now() - cached.createdAt < CACHE_MS ? cached.bill : await retrieveBill(key);
    if (!cached || cached.bill !== bill) cache.set(key, { bill, createdAt: Date.now() });
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=300");
    return res.status(200).json(bill);
  } catch (error) {
    const message = error instanceof Error ? error.message : "BillMark couldn't reach the official California legislative record. Please try again.";
    const status = /Enter a California/.test(message) ? 400 : /Couldn't find/.test(message) ? 404 : 503;
    return res.status(status).json({ error: message });
  }
}
