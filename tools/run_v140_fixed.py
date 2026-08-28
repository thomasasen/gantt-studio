from pathlib import Path

patch_path = Path('tools/apply_v140.py')
source = patch_path.read_text(encoding='utf-8')
old = "b = text.index('\\nfunction renderLegend()', a)"
new = "b = text.index('\\nfunction filteredBaseTasks()', a)"
if old not in source:
    raise SystemExit('Expected renderMetrics patch anchor was not found.')
source = source.replace(old, new, 1)

# The current v1.3 gantt renderer already normalizes dates through an
# intermediate variable. Convert that one function temporarily to the
# equivalent form expected by the prepared v1.4 patch; the patch then adds
# its return value and the new relative/status line behavior.
gantt_path = Path('assets/js/gantt.js')
gantt = gantt_path.read_text(encoding='utf-8')
current_vertical = "function addVerticalLine(parent,start,px,date,lineClass,labelClass,label,width,height,color){const y=date instanceof Date?date:new Date(date);const utc=new Date(Date.UTC(y.getUTCFullYear(),y.getUTCMonth(),y.getUTCDate()));const pos=Math.floor((utc-start)/DAY)*px;if(pos<0||pos>width)return;const line=el('div',lineClass);line.style.left=`${pos}px`;line.style.top='56px';line.style.height=`${height-56}px`;if(color)line.style.borderLeftColor=color;const lab=el('span',labelClass,label);if(color)lab.style.color=color;line.appendChild(lab);parent.appendChild(line);}\n"
expected_vertical = "function addVerticalLine(parent,start,px,date,lineClass,labelClass,label,width,height,color){const utc=new Date(Date.UTC(date.getUTCFullYear?.()??date.getFullYear(),date.getUTCMonth?.()??date.getMonth(),date.getUTCDate?.()??date.getDate()));const pos=Math.floor((utc-start)/DAY)*px;if(pos<0||pos>width)return;const line=el('div',lineClass);line.style.left=`${pos}px`;line.style.top='56px';line.style.height=`${height-56}px`;if(color)line.style.borderLeftColor=color;const lab=el('span',labelClass,label);if(color)lab.style.color=color;line.appendChild(lab);parent.appendChild(line);}\n"
if current_vertical not in gantt:
    raise SystemExit('Expected current addVerticalLine implementation was not found.')
gantt_path.write_text(gantt.replace(current_vertical, expected_vertical, 1), encoding='utf-8')

exec(compile(source, str(patch_path), 'exec'), {'__name__': '__main__'})
