function normalize(input){
 const s=String(input||"").toUpperCase().replace(/\s+/g,"");
 const m=s.match(/^(AB|SB|ACR|AJR|ACA|SCR|SJR|SCA|HR|SR|HCR|HJR)(\d+)$/);
 if(!m) throw new Error("Enter a California bill number, such as AB 222 or SB 123.");
 return {house:m[1],number:m[2]};
}
function strip(s){
 return s.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")
 .replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
}
function pick(re,t){const m=t.match(re);return m?m[1].trim():""}
export default async function handler(req,res){
 try{
  const {house,number}=normalize(req.query?.bill);
  const session="20252026";
  const id=`${session}${house}${number}`;
  const url=`https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=${id}`;
  const r=await fetch(url,{headers:{"User-Agent":"BillMark/0.1"}});
  const html=await r.text();
  if(!r.ok || !/Bill Text|LEGISLATIVE COUNSEL'S DIGEST|California Legislature/i.test(html)) return res.status(404).json({error:`I couldn't find ${house} ${number} in the 2025–26 California legislative record.`});
  const t=strip(html);
  const title=pick(/(?:AB|SB|ACR|AJR|ACA|SCR|SJR|SCA|HR|SR|HCR|HJR)-?\s*\d+\s+(.+?)\s*\(2025-2026\)/i,t)||"California legislation";
  const author=pick(/Introduced by\s+(.+?)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+2025/i,t);
  const published=pick(/Date Published:\s*([0-9/]+\s+[0-9:AMP]+)/i,t);
  const status=pick(/(?:Current Status|Status)[\s:]+(.{0,180}?)(?:Bill Text|Votes|History|Bill Analysis|$)/i,t);
  const digestAt=t.indexOf("LEGISLATIVE COUNSEL'S DIGEST");
  let digest=digestAt>=0?t.slice(digestAt,digestAt+4200):"";
  digest=digest.replace(/~~/g,"").trim();
  const change=/~~/.test(html)?"The current version contains amendments to earlier language. BillMark will compare versions to identify the changes that matter.":"BillMark will compare published versions as the bill is amended.";
  res.status(200).json({
   id,number:`${house} ${number}`,title,author,
   status:status||"See official record",updated:published?`Official record published ${published}`:"",
   summary:digest?digest.slice(0,1500):"The official record is available. BillMark's plain-English interpretation layer is next.",
   change,sourceUrl:url
  });
 }catch(e){res.status(400).json({error:e.message})}
}