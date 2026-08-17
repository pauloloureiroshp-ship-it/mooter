#!/bin/bash
cd "$HOME/frugal" || exit 1
echo "═══ eslint COM erros à vista ═══"
./tools/ancora/node_modules/.bin/eslint --no-config-lookup -c tools/ancora/eslint.config.mjs \
  --format json -o "$HOME/.mooter/ancora-eslint.json" tools/cockpit tools/router tools/*.js
echo "exit=$?"
python3 - <<'PY'
import json,os,collections
d=json.load(open(os.path.expanduser('~/.mooter/ancora-eslint.json')))
tot=0;byr=collections.Counter();out=[]
for f in d:
    for m in f.get('messages',[]):
        tot+=1;r=m.get('ruleId') or 'PARSE';byr[r]+=1
        out.append({'file':f['filePath'].split('frugal/')[-1],'line':m.get('line'),'rule':r,'msg':(m.get('message') or '')[:140]})
print(f"\nÂNCORA: {tot} achados")
for r,c in byr.most_common(12): print(f"  {c:4}  {r}")
json.dump(out,open(os.path.expanduser('~/.mooter/ancora-achados.json'),'w'),ensure_ascii=False,indent=1)
PY
echo "(janela 30s)"; sleep 30
