import re
import os

filepath = 'components/LayersPanel/LayersPanel.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Helper function to remove a tag block by searching for <AccordionSection title="Title" ...> and its matching </AccordionSection>
def remove_accordion(content, title_match):
    # Find the start of the accordion
    pattern = r'<AccordionSection\s+(?:[^>]*?)title="' + title_match + r'"'
    match = re.search(pattern, content)
    if not match:
        print(f"Could not find Accordion with title: {title_match}")
        return content
    
    start_idx = match.start()
    # Now find the matching closing tag </AccordionSection>
    # Simple bracket matching
    open_tags = 0
    i = start_idx
    tag_start = -1
    while i < len(content):
        if content[i:].startswith('<AccordionSection'):
            open_tags += 1
            i += len('<AccordionSection')
        elif content[i:].startswith('</AccordionSection>'):
            open_tags -= 1
            if open_tags == 0:
                end_idx = i + len('</AccordionSection>')
                # remove to next newline
                while end_idx < len(content) and content[end_idx] in ' \t':
                    end_idx += 1
                if end_idx < len(content) and content[end_idx] == '\n':
                    end_idx += 1
                # If wrapped in a div like <div className={...}> <AccordionSection> ... </AccordionSection> </div>
                # Let's remove the wrapper div too if it's there. 
                # This is a bit tricky, let's just remove the block. If there's a leading <div> we'll use regex to clean up empty divs later.
                break
            i += len('</AccordionSection>')
        else:
            i += 1
            
    if open_tags == 0:
        return content[:start_idx] + content[end_idx:]
    return content

content = remove_accordion(content, 'Build plate adhesion')
content = remove_accordion(content, 'Advance slice')
content = remove_accordion(content, 'Thermal Viability Saver')
content = remove_accordion(content, 'Motor Speeds Control')
content = remove_accordion(content, 'Motor & VAT separation') 

# Also clean up the wrapping divs for "Advance slice" and "Build plate adhesion"
# e.g.: <div className={!selectedModel || isAdvancedSliceMode ? 'opacity-50 pointer-events-none grayscale' : ''}></div>
content = re.sub(r"<div className=\{[^}]+\}>\s*</div>", "", content)

# Rename Bioink heating to Heating Bed
content = content.replace('title="Bioink heating"', 'title="Heating Bed"')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Removed Accordions and renamed Bioink heating.")
