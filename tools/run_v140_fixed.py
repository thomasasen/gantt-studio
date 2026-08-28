from pathlib import Path

patch_path = Path('tools/apply_v140.py')
source = patch_path.read_text(encoding='utf-8')
old = "b = text.index('\\nfunction renderLegend()', a)"
new = "b = text.index('\\nfunction filteredBaseTasks()', a)"
if old not in source:
    raise SystemExit('Expected renderMetrics patch anchor was not found.')
source = source.replace(old, new, 1)
exec(compile(source, str(patch_path), 'exec'), {'__name__': '__main__'})
