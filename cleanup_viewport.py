import re

with open('components/Viewport/Viewport.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove Pattern Preview UI logic
# The pattern editor UI was likely near the end or in a specific block. Instead of guessing, let's just use string replace.

# Remove onUpdateModifiers from ViewportProps
content = re.sub(r"onUpdateModifiers\?: \(modifiers: any\[\]\) => void;\n?", "", content)
content = re.sub(r"patterns: import\('\.\./\.\./types'\)\.Pattern\[\];\n?", "", content)
content = re.sub(r"onSavePattern: \(p: import\('\.\./\.\./types'\)\.Pattern\) => void;\n?", "", content)
content = re.sub(r"onDeletePattern: \(id: string\) => void;\n?", "", content)

# Remove from destructured props
content = re.sub(r",\s*onUpdateModifiers", "", content)
content = re.sub(r",\s*patterns", "", content)
content = re.sub(r",\s*onSavePattern", "", content)
content = re.sub(r",\s*onDeletePattern", "", content)

# Remove the import of PatternPreview
content = re.sub(r"import \{ PatternPreview \} from '\./PatternPreview';\n?", "", content)
content = re.sub(r"import \{ PatternEditorModal \} from '\./PatternEditorModal';\n?", "", content)

# Remove PatternEditorModal block
content = re.sub(r"\{isPatternEditorOpen[\s\S]*?<\/PatternEditorModal>[\s\n]*\}", "", content)

# Remove the "Open Pattern Editor" icon button
content = re.sub(r"\{/\*\s*Pattern Editor Toggle[\s\S]*?<\/button>\s*<\/div>", "", content)
# It might be part of an overlay
content = re.sub(r"\{/\*\s*Pattern Editor[\s\S]*?<\/button>\n?", "", content)

# There's also `isPatternEditorOpen` state
content = re.sub(r"const \[isPatternEditorOpen, setIsPatternEditorOpen\] = useState\(false\);\n?", "", content)
# And `editingPattern`
content = re.sub(r"const \[editingPattern, setEditingPattern\] = useState<import.*\n?", "", content)


with open('components/Viewport/Viewport.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
