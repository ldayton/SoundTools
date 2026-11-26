from pathlib import Path
from pypdf import PdfReader,PdfWriter
import hashlib,json,argparse
ap=argparse.ArgumentParser();ap.add_argument("work");ap.add_argument("output");args=ap.parse_args()
work=Path(args.work)
root=Path(args.output)
reports={}
for name,count in [('piano-fingering-independent.pdf',12),('piano-fingering-comparison.pdf',100)]:
 p=root/name;r=PdfReader(p);fields=r.get_fields() or {};textfields={k:v for k,v in fields.items() if v.get('/FT')=='/Tx'}
 assert len(r.pages)==9
 assert len(textfields)==count,(name,len(textfields))
 assert all(v.get('/V') in (None,'') for v in textfields.values()),'Unsolicited filled response'
 widgets=[]
 for pi,page in enumerate(r.pages):
  for ref in page.get('/Annots',[]):
   widget=ref.get_object()
   if widget.get('/Subtype')!='/Widget':continue
   chain=[];node=widget
   while node:
    if '/T' in node:chain.append(str(node['/T']))
    parent=node.get('/Parent');node=parent.get_object() if parent else None
   fullname='.'.join(reversed(chain));assert fullname in textfields,fullname
   appearance=widget.get('/AP');assert appearance and appearance.get('/N'),fullname
   normal=appearance['/N'].get_object();assert len(normal.get_data())>0,fullname
   rect=widget['/Rect'];assert rect[0]>=0 and rect[1]>=0 and rect[2]<=page.mediabox.width and rect[3]<=page.mediabox.height
   widgets.append(fullname)
 assert len(widgets)==count and len(set(widgets))==count
 text='\n'.join(page.extract_text() for page in r.pages)
 for forbidden in ('lumikey','classic','constrained','neural','beam6'):
  assert forbidden not in text.lower(),forbidden
 for i in range(1,9):assert f'P{i:02d}' in text
 reports[name]={'pages':len(r.pages),'fields':count,'widgets':len(widgets),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
key=root/'piano-fingering-organizer-key.pdf';rk=PdfReader(key);assert len(rk.pages)==1 and not rk.get_fields()
reports[key.name]={'pages':1,'sha256':hashlib.sha256(key.read_bytes()).hexdigest()}
# A disposable copy proves an independent PDF implementation can fill fields.
writer=PdfWriter();writer.clone_document_from_reader(PdfReader(root/'piano-fingering-comparison.pdf'))
writer.update_page_form_field_values(None,{'P01.A.comfort':'4','P01.notes':'FORM CHECK - not a teacher rating'},auto_regenerate=False)
writer.write(work/'form-smoke.pdf')
check=PdfReader(work/'form-smoke.pdf').get_fields();assert check['P01.A.comfort']['/V']=='4';assert check['P01.notes']['/V']=='FORM CHECK - not a teacher rating'
(work/'pdf-verification.json').write_text(json.dumps(reports,indent=2)+'\n');print(json.dumps(reports,indent=2))
