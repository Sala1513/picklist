const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const pdfParse = require("pdf-parse");

exports.handler = async (event) => {

if(event.httpMethod==="GET"){
return{statusCode:200,body:"Backend Ready"};
}

try{

const boundary = event.headers["content-type"].split("boundary=")[1];
const parts = event.body.split(boundary);

function getFile(name){
const part = parts.find(p=>p.includes(`name="${name}"`));
return Buffer.from(part.split("\r\n\r\n")[1].trim(),"binary");
}

const pdfBuffer = getFile("pdf");
const mapBuffer = getFile("map");

/* MAPPING */
const mapping={};
mapBuffer.toString().split(/\r?\n/).forEach(line=>{
const [o,s]=line.split("=");
if(o&&s) mapping[o.trim()]=s.trim();
});

/* READ PDF */
const parsed = await pdfParse(pdfBuffer);
const textPages = parsed.text.split("\f");

const original = await PDFDocument.load(pdfBuffer);
const newPdf = await PDFDocument.create();
const font = await newPdf.embedFont(StandardFonts.Helvetica);

const groups={};

/* GROUP */
for(let i=0;i<textPages.length;i++){

const match=textPages[i].match(/MBR_\d+/);
const order=match?match[0]:"UNKNOWN";
const ship=mapping[order]||"NO_SHIPMENT";

if(!groups[ship]) groups[ship]=[];
groups[ship].push(i);
}

/* SORT */
const sorted=Object.keys(groups).sort();

/* BUILD PDF */
for(const ship of sorted){
for(const index of groups[ship]){

const [page]=await newPdf.copyPages(original,[index]);
const {width}=page.getSize();

page.drawText(ship,{x:20,y:15,size:10,font,color:rgb(0,0,0)});
page.drawText(ship,{x:width-120,y:15,size:10,font,color:rgb(0,0,0)});

newPdf.addPage(page);
}
}

const bytes=await newPdf.save();

return{
statusCode:200,
headers:{ "Content-Type":"application/pdf" },
body:Buffer.from(bytes).toString("base64"),
isBase64Encoded:true
};

}catch(err){
return{statusCode:500,body:err.toString()};
}
};
