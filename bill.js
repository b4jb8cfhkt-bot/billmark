function normalize(input){
  const s=String(input||"").toUpperCase().replace(/\s+/g,"");
  const m=s.match(/^(AB|SB|ACR|AJR|ACA|SCR|SJR|SCA|HR|SR|HCR|HJR)(\d+)$/);
  if(!m) throw new Error("Enter a California bill number, such as AB 222.");
  return {house:m[1],number:m[2]};
}
function text(html){
  return html
   .replace(/<script[\s\S]*?<\/script>/gi," ")
   .replace(/<style[\s\S]*?<\/style>/gi," ")
   .replace(/<[^>]+>/g," ")
   .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&")
   .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
   .replace(/\s+/g," ").trim();
}
function between(t,a,b){
  const i=t.indexOf(a); if(i<0)return "";
  const rest=t.slice(i+a.length);
  const j=b?rest.indexOf(b):rest.length;
  return rest.slice(0,j<0?rest.length:j).trim();
}
export default async function handler(req,res){
  try{
    const {house,number}=normalize(req.query?.bill);
    const billId="20252026"+house+number;
    const official=`https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=${billId}`;
    const r=await fetch(official,{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0 BillMark/1.0","Accept":"text/html"}});
    if(!r.ok) return res.status(404).json({error:`California's site returned ${r.status} for ${house} ${number}.`});
    const html=await r.text();
    const t=text(html);
    if(!t.includes("CALIFORNIA LEGISLATURE") && !t.includes(`${house}-${number}`)){
      return res.status(404).json({error:`I couldn't find ${house} ${number} in the 2025–26 California legislative record.`});
    }
    const header=between(t,`${house}-${number}`,`Text >>`);
    const digestStart=t.indexOf("LEGISLATIVE COUNSEL'S DIGEST");
    const digest=digestStart>=0?t.slice(digestStart+32,digestStart+2600):"";
    const intro=between(t,"Introduced by ","CALIFORNIA LEGISLATURE");
    const amended=t.match(/Amended\s+(?:IN\s+)?(?:Assembly|Senate)\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}/i);
    const title=(header.match(new RegExp(`${house}-${number}\\s+(.+?)\\(2025-2026\\)`,"i"))||[])[1] || "California legislation";
    const summary=digest.replace(/\s+/g," ").slice(0,1500);
    res.status(200).json({
      id:billId,number:`${house} ${number}`,title:title.trim(),
      author:intro.trim().slice(0,240),
      status:amended?amended[0]:"See official record",
      summary:summary || "Official bill text found. BillMark's plain-English interpretation is the next layer.",
      change:"The official record includes the bill's amendment history. BillMark's next layer will compare those published versions and explain what materially changed.",
      sourceUrl:official
    });
  }catch(e){
    console.error(e);
    res.status(500).json({error:"BillMark couldn't reach the California legislative record. Please try again."});
  }
}