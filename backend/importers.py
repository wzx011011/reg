import json
import re
from pathlib import Path
from bs4 import BeautifulSoup
import chardet


def process_uploaded_file(content: bytes, filename: str) -> dict:
    """Route file to the correct importer based on extension."""
    detected = chardet.detect(content)
    encoding = detected['encoding'] or 'utf-8'
    text = content.decode(encoding, errors='replace')
    ext = Path(filename).suffix.lower()

    if ext in ('.md', '.markdown'):
        return _import_markdown(text, filename)
    elif ext in ('.html', '.htm'):
        if 'NETSCAPE-Bookmark-file' in text[:300]:
            return _import_bookmarks(text)
        return _import_html(text, filename)
    elif ext == '.json':
        return _import_json(text, filename)
    else:
        return _import_text(text, filename)


def _import_markdown(text: str, filename: str) -> dict:
    text = re.sub(r'^---\n.*?\n---\n', '', text, flags=re.DOTALL)
    m = re.search(r'^#\s+(.+)', text, re.MULTILINE)
    title = m.group(1).strip() if m else Path(filename).stem
    return {"text": text.strip(), "title": title, "type": "blog"}


def _import_text(text: str, filename: str) -> dict:
    return {"text": text.strip(), "title": Path(filename).stem, "type": "document"}


def _import_html(text: str, filename: str) -> dict:
    soup = BeautifulSoup(text, 'html.parser')
    for el in soup(['script', 'style', 'nav', 'footer', 'header']):
        el.decompose()
    h1 = soup.find('h1')
    title_tag = soup.find('title')
    title = (h1.get_text().strip() if h1
             else title_tag.get_text().strip() if title_tag
             else Path(filename).stem)
    return {"text": soup.get_text('\n', strip=True), "title": title, "type": "document"}


def _import_json(text: str, filename: str) -> dict:
    try:
        data = json.loads(text)
        readable = json.dumps(data, ensure_ascii=False, indent=2)
        return {"text": readable, "title": Path(filename).stem, "type": "document"}
    except json.JSONDecodeError:
        return _import_text(text, filename)


def _import_bookmarks(html: str) -> dict:
    soup = BeautifulSoup(html, 'html.parser')
    bookmarks: list[dict] = []

    def walk(el, folder=""):
        for dt in el.find_all('dt', recursive=False):
            h3 = dt.find('h3', recursive=False)
            if h3:
                name = h3.get_text().strip()
                path = f"{folder}/{name}" if folder else name
                dl = dt.find('dl', recursive=False)
                if dl:
                    walk(dl, path)
            a = dt.find('a', recursive=False)
            if a and a.get('href') and a.get_text().strip():
                bookmarks.append({
                    "title": a.get_text().strip(),
                    "url": a['href'],
                    "folder": folder,
                })

    dl = soup.find('dl')
    if dl:
        walk(dl)

    lines = [f"标题: {b['title']} | 文件夹: {b['folder']} | 链接: {b['url']}" for b in bookmarks]
    return {
        "text": "\n".join(lines),
        "title": f"浏览器书签 ({len(bookmarks)} 个)",
        "type": "bookmark",
    }
