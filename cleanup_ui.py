import sys

def remove_blocks(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    out_lines = []
    skip = False
    
    for i, line in enumerate(lines):
        # Remove patterns import
        if 'import { PatternPreview }' in line: continue
        
        # Remove segmentPatternPickers state
        if 'const [segmentPatternPickers, setSegmentPatternPickers]' in line: continue
        if 'const [globalPatternPickerOpen, setGlobalPatternPickerOpen]' in line: continue
        
        # Start skipping Global Pattern Picker
        if 'GLOBAL PATTERN PICKER' in line:
            skip = True
            continue
            
        # End skipping Global Pattern Picker
        if skip and '<button' in line and 'handleApplyToAll' in line:
            skip = False
            
        # Start skipping Segment Pattern picker button
        if '<button' in line and 'setSegmentPatternPickers' in line:
            skip = True
            
        if skip and 'title="Apply Pattern"' in line:
            continue
        if skip and '</button>' in line and 'title="Apply Pattern"' not in lines[i-1]:
            # This is naive, let's just use string find for the segment pattern button
            pass
            
            
    # That approach string matching is risky for TSX. Let's use pure string replace on the whole text instead.

import re
with open('components/LayersPanel/LayersPanel.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove PatternPreview import
content = re.sub(r"import \{ PatternPreview \} from '\.\./Viewport/PatternPreview';\n?", "", content)

# Remove states
content = re.sub(r"const \[segmentPatternPickers.*?;\n?", "", content)
content = re.sub(r"const \[globalPatternPickerOpen.*?;\n?", "", content)

# Remove Global Pattern Picker block
content = re.sub(r"\{\/\* GLOBAL PATTERN PICKER \*\/\}[\s\S]*?(?=<button[\s\n]*onClick=\{handleApplyToAll\})", "", content)

# Remove Segment Pattern Button in Advance Slice
segment_btn_pattern = r"<button[\s\n]*onClick=\{[^}]*setSegmentPatternPickers[\s\S]*?<\/button>"
content = re.sub(segment_btn_pattern, "", content)

# Remove Segment Pickers panel
segment_picker_panel = r"\{segmentPatternPickers\[segment\.id\] && \([\s\S]*?\}\)\}\s*<\/div>\s*\)\}"
content = re.sub(segment_picker_panel, "", content)

# Remove Segment modifiers display block
mod_display_block = r"\{\/\* Segment Pattern Display if exists \*\/\}[\s\S]*?Remove\s*<\/button>\s*<\/div>\s*\)\}"
content = re.sub(mod_display_block, "", content)

# Remove patterns from Props
content = re.sub(r"patterns: import\('\.\./\.\./types'\)\.Pattern\[\];\n?", "", content)
content = re.sub(r"onUpdateModifiers: \(modifiers: any\[\]\) => void;\n?", "", content)

# Remove from destructured props
content = re.sub(r"onUpdateModifiers,\n?", "", content)
content = re.sub(r"patterns\n?", "", content)  # Might leave a hanging comma if last, but we'll see


with open('components/LayersPanel/LayersPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("UI cleanup done.")
