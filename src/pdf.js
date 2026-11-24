import regularUrl from './assets/Archivo-Regular.ttf?url';
import boldUrl from './assets/Archivo-Bold.ttf?url';
import { dateLabel, responsible, roles, statusLabel } from './format.js';

let fonts;
async function loadFont(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error('Could not load the PDF typeface.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    text += String.fromCharCode(...bytes.subarray(offset,offset+8192));
  }
  return btoa(text);
}

export async function makePdf(data) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const landscape = data.orientation === 'landscape';
  const pdf = new jsPDF({orientation:data.orientation, format:'a4'});
  fonts ??= Promise.all([loadFont(regularUrl),loadFont(boldUrl)]).catch(error => {
    fonts = undefined;
    throw error;
  });
  const [regular,bold] = await fonts;
  pdf.addFileToVFS('Archivo-Regular.ttf',regular);
  pdf.addFileToVFS('Archivo-Bold.ttf',bold);
  pdf.addFont('Archivo-Regular.ttf','Archivo','normal');
  pdf.addFont('Archivo-Bold.ttf','Archivo','bold');
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 13;
  const body = data.actions.map(action => {
    const title = action.id+'\n'+action.title;
    const owner = action.team+'\n'+action.owner;
    const dates = ['Raised '+dateLabel(action.raised), action.due && 'Due '+dateLabel(action.due),
      action.closed && 'Closed '+dateLabel(action.closed)].filter(Boolean).join('\n');
    const raci = roles.map(([key,label]) => {
      const value = key === 'responsible' ? responsible(action) : action[key];
      return value ? label+'  '+value : '';
    }).filter(Boolean).join('\n');
    if (landscape) return [title,owner,dates,action.issue,raci,action.comment,statusLabel(action)];
    const details = [title,action.issue && 'Issue  '+action.issue,action.comment && 'Comment  '+action.comment,raci].filter(Boolean).join('\n');
    return [details,owner,statusLabel(action)+'\n'+dates];
  });
  const headings = landscape ? ['Action','Team / owner','Dates','Issue','RACI','Comment','Status'] :
    ['Action and review notes','Team / owner','Dates / status'];
  const widths = landscape ? [43,32,36,44,43,45,28] : [98,40,46];
  pdf.setTextColor('#201e1d');
  pdf.setFont('Archivo','bold');
  pdf.setFontSize(21);
  const title = pdf.splitTextToSize(data.title,width-2*margin);
  pdf.text(title,margin,22);
  const line = 23+title.length*8;
  pdf.setFont('Archivo','normal');
  pdf.setFontSize(9);
  const metadata = pdf.splitTextToSize(data.team+'  /  '+dateLabel(data.date)+'  /  '+data.actions.length+' actions',width-2*margin);
  pdf.text(metadata,margin,line);
  const divider = line+metadata.length*4;
  pdf.setDrawColor('#ae1800').setLineWidth(0.7).line(margin,divider,width-margin,divider);
  autoTable(pdf,{
    head:[headings],body:body.length ? body : [[{content:'No actions in this report.',colSpan:headings.length}]],
    startY:divider+5, margin:{top:17,bottom:18,left:margin,right:margin},
    theme:'striped', styles:{font:'Archivo',fontSize:9,cellPadding:2.5,textColor:'#201e1d',overflow:'linebreak'},
    columnStyles:Object.fromEntries(widths.map((cellWidth,index)=>[index,{cellWidth}])),
    headStyles:{fillColor:'#ae1800',textColor:'#ffffff'},
    alternateRowStyles:{fillColor:'#f3f2f2'}, rowPageBreak:'avoid'
  });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setTextColor('#444141').setFontSize(9).setFont('Archivo','normal');
    pdf.text('ACTION REVIEW',margin,11);
    pdf.setDrawColor('#605d5d').setLineWidth(0.3).line(margin,height-13,width-margin,height-13);
    pdf.text('Action register  /  '+dateLabel(data.date),margin,height-8);
    pdf.text('Page '+page+' of '+pages,width-margin,height-8,{align:'right'});
  }
  return pdf.output('blob');
}
