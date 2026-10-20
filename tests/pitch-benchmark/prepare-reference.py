"""Build the documented nominal PTDB clock; never fit a detector-specific offset.
Original extraction:32mswindow/10mshop. Snack ESPS documentation: first row=half window.
A separate EGG diagnostic and fixed offset-sensitivity report accompany all scores.
"""
import json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];folder=ROOT/'outputs/pitch-benchmark/ptdb';doc=json.loads((folder/'decoded.json').read_text());doc.update(timingVerified=True,timing=dict(hop=.01,tolerance=.0081,transitionMask=.03),referenceOrigin=.016,timingEvidence={'extraction':'https://www2.spsc.tugraz.at/databases/PTDB-TUG/DOCUMENTATION/PTDB-TUG_REPORT.pdf','snackManual':'https://npg.dl.ac.uk/MIDAS/manual/ActiveTcl8.4.4.0-html/snack/tcl-man.html','meaning':'documented nominal analysis centre, not an assertion of millisecond-accurate vocal-fold boundaries;32mswindow smooths time-varying pitch','sensitivityOrigins':[0,.016,.032],'audit':'outputs/pitch-benchmark/ptdb/timing-audit.json'})
for c in doc['clips']:
 item=c['files']['ref'];b=(ROOT/item['file']).read_bytes();assert hashlib.sha256(b).hexdigest()==item['sha256'];values=[float(line.split()[0]) for line in b.decode().strip().splitlines()];rows=[dict(time=.016+i*.01,hz=hz) for i,hz in enumerate(values)];target=folder/'reference'/(c['id']+'.json');target.parent.mkdir(exist_ok=True);data=json.dumps(rows).encode();target.write_bytes(data);c.update(reference=str(target.relative_to(ROOT)),referenceSha256=hashlib.sha256(data).hexdigest())
(folder/'scoring-manifest.json').write_text(json.dumps(doc,indent=2));print(f"Prepared{len(doc['clips'])}references at nominal16msorigin")
