import re
import sys

with open(r'd:\fff3-main\components\LayersPanel\LayersPanel.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. State Replacement
code = code.replace(
    "const [activeTab, setActiveTab] = useState<'printbed' | 'schedule' | 'mapping' | 'hardware' | 'slicing'>('printbed');",
    "const [activeStep, setActiveStep] = useState<number>(1);"
)

# Replace the start of the return
return_start = """  return (
    <aside className="w-[500px] flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark flex flex-col z-10">
      
      {/* ── STEPPER WIZARD HEADER ── */}
      <div className="flex bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 1, label: 'Environment', icon: 'handyman' },
          { id: 2, label: 'Models', icon: '3d_rotation' },
          { id: 3, label: 'Mapping', icon: 'biotech' },
          { id: 4, label: 'Profile', icon: 'tune' },
          { id: 5, label: 'Slicer', icon: 'layers' }
        ].map(step => (
           <button 
             key={step.id}
             onClick={() => setActiveStep(step.id)} 
             className={`flex-1 py-3 px-1 text-[10px] font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                 activeStep === step.id 
                 ? 'bg-white dark:bg-slate-900 border-b-2 border-primary text-primary shadow-sm' 
                 : 'text-slate-500 hover:text-slate-700 hover:bg-white/50 dark:hover:bg-slate-800/50 border-b-2 border-transparent'}`}
           >
             <Icon name={step.icon} className="text-lg mb-1" />
             <span>{step.label}</span>
           </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4 pb-4">
"""

code = re.sub(r'  return \(\s*<aside[^>]+>\s*<div[^>]+flex-1 overflow-y-auto[^>]+>', return_start, code, count=1)


# Chunk Extractors
def extract_block(pattern):
    match = re.search(pattern, code, re.DOTALL)
    if not match:
        print(f"FAILED TO EXTRACT: {pattern}")
        return ""
    # find balanced braces for the captured div/section
    text = code[match.end():]
    depth = 1 # We assume the pattern passed us just after an opening tag matching the block we want
    end_idx = 0
    for i, c in enumerate(text):
        if c == '{': depth += 1  # naive brace counting won't work perfectly if inside strings, but JSX relies on tags mostly.
        # Let's just use regex for the known end chunks.
        
def get_block_by_regex(start_regex, end_regex):
    match = re.search(start_regex + r'(.*?)' + end_regex, code, re.DOTALL)
    return match.group(0) if match else ""

# ── STEP 2 (Models)
upload_btn = get_block_by_regex(r'\{\/\* Upload Button \*\/\}.{0,50}<div', r'<\/div>\s*<\/div>\s*<\/div>')
models_list = get_block_by_regex(r'\{\/\* Models List \*\/\}.{0,50}<AccordionSection', r'<\/AccordionSection>')

# ── STEP 1 (Environment)
print_bed = get_block_by_regex(r'\{\/\* TAB 1: PRINT BED \*\/\}.*?<AccordionSection title="Surface Configuration".*?>', r'<\/AccordionSection>')
print_bed_heating = get_block_by_regex(r'<AccordionSection title="Heating Bed".*?>', r'<\/AccordionSection>')
hardware = get_block_by_regex(r'\{\/\* TAB 4: HARDWARE \*\/\}.*?<AccordionSection title="Toolhead Hardware".*?>', r'<\/AccordionSection>')

# ── STEP 3 (Mapping)
schedule = get_block_by_regex(r'\{\/\* TAB 2: SCHEDULE \*\/\}.*?{activeTab === \'schedule\' && \(', r'<\/div>\s*\)\}')
mapping = get_block_by_regex(r'\{\/\* TAB 3: MAPPING \*\/\}.*?{activeTab === \'mapping\' && \(', r'<\/div>\s*\)\}')

# ── STEP 4 (Slicing)
slicing = get_block_by_regex(r'\{\/\* TAB 5: SLICING \*\/\}.*?{activeTab === \'slicing\' && \(', r'<\/div>\s*\)\}')

# ── Footer
footer = get_block_by_regex(r'<div className="p-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 bg-surface-light dark:bg-surface-dark">', r'<\/aside>')

# Build the new content
new_content = return_start + f"""
        {{/* STEP 1: ENVIRONMENT */}}
        {{activeStep === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-left-1">
            {print_bed}
            {hardware}
          </div>
        )}}

        {{/* STEP 2: MODELS */}}
        {{activeStep === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-left-1">
            {upload_btn}
            <div className="bg-primary/5 p-3 rounded border border-primary/20 text-primary text-[10px] font-medium">Select a model to configure its Well Assignment below.</div>
            {models_list}
          </div>
        )}}

        {{/* STEP 3: MAPPING */}}
        {{activeStep === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-left-1">
            {schedule.replace("{activeTab === 'schedule' && (", "").replace(')}', '', 1).strip()}
            {mapping.replace("{activeTab === 'mapping' && (", "").replace(')}', '', 1).strip()}
          </div>
        )}}

        {{/* STEP 4: SLICING */}}
        {{activeStep === 4 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-left-1">
            {slicing.replace("{activeTab === 'slicing' && (", "").replace(')}', '', 1).strip()}
          </div>
        )}}
        
        {{/* STEP 5: PREVIEW & SLICE */}}
        {{activeStep === 5 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <Icon name="verified" className="text-6xl text-primary opacity-20" />
                <h3 className="text-lg font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">Ready to slice</h3>
                <p className="text-xs text-slate-500 max-w-sm">All parameters are configured. Generate the G-Code to preview the exact physical trajectory, verify Pore Injection bounds, and print.</p>
            </div>
        )}}

      </div>

      {{/* STEPPER WIZARD FOOTER */}}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between z-10 flex-shrink-0">
          <button 
             disabled={{activeStep === 1}}
             onClick={{() => setActiveStep(s => s - 1)}}
             className="px-4 py-2 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg font-bold text-xs hover:border-slate-300 dark:hover:border-slate-600 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
              â†گ Back
          </button>
          
          {{activeStep < 5 ? (
              <button 
                 onClick={{() => setActiveStep(s => s + 1)}}
                 className="px-6 py-2 bg-primary hover:bg-blue-600 text-white font-bold text-xs rounded-lg shadow-sm shadow-primary/30 transition-colors uppercase tracking-wide flex items-center gap-2"
              >
                  Next Step <Icon name="arrow_forward" className="text-sm" />
              </button>
          ) : (
              <button
                onClick={{() => {{
                  if (hasGCode && onPrint) {{
                    onPrint();
                  }} else if (!isSlicing) {{
                    onSlice();
                  }}
                }}}}
                className={{`flex-1 ml-4 py-2 px-4 text-xs font-bold rounded-lg transition-all shadow-md uppercase tracking-wide flex items-center justify-center gap-2 overflow-hidden relative ${{hasGCode
                  ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/30'
                  : isSlicing
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-wait'
                    : 'bg-primary hover:bg-blue-600 text-white shadow-primary/30'
                  }}`}}
              >
                {{isSlicing && (
                  <div
                    className="absolute left-0 top-0 h-full bg-black/10 transition-all duration-300"
                    style={{{{ width: `${{Math.round(slicePercent * 100)}}%` }}}}
                  />
                )}}

                <Icon
                  name={{hasGCode ? 'play_arrow' : isSlicing ? 'hourglass_empty' : 'layers'}}
                  className={{`text-lg relative z-10 ${{isSlicing ? 'animate-spin' : ''}}`}}
                />
                <span className="relative z-10 flex flex-col items-center">
                  <span className="leading-none">
                    {{hasGCode
                      ? 'PRINT MODEL'
                      : isSlicing
                        ? `SLICING... ${{Math.round(slicePercent * 100)}}%`
                        : 'GENERATE G-CODE'}}
                  </span>
                  {{isSlicing && sliceMessage && (
                    <span className="text-[9px] font-normal opacity-70 mt-0.5 animate-pulse uppercase tracking-tighter">
                      {{sliceMessage}}
                    </span>
                  )}}
                </span>
              </button>
          )}}
      </div>
    </aside>
  );
}}
"""

# Replace the whole return block safely
final_code = code[:code.find(return_start)] + new_content

# remove lingering old tab code (it was extracted and discarded when doing code[:find])
# Wait, code[:find] keeps everything BEFORE `return (` then appends `new_content`. 
# It effectively replaces the ENTIRE return block with the new_content!

with open(r'd:\fff3-main\components\LayersPanel\LayersPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(final_code)
print("SUCCESS!")
