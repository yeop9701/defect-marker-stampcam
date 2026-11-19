"""층수·위치 선택 목록 엑셀 → taxonomy/location-taxonomy.js

    python taxonomy/build_location.py taxonomy/위치_층수_선택목록.xlsx taxonomy/location-taxonomy.js

엑셀 시트
  「층수」 : 1단계 | 2단계(쉼표로 여럿, 「(바로 선택 완료)」면 1단계만) | 3단계(「중층 (선택)」)
  「위치」 : 분류 | 위치    (분류 「외부 (층수에서 외부 선택 시)」 → 이름 「외부」, 층수가 외부일 때 바로 연다)
목록 순서는 엑셀에 적힌 그대로 둔다.
"""
import json
import os
import re
import sys

import openpyxl


def main(src, dst):
    wb = openpyxl.load_workbook(src, data_only=True)
    ws_floor, ws_loc = wb['층수'], wb['위치']

    floors = []
    for row in ws_floor.iter_rows(min_row=2, values_only=True):
        g, s2, s3 = (tuple(row) + (None,) * 3)[:3]
        if not g:
            continue
        g = str(g).strip()
        s2 = str(s2 or '').strip()
        items = [] if (not s2 or '바로' in s2) else [x.strip() for x in s2.split(',') if x.strip()]
        nums = []
        for x in items:
            m = re.fullmatch(r'(\d+)\s*층', x)
            if not m:
                sys.exit(f'층수 2단계를 읽지 못했습니다: {g} / {x}')
            nums.append(int(m.group(1)))
        floors.append({'group': g, 'under': g.startswith('지하'), 'floors': nums,
                       'mezz': bool(s3 and '중층' in str(s3))})

    cats, notes = [], []
    for row in ws_loc.iter_rows(min_row=2, values_only=True):
        c, loc = (tuple(row) + (None,) * 2)[:2]
        if not c:
            continue
        c = str(c).strip()
        if not loc:                       # 맨 아래 안내 문장
            notes.append(c)
            continue
        name = re.sub(r'\s*\(.*\)\s*$', '', c)
        if not cats or cats[-1]['name'] != name:
            cats.append({'name': name, 'outside': '외부' in c and '층수' in c, 'items': []})
        cats[-1]['items'].append(str(loc).strip())

    data = {'source': os.path.basename(src), 'floors': floors, 'locations': cats, 'notes': notes}
    head = ('// 층수 → (중층) · 분류 → 위치 선택 목록 (taxonomy/build_location.py 로 엑셀에서 만든 파일 — 직접 고치지 않는다)\n'
            f'// 층수 1단계 {len(floors)} · 위치 분류 {len(cats)} · 위치 {sum(len(c["items"]) for c in cats)}\n')
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        f.write(head + 'window.LocationTaxonomy = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(head.strip())


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
