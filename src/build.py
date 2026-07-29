#!/usr/bin/env python3
"""
特定技能1号 学習アプリ — ビルド

  src/template.html + src/data_*.json  →  index.html

sw.js の VERSION は index.html の内容ハッシュで自動的に書きかわるので、
更新のたびに手で直す必要はない。

  $ python3 src/build.py
"""
import json, glob, re, os, shutil, hashlib

SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(SRC)          # リポジトリ直下

ORDER = ['第1章 必要な技能', '第2章 食品衛生', '第3章 労働安全']


def strip_ruby(s):
    return re.sub(r'\{([^|{}]+)\|([^|{}]+)\}', r'\1', s)


def term_chapter(p):
    p = p or 0
    if p <= 3:
        return ORDER[0]
    if p <= 41:
        return ORDER[1]
    return ORDER[2]


def load_data():
    questions, terms, signs = [], [], []
    for f in sorted(glob.glob(os.path.join(SRC, 'data_*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        questions += d.get('questions', [])
        terms += d.get('terms', [])
        signs += d.get('signs', [])

    for q in questions:
        c = strip_ruby(q['chapter']).replace('　', ' ').strip()
        c = re.sub(r'^第\s*3\s*章.*', ORDER[2], c)
        c = re.sub(r'^第\s*2\s*章.*', ORDER[1], c)
        c = re.sub(r'^第\s*1\s*章.*', ORDER[0], c)
        q['chapter'] = c
        q['topic'] = strip_ruby(q['topic'])

    seen, uniq = set(), []
    for t in terms:
        key = strip_ruby(t['term']).strip()
        if key in seen:
            continue
        seen.add(key)
        t['ch'] = term_chapter(t.get('page'))
        uniq.append(t)

    terms = sorted(uniq, key=lambda t: (ORDER.index(t['ch']), t.get('page') or 0))
    questions.sort(key=lambda q: (ORDER.index(q['chapter']), q.get('page') or 0, q['id']))
    return questions, terms, signs


def validate(questions):
    errs = []
    ids = [q['id'] for q in questions]
    for i in set(ids):
        if ids.count(i) > 1:
            errs.append('重複ID: ' + i)
    for q in questions:
        if len(q['choices']) != 3:
            errs.append('%s: 選択肢が3つでない' % q['id'])
        if len(q.get('choices_en', [])) != 3:
            errs.append('%s: 英訳の選択肢が3つでない' % q['id'])
        if not (0 <= q['answer'] < 3):
            errs.append('%s: answer が範囲外' % q['id'])
        if q['type'] not in ('gakka', 'jitsugi'):
            errs.append('%s: type が不正' % q['id'])
        for fld in [q['q'], q['explain']] + q['choices']:
            if fld.count('{') != fld.count('}'):
                errs.append('%s: ルビ記法の括弧が対応していない' % q['id'])
    return errs


def stamp_sw(index_html):
    """index.html の内容から sw.js の VERSION を作り直す（更新忘れ防止）"""
    sw_path = os.path.join(OUT, 'sw.js')
    if not os.path.exists(sw_path):
        return None
    h = hashlib.sha1(index_html.encode('utf-8')).hexdigest()[:10]
    ver = 'tk1-' + h
    sw = open(sw_path, encoding='utf-8').read()
    sw2 = re.sub(r"const VERSION = '[^']*';", "const VERSION = '%s';" % ver, sw, count=1)
    if sw2 != sw:
        open(sw_path, 'w', encoding='utf-8').write(sw2)
    return ver


def main():
    questions, terms, signs = load_data()

    errs = validate(questions)
    if errs:
        print('■ データに問題があります:')
        for e in errs:
            print('  -', e)
        raise SystemExit(1)

    tpl = open(os.path.join(SRC, 'template.html'), encoding='utf-8').read()
    payload = json.dumps({'questions': questions, 'terms': terms, 'signs': signs},
                         ensure_ascii=False, separators=(',', ':'))
    out = tpl.replace('/*__DATA__*/null', payload)

    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(out)
    ver = stamp_sw(out)

    g = sum(1 for q in questions if q['type'] == 'gakka')
    print('OK  問題 %d問（学科%d / 実技%d）・用語 %d語・標識 %d件'
          % (len(questions), g, len(questions) - g, len(terms), len(signs)))
    print('    index.html  %.0f KB' % (len(out.encode('utf-8')) / 1024))
    print('    sw.js       VERSION = %s' % ver)


if __name__ == '__main__':
    main()
