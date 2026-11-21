#!/usr/bin/env python3
"""Fill the course's ORIGINAL DOCX template without redesigning it.

For a draft, omit --github-url and --screenshot.
For the final document, supply a public URL and actual locally captured screenshots.
"""
import argparse
import re
from pathlib import Path

from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from PIL import Image


def add_url(doc, paragraph, url):
    rel_id = doc.part.relate_to(url, RT.HYPERLINK, is_external=True)
    link = OxmlElement('w:hyperlink')
    link.set(qn('r:id'), rel_id)
    run = OxmlElement('w:r')
    properties = OxmlElement('w:rPr')
    color = OxmlElement('w:color'); color.set(qn('w:val'), '0563C1')
    underline = OxmlElement('w:u'); underline.set(qn('w:val'), 'single')
    properties.extend((color, underline))
    run.append(properties)
    txt = OxmlElement('w:t'); txt.text = url; run.append(txt)
    link.append(run)
    paragraph._p.append(link)


def clear_and_set(paragraph, string, *, bold=False, italic=False, grey=False):
    paragraph.clear()
    r = paragraph.add_run(string)
    r.bold = bold
    r.italic = italic
    if grey:
        r.font.color.rgb = RGBColor(96, 108, 119)
    return paragraph


def remove_paragraph(paragraph):
    node = paragraph._element
    node.getparent().remove(node)


def get_doc_paragraph(doc, prefix):
    hits = [p for p in doc.paragraphs if p.text.strip().startswith(prefix)]
    if len(hits) != 1:
        raise ValueError(f'Expected exactly one template paragraph starting with {prefix!r}; found {len(hits)}')
    return hits[0]


def add_screenshot(paragraph, path):
    with Image.open(path) as image:
        w, h = image.size
    scale = min(6.35 / w, 4.4 / h)
    clear_and_set(paragraph, '')
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.add_run().add_picture(str(path), width=Inches(w*scale), height=Inches(h*scale))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--template', default='Observability Deliverable.docx')
    parser.add_argument('--name', required=True)
    parser.add_argument('--github-url')
    parser.add_argument('--analysis', default='analysis.txt')
    parser.add_argument('--screenshot', action='append', default=[])
    parser.add_argument('--output', default='Observability Submission.docx')
    args = parser.parse_args()

    text = Path(args.analysis).read_text(encoding='utf-8').strip()
    words = re.findall(r"\b[\w'-]+\b", text)
    if len(words) > 350:
        raise ValueError(f'The answer has {len(words)} words (limit: 350).')
    if args.github_url and not re.fullmatch(r'https://github\.com/[\w-]+/[\w.-]+/?', args.github_url):
        raise ValueError('Provide a complete public repository URL: https://github.com/user/repository')
    if args.github_url and len(args.screenshot) != 2:
        raise ValueError('A final report needs two real Jaeger screenshots: search results and an expanded GET /todo trace.')
    for path in args.screenshot:
        if not Path(path).is_file():
            raise FileNotFoundError(f'Missing screenshot: {path}')

    doc = Document(args.template)

    # Remove the highlighted instructional paragraphs at the top of the supplied template.
    for para in list(doc.paragraphs):
        if para.text.lstrip().startswith(('(Create a copy', '(Label all links',
                                          '(Ensure all links', '(Example label')):
            remove_paragraph(para)

    name_p = get_doc_paragraph(doc, 'Name:')
    name_p.clear()
    name_p.add_run('Name: ').bold = True
    name_p.add_run(args.name)

    repo_p = get_doc_paragraph(doc, '[your GitHub link]')
    repo_p.clear()
    if args.github_url:
        add_url(doc, repo_p, args.github_url)
    else:
        rr = repo_p.add_run('Public GitHub repository URL: pending publication (draft only)')
        rr.italic = True
        rr.font.color.rgb = RGBColor(96, 108, 119)

    answer_p = get_doc_paragraph(doc, '[your answer]')
    clear_and_set(answer_p, text)
    answer_p.paragraph_format.space_after = Pt(8)

    screenshot_p = get_doc_paragraph(doc, '[your screenshot(s)]')
    if args.screenshot:
        add_screenshot(screenshot_p, Path(args.screenshot[0]))
        for i, path in enumerate(args.screenshot[1:], 2):
            new_para = OxmlElement('w:p')
            screenshot_p._p.addnext(new_para)
            from docx.text.paragraph import Paragraph
            screenshot_p = Paragraph(new_para, screenshot_p._parent)
            add_screenshot(screenshot_p, Path(path))
    else:
        clear_and_set(screenshot_p,
                      'Actual Jaeger screenshot(s): pending local execution. '
                      'Do not submit this draft as final.', italic=True, grey=True)

    doc.core_properties.title = 'Observability - A9 Submission'
    doc.core_properties.subject = 'OpenTelemetry traces, metrics, and logs'
    # Paragraph-level run properties in the original template also contain
    # placeholder highlighting; paragraph.clear() only removes its text runs.
    for highlight in list(doc.element.iter(qn('w:highlight'))):
        highlight.getparent().remove(highlight)
    doc.save(args.output)
    print(f'Created {args.output} ({len(words)} words of analysis, {len(args.screenshot)} screenshots).')

if __name__ == '__main__':
    main()
