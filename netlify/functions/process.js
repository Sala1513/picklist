const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const pdfParse = require("pdf-parse");
const XLSX = require("xlsx");

exports.handler = async (event) => {

if(event.httpMethod==="GET"){
return{statusCode:200,body:"Backend Ready"};
}

try{

/* ---------- BODY DECODE ---------- */
const body = Buffer.from(event.body,"base64").toString("binary");

/* ---------- MULTIPART SPLIT ---------- */
const boundary = event.headers["content-type"].split("boundary=")[1];
const parts = body.split(boundary);

function getFile(name){
const part = parts.find(p=>p.includes(`name="${name}"`));
if(!part) return null;
return Buffer.from(part.split("\r\n\r\n")[1].trim(),"binary");
}

const pdfBuffer = getFile("pdf");
const mapBuffer = getFile("map");

if(!pdfBuffer || !mapBuffer){
return{statusCode:400,body:"Files not received"};
}

/* ---------- READ MAPPING ---------- */
function readMapping(buffer){

/* try excel */
try{
const wb = XLSX.read(buffer,{type:"buffer"});
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet,{header:1});

const map={};

rows.forEach(r=>{
if(!r[0]) return;
const line=String(r[0]).trim();
if(line.includes("=")){
const [o,s]=line.split("=");
map[o.trim()]=s.trim();
}
});

if(Object.keys(map).length>0) return map;
}catch(e){}

/* fallback text */
const map={};
buffer.toString().split(/\r?\n/).forEach(line=>{
const [o,s]=line.split("=");
if(o&&s) map[o.trim()]=s.trim();
});
return map;
}

const mapping = readMapping(mapBuffer);

/* ---------- LOAD PDF ---------- */
const parsed = await pdfParse(pdfBuffer);

/* ---------- PAGE SPLIT (FIXED) ---------- */
const pageTexts = parsed.text
.split(/Page Nbr\s*\d+/gi)
.filter(t=>t.trim()!="");

/* ---------- ORIGINAL PDF ---------- */
const original = await PDFDocument.load(pdfBuffer);
const newPdf = await PDFDocument.create();
const font = await newPdf.embedFont(StandardFonts.Helvetica);

const groups={};

/* ---------- GROUP BY SHIPMENT ---------- */
for(let i=0;i<pageTexts.length;i++){

const match = pageTexts[i].match(/MBR_\d+/);
const order = match ? match[0] : "UNKNOWN";
const ship = mapping[order] || "NO_SHIPMENT";

if(!groups[ship]) groups[ship]=[];
groups[ship].push(i);
}

/* ---------- SORT SHIPMENTS ---------- */
const sortedShips = Object.keys(groups).sort();

/* ---------- BUILD OUTPUT PDF ---------- */
for(const ship of sortedShips){

for(const pageIndex of groups[ship]){

const [page] = await newPdf.copyPages(original,[pageIndex]);
const {width} = page.getSize();

/* left footer */
page.drawText(ship,{
x:20,
y:15,
size:10,
font,
color:rgb(0,0,0)
});

/* right footer */
page.drawText(ship,{
x:width-120,
y:15,
size:10,
font,
color:rgb(0,0,0)
});

newPdf.addPage(page);
}
}

/* ---------- SAVE ---------- */
const bytes = await newPdf.save({
useObjectStreams:true,
compress:true
});
/* ---------- RESPONSE ---------- */
return{
statusCode:200,
headers:{ "Content-Type":"application/pdf" },
body:Buffer.from(bytes).toString("base64"),
isBase64Encoded:true
};

}catch(err){
return{
statusCode:500,
body:"SERVER ERROR:\n"+err.toString()
};
}
};
