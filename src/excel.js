import { dateLabel, escapeHTML, responsible, statusLabel } from './format.js';

const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const sheetNS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const packageNS = 'http://schemas.openxmlformats.org/package/2006';
const relationNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xml = content => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+content;
const xmlText = value => escapeHTML(String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/_x[\da-fA-F]{4}_/g,match => '_x005F_'+match.slice(1)));
export function workbook(data) {
  if (data.actions.length > 1048571) throw Error('This report exceeds Excel’s row limit.');
  const columns = [
    ['ID',13,a=>a.id],['Action',35,a=>a.title],['Team',19,a=>a.team],['Owner',19,a=>a.owner],
    ['Date raised',13,a=>a.raised,true],['Due date',13,a=>a.due,true],['Status',18,statusLabel],
    ['Issue / context',37,a=>a.issue],['Responsible',19,responsible],['Accountable',19,a=>a.accountable],
    ['Consulted',20,a=>a.consulted],['Informed',20,a=>a.informed],['Latest comment',37,a=>a.comment],['Date closed',13,a=>a.closed,true]
  ];
  const end = 'N';
  const cell = (value,column,row,style,date=false) => {
    const ref = String.fromCharCode(65+column)+row;
    if (date && value && value >= '1900-01-01') {
      const serial = (Date.parse(value)-Date.UTC(1899,11,31))/86400000 + Number(value >= '1900-03-01');
      return '<c r="'+ref+'" s="'+style+'"><v>'+serial+'</v></c>';
    }
    return '<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+xmlText(value)+'</t></is></c>';
  };
  const row = (index,contents,height) => '<row r="'+index+'" ht="'+height+'" customHeight="1">'+contents+'</row>';
  const first = row(1,cell(data.title,0,1,1),30)+row(2,cell(data.team+'  ·  '+dateLabel(data.date)+'  ·  '+data.actions.length+' actions',0,2,2),23)+row(4,columns.map(([label],i)=>cell(label,i,4,3)).join(''),25);
  const rows = data.actions.map((action,index) => {
    const number = index+5;
    const values = columns.map(([,width,read,date])=>({width,value:read(action),date}));
    const lines = Math.max(...values.map(({width,value}) => value.split('\n').reduce((count,line)=>count+Math.max(1,Math.ceil(line.length/(width*.85))),0)));
    return row(number,values.map(({value,date},i)=>cell(value,i,number,date ? 6+index%2 : 4+index%2,date)).join(''),Math.min(405,Math.max(23,lines*15+7)));
  }).join('');
  const last = 4+data.actions.length;
  const worksheet = xml('<worksheet xmlns="'+sheetNS+'"><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>'+
    columns.map(([,width],i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+width+'" customWidth="1"/>').join('')+
    '</cols><sheetData>'+first+rows+'</sheetData><autoFilter ref="A4:'+end+last+'"/><mergeCells count="2"><mergeCell ref="A1:'+end+'1"/><mergeCell ref="A2:'+end+'2"/></mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.55" bottom="0.55" header="0.2" footer="0.25"/><pageSetup paperSize="9" orientation="'+data.orientation+'" fitToWidth="'+(data.orientation === 'portrait' ? 2 : 1)+'" fitToHeight="0"/><headerFooter><oddHeader>&amp;LAction Review&amp;R'+data.date+'</oddHeader><oddFooter>&amp;LAction register&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter></worksheet>')
    .replace('<sheetViews>','<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews>');
  const font = (size,color,bold=false) => '<font>'+(bold?'<b/>':'')+'<sz val="'+size+'"/><color rgb="FF'+color+'"/><name val="Calibri"/></font>';
  const fill = color => '<fill><patternFill patternType="solid"><fgColor rgb="FF'+color+'"/><bgColor indexed="64"/></patternFill></fill>';
  const style = (fontId,fillId,numFmtId=0) => '<xf numFmtId="'+numFmtId+'" fontId="'+fontId+'" fillId="'+fillId+'" borderId="0" xfId="0" applyAlignment="1" applyFont="1" applyFill="1" applyNumberFormat="1"><alignment vertical="center" wrapText="1"/></xf>';
  const styles = xml('<styleSheet xmlns="'+sheetNS+'"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd mmm yyyy"/></numFmts><fonts count="4">'+font(11,'202B25')+font(19,'AE1800',true)+font(11,'605D5D')+font(11,'FFFFFF',true)+'</fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+fill('AE1800')+fill('F3F2F2')+'</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8">'+style(0,0)+style(1,0)+style(2,0)+style(3,2)+style(0,0)+style(0,3)+style(0,0,164)+style(0,3,164)+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
  const rels = entries => xml('<Relationships xmlns="'+packageNS+'/relationships">'+entries.map(([type,target],i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+relationNS+'/'+type+'" Target="'+target+'"/>').join('')+'</Relationships>');
  const types = [['workbook','sheet.main'],['styles','styles'],['worksheets/sheet1','worksheet']];
  const book = xml('<workbook xmlns="'+sheetNS+'" xmlns:r="'+relationNS+'"><sheets><sheet name="Actions" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">Actions!$4:$4</definedName><definedName name="_xlnm.Print_Area" localSheetId="0">Actions!$A$1:$'+end+'$'+last+'</definedName></definedNames></workbook>');
  return zip({
    '[Content_Types].xml':xml('<Types xmlns="'+packageNS+'/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+types.map(([part,type])=>'<Override PartName="/xl/'+part+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.'+type+'+xml"/>').join('')+'</Types>'),
    '_rels/.rels':rels([['officeDocument','xl/workbook.xml']]),
    'xl/workbook.xml':book,
    'xl/_rels/workbook.xml.rels':rels([['worksheet','worksheets/sheet1.xml'],['styles','styles.xml']]),
    'xl/worksheets/sheet1.xml':worksheet,
    'xl/styles.xml':styles
  });
}
// XLSX is a ZIP archive of XML parts. Stored entries keep the file dependency-free.
function zip(parts) {
  const encoder = new TextEncoder();
  const table = Array.from({length:256},(_,value) => {
    for (let bit=0;bit<8;bit++) value = (value>>>1) ^ (value&1 ? 0xedb88320 : 0);
    return value;
  });
  const files = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;
  function record(size,write) {
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    write((at,value)=>view.setUint16(at,value,true),(at,value)=>view.setUint32(at,value,true));
    return bytes;
  }
  for (const [path,content] of Object.entries(parts)) {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc>>>8) ^ table[(crc^byte)&255];
    crc ^= 0xffffffff;
    const local = record(30,(short,long)=>{
      long(0,0x04034b50); short(4,20); short(12,33); long(14,crc);
      long(18,data.length); long(22,data.length); short(26,name.length);
    });
    const central = record(46,(short,long)=>{
      long(0,0x02014b50); short(4,20); short(6,20); short(14,33); long(16,crc);
      long(20,data.length); long(24,data.length); short(28,name.length); long(42,offset);
    });
    files.push(local,name,data);
    directory.push(central,name);
    offset += local.length+name.length+data.length;
    directorySize += central.length+name.length;
  }
  const entries = directory.length/2;
  const end = record(22,(short,long)=>{
    long(0,0x06054b50); short(8,entries); short(10,entries); long(12,directorySize); long(16,offset);
  });
  return new Blob([...files,...directory,end],{type:xlsx});
}
