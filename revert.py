import re

with open('C:/Users/PEDRO/Documents/FFF3/scratch.py', 'r', encoding='utf-8') as f:
    orig_func = f.read()

with open('C:/Users/PEDRO/Documents/FFF3/server.py', 'r', encoding='utf-8') as f:
    curr_server = f.read()

# Replace the function
new_server = re.sub(r'def _write_multimaterial_3mf\([^)]+\):.*?print\(f"\[3MF\] Written multi-material 3MF with \{len\(volumes\)\} volumes to \{output_path\}"\)\n', orig_func + "\n", curr_server, flags=re.DOTALL)

# Now remove the FDM overrides from overrides_dict so they don't get put in job_config.ini
override_re = re.compile(r'for meta in models_meta:\s*if meta\.get\(\"fdmSettings\"\):[^\n]*\n.*?if \"extrusionMultiplier\" in fs.*?\n', re.DOTALL)
new_server = override_re.sub('for meta in models_meta:\n                pass # Intentionally skip migrating FDM settings to INI. 3MF configs now handle this natively to prevent global overwrite.\n', new_server)

with open('C:/Users/PEDRO/Documents/FFF3/server.py', 'w', encoding='utf-8') as f:
    f.write(new_server)
print('Reverted successfully')
