#!/usr/bin/env python
"""Render the compliance markdown pack into professional PDFs (pure-Python).
Outputs one PDF per document plus a combined pack PDF into ./pdf/.
"""
import os, re, glob, datetime
import markdown
from xhtml2pdf import pisa

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, 'pdf')
os.makedirs(OUT, exist_ok=True)

# xhtml2pdf can't render colour emoji — map the meaningful ones, strip the rest.
EMOJI_MAP = {'✅': '[Yes]', '✓': '[Yes]', '❌': '[No]', '⚠️': '[!]', '⚠': '[!]',
             '🔒': '(secure)', '🥇': '1.', '🥈': '2.', '🥉': '3.', '🌱': '', '🎯': '',
             '💸': '', '💚': '', '💛': '', '📷': '[photo]', '📎': '[file]', '💬': '', '📩': '',
             '🇹🇿': 'TZ', '➡': '->', '►': '>', '▶': '>'}
def clean(text):
    for k, v in EMOJI_MAP.items():
        text = text.replace(k, v)
    # strip any remaining emoji / pictographs
    return re.sub(r'[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF]', '', text)

CSS = """
@page { size: A4; margin: 2.2cm 1.8cm 2cm 1.8cm;
  @frame footer { -pdf-frame-content: footerContent; bottom: 1cm; height: 1cm; }
}
body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #1f2937; line-height: 1.45; }
h1 { font-size: 19pt; color: #0b2150; border-bottom: 2px solid #1a56db; padding-bottom: 5px; margin: 0 0 10px; }
h2 { font-size: 13.5pt; color: #163e8e; margin: 16px 0 6px; }
h3 { font-size: 11.5pt; color: #334155; margin: 12px 0 4px; }
p, li { font-size: 10.5pt; }
code, pre { font-family: Courier, monospace; font-size: 8.5pt; background: #f1f5f9; }
pre { padding: 8px; border: 1px solid #e2e8f0; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; }
th { background: #1a56db; color: #fff; text-align: left; padding: 5px 7px; font-size: 9pt; }
td { border: 1px solid #cbd5e1; padding: 5px 7px; font-size: 9pt; vertical-align: top; }
blockquote { color: #475569; border-left: 3px solid #1a56db; margin: 8px 0; padding: 4px 10px; background: #f8fafc; }
a { color: #1a56db; }
"""
FOOTER = ('<div id="footerContent" style="font-size:7.5pt;color:#94a3b8;text-align:center;">'
          'OlomiPay — Confidential — for partner/regulator review only · page <pdf:pagenumber> of <pdf:pagecount></div>')

def md_to_html(md_text):
    body = markdown.markdown(clean(md_text), extensions=['tables', 'fenced_code', 'sane_lists'])
    return f'<html><head><style>{CSS}</style></head><body>{body}{FOOTER}</body></html>'

def render(html, out_path):
    with open(out_path, 'wb') as f:
        pisa.CreatePDF(html, dest=f, encoding='utf-8')

files = sorted(glob.glob(os.path.join(HERE, '[0-9][0-9]-*.md')))
combined_parts = []
for path in files:
    with open(path, encoding='utf-8') as f:
        md = f.read()
    name = os.path.splitext(os.path.basename(path))[0]
    render(md_to_html(md), os.path.join(OUT, name + '.pdf'))
    combined_parts.append(clean(markdown.markdown(md, extensions=['tables', 'fenced_code', 'sane_lists'])))
    print('  rendered', name + '.pdf')

# Combined pack with a simple cover + page breaks between docs
cover = (f'<div style="text-align:center;margin-top:6cm;">'
         f'<h1 style="font-size:28pt;border:0;">OlomiPay</h1>'
         f'<p style="font-size:15pt;color:#163e8e;">Partner Onboarding &amp; Compliance Pack</p>'
         f'<p style="color:#64748b;">Confidential — for partner/regulator review only</p>'
         f'<p style="color:#94a3b8;">Generated {datetime.date.today().isoformat()}</p></div>'
         f'<div style="page-break-after: always;"></div>')
combined = ('<html><head><style>' + CSS + '</style></head><body>' + cover +
            '<div style="page-break-after: always;"></div>'.join(combined_parts) +
            FOOTER + '</body></html>')
render(combined, os.path.join(OUT, 'OlomiPay-Compliance-Pack.pdf'))
print('  rendered OlomiPay-Compliance-Pack.pdf (combined)')
print('Done →', OUT)
