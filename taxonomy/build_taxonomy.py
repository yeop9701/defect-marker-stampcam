"""부재·자재·결함 엑셀 → taxonomy/defect-taxonomy.js

    python taxonomy/build_taxonomy.py taxonomy/부재_자재_결함.xlsx taxonomy/defect-taxonomy.js

엑셀 시트
  1번째 「최종 부재·자재·결함」 : 부재 | 자재/공종 | 결함명(쉼표로 여럿) | 건수
  2번째 「목록」              : 부재·자재·결함 각각 (이름, 영문, 약자) 세 칸씩 + 「용어 기준」
목록 순서는 엑셀에 적힌 그대로 둔다(부재·결함 ㄱㄴㄷ, 자재는 마감재가 맨 끝).
"""
import json
import os
import sys

import openpyxl


def main(src, dst):
    wb = openpyxl.load_workbook(src, data_only=True)
    ws_tree, ws_list = wb.worksheets[0], wb.worksheets[1]

    tree = {}
    for row in ws_tree.iter_rows(min_row=2, values_only=True):
        part, mat, defs = (row + (None,) * 4)[:3]
        if not part or not mat:
            continue
        part, mat = str(part).strip(), str(mat).strip()
        lst = [d.strip() for d in str(defs or '').split(',') if d.strip()]
        tree.setdefault(part, {})[mat] = lst

    def column(c0):
        out = []
        for row in ws_list.iter_rows(min_row=2, values_only=True):
            name = row[c0] if len(row) > c0 else None
            if name:
                out.append({'name': str(name).strip(),
                            'en': str(row[c0 + 1] or '').strip(),
                            'abbr': str(row[c0 + 2] or '').strip()})
        return out

    parts, materials, defects = column(0), column(4), column(8)
    notes = [str(r[12]).strip() for r in ws_list.iter_rows(min_row=2, values_only=True)
             if len(r) > 12 and r[12]]

    # 목록 시트와 조합 시트가 서로 맞는지 확인 — 어긋나면 만들지 않는다
    pn, mn, dn = ({x['name'] for x in parts}, {x['name'] for x in materials},
                  {x['name'] for x in defects})
    bad = []
    for p, mats in tree.items():
        if p not in pn:
            bad.append('목록에 없는 부재: ' + p)
        for m, ds in mats.items():
            if m not in mn:
                bad.append(f'목록에 없는 자재: {p} / {m}')
            bad += [f'목록에 없는 결함: {p} / {m} / {d}' for d in ds if d not in dn]
    if bad:
        sys.exit('\n'.join(bad))

    data = {'source': os.path.basename(src),
            'parts': parts, 'materials': materials, 'defects': defects,
            'tree': tree, 'notes': notes}
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// 부재 → 자재 → 결함 선택 목록 (taxonomy/build_taxonomy.py 로 엑셀에서 만든 파일 — 직접 고치지 않는다)\n')
        f.write(f'// 부재 {len(parts)} · 자재 {len(materials)} · 결함 {len(defects)} · 부재-자재 조합 '
                f'{sum(len(v) for v in tree.values())}\n')
        f.write('window.DefectTaxonomy = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('ok', dst)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
