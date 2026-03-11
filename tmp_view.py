from pathlib import Path 
lines=Path(r'grengame-frontend/src/components/Topbar.tsx').read_text().splitlines() 
import itertools 
for i,line in enumerate(lines,1): 
