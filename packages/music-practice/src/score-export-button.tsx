import {ControlIcon} from "@ldayton/ui/control-icon";
import {useEffect,useRef,useState} from 'react';
import {Button,Popover,Stack,Text} from '@mantine/core';
import {useMediaQuery} from '@mantine/hooks';
import {MOBILE_SONGALONG_QUERY} from './songalong-capabilities';
import {prepareScoreExport,printScore,scorePdf,saveScorePdf,type ScoreExportSource,type ScorePaper} from './score-export';
export function ScoreExportButton({source}:{source():ScoreExportSource|undefined}) {
  const mobile=useMediaQuery(MOBILE_SONGALONG_QUERY);
  const generation=useRef(0);
  useEffect(()=>()=>{generation.current++;},[]);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [files,setFiles]=useState<Partial<Record<ScorePaper,File>>>({});
  async function prepare() {
    const snapshot=source();if(!snapshot){setError('The score is not ready yet.');return;}
    const token=++generation.current;
    setOpen(true);setBusy(true);setFiles({});setError('');
    try {const mobile=await scorePdf(await prepareScoreExport(snapshot,'mobile'));const desktop=await scorePdf(await prepareScoreExport(snapshot,'desktop'));if(token===generation.current)setFiles({mobile,desktop});}
    catch(e){if(token===generation.current)setError(e instanceof Error?e.message:'Could not prepare the PDF.');}finally{if(token===generation.current)setBusy(false);}
  }
  function print() {
    const snapshot=source();if(!snapshot)return;
    const target=window.open('','_blank');if(!target){setError('Allow the print window to open, then try again.');return;}
    target.document.body.textContent='Preparing score…';setBusy(true);setError('');
    prepareScoreExport(snapshot,'desktop').then(score=>printScore(score,target)).catch(e=>{target.close();setError(e.message);}).finally(()=>setBusy(false));
  }
  async function save(paper:ScorePaper){try{await saveScorePdf(files[paper]!);setOpen(false);}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setError('Could not save the PDF. Please try again.');}}
  return <Stack gap={4}>
    {mobile?<Popover opened={open} onChange={setOpen} position="bottom" withinPortal>
      <Popover.Target><Button variant="default" onClick={()=>{if(open)setOpen(false);else void prepare();}}>Save PDF</Button></Popover.Target>
      <Popover.Dropdown><Stack gap="xs">
        <Text size="sm">PDF size</Text>
        <Button variant="default" disabled={!files.mobile} loading={busy} onClick={()=>void save('mobile')}>Mobile</Button>
        <Button variant="default" disabled={!files.desktop} onClick={()=>void save('desktop')}>Desktop</Button>
        {error&&<Text size="sm" c="red" role="alert">{error}</Text>}
      </Stack></Popover.Dropdown>
    </Popover>:<Button variant="default" leftSection={<ControlIcon name="print" size={18}/>} loading={busy} onClick={print}>Print</Button>}
    {!mobile&&error&&<Text size="sm" c="red" role="alert">{error}</Text>}
  </Stack>;
}
