"""Descriptive pixels with timing/threshold sensitivity; never detector ground truth."""
import bisect,json,pathlib,sys
from PIL import Image

def pixels(im,app,bounds=None):
 w,h=im.size
 if app=='voice-tools':
  if (w,h)!=(1051,820):raise ValueError('Use the documented fixed native window size')
  left,right,top,bottom=4,w-2,33,737
 else:
  b=bounds;left,right,top,bottom=b['x']+48,b['x']+b['width']-15,b['y']+34,b['y']+b['height']-28
  if left<0 or right>w or top<0 or bottom>h:raise ValueError('Screenshot/canvas coordinate mismatch')
 line=[];marker=[]
 for y in range(int(top)+2,int(bottom)-2):
  for x in range(int(left)+1,int(right)-1):
   r,g,b=im.getpixel((x,y))
   if app=='voice-tools':a=r>190 and g<90 and b<90;c=b>170 and r<90 and g<120
   else:a=r>170 and 90<g<190 and b<150;c=r>180 and g>210 and b>230 and b>r+12
   if a:line.append(x)
   if c:marker.append(x)
 return left,right,sorted(line),sorted(marker)

def count_roi(data,seconds,tail):
 left,right,line,marker=data;width=right-left
 start=max(left,left+width*(1-(seconds+tail)/10))+3;end=min(right,right-width*tail/10)-3
 if end<=start:return {'line':0,'marker':0}
 return {name:bisect.bisect_left(xs,end)-bisect.bisect_left(xs,start) for name,xs in [('line',line),('marker',marker)]}

def classify(data,seconds,tail,interval):
 counts=count_roi(data,seconds,tail)
 # ±1 s display-alignment sweep, plus both actual screenshot clock bounds.
 totals=[sum(count_roi(data,seconds,t+shift).values()) for t in interval for shift in [-1,-.5,0,.5,1]]
 outcomes={n>=threshold for n in totals for threshold in [3,6,12]}
 robust='sensitive' if len(outcomes)>1 else ('visible' if True in outcomes else 'none')
 return {**counts,'visible':sum(counts.values())>=3,'robust':robust,'sweepPixelRange':[min(totals),max(totals)]}

def run_score(root):
 run=json.loads((root/'run.json').read_text());capture=json.loads((root/'captures.json').read_text());by={r['id']:r for r in capture['rows']};results=[]
 if capture['runId']!=run['runId'] or len(by)!=len(capture['rows']):raise ValueError('Stale or duplicate captures')
 for clip in run['clips']:
  row=by.get(clip['id']);valid=capture.get('clockVersion')==2 and row is not None and not row['late']
  if row and row['pcmSha256']!=clip['pcmSha256']:raise ValueError('Changed PCM input')
  result={'id':clip['id'],'valid':valid}
  if valid:
   for name,field,delay in [('voice-tools','native',0),('soundglow','soundglow',.3)]:
    interval=row.get(field+'Interval',[])
    if len(interval)!=2 or interval[1]<interval[0] or interval[1]-interval[0]>.6:raise ValueError('Unbounded screenshot timing')
    end=row.get('clipEnd',clip['end']);tails=[t-delay-end for t in interval];tail=row[field+'At']-delay-end
    im=Image.open(root/'live'/f"{clip['id']}-{name}.png").convert('RGB')
    data=pixels(im,name,row.get('bounds'));result[name]=classify(data,clip['seconds'],tail,tails)
    left,right=data[:2];width=right-left
    b=row.get('bounds',{});top,bottom=(33,737) if name=='voice-tools' else (b['y']+34,b['y']+b['height']-28)
    result[name]['roi']=[max(left,left+width*(1-(clip['seconds']+tail)/10))+3,top+2,min(right,right-width*tail/10)-3,bottom-2]
    result[name]['imageSize']=list(im.size)
  results.append(result)
 control=results[0];valid=all(r['valid'] for r in results) and all(control.get(app,{}).get('robust')=='visible' for app in ['voice-tools','soundglow'])
 output={'runId':run['runId'],'valid':valid,'endpoint':'visible pixels; bracketed capture, ±1 s alignment and 3/6/12 pixel sensitivity; no calibrated latency or reference F0','rows':results}
 (root/'image-results.json').write_text(json.dumps(output,indent=2));return output

if __name__=='__main__':
 result=run_score(pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'outputs/pitch-comparison'));print('Valid capture run:',result['valid']);print([(r['id'],r.get('voice-tools',{}).get('robust'),r.get('soundglow',{}).get('robust')) for r in result['rows']])
