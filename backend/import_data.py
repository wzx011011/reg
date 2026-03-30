"""
Data import script: crawl cnblogs articles + import Edge bookmarks
"""
import json
import sys
import time
import httpx
from bs4 import BeautifulSoup
from rag import RAGEngine

rag = RAGEngine()


# ==================== Edge Bookmarks ====================
def parse_bookmarks(node, path=""):
    """Recursively extract bookmarks from Edge JSON structure."""
    results = []
    if node.get("type") == "url":
        results.append({
            "name": node.get("name", ""),
            "url": node.get("url", ""),
            "folder": path,
        })
    elif node.get("type") == "folder":
        folder_name = node.get("name", "")
        new_path = f"{path}/{folder_name}" if path else folder_name
        for child in node.get("children", []):
            results.extend(parse_bookmarks(child, new_path))
    # Handle roots
    if "children" in node and node.get("type") != "folder":
        for child in node.get("children", []):
            results.extend(parse_bookmarks(child, path))
    return results


def import_edge_bookmarks(bookmarks_path):
    print(f"\n[Bookmarks] Reading: {bookmarks_path}")
    with open(bookmarks_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    all_bookmarks = []
    for root_key in ["bookmark_bar", "other", "synced"]:
        root = data.get("roots", {}).get(root_key)
        if root:
            all_bookmarks.extend(parse_bookmarks(root, root_key))

    print(f"[Bookmarks] Found {len(all_bookmarks)} bookmarks")

    # Group by folder for better context
    folders = {}
    for bm in all_bookmarks:
        folder = bm["folder"] or "root"
        if folder not in folders:
            folders[folder] = []
        folders[folder].append(bm)

    total_chunks = 0
    for folder, bms in folders.items():
        # Create text for this folder group
        lines = [f"Bookmark folder: {folder}\n"]
        for bm in bms:
            lines.append(f"- {bm['name']}: {bm['url']}")
        text = "\n".join(lines)

        count = rag.ingest(text, "bookmark", folder)
        total_chunks += count

    print(f"[Bookmarks] Ingested {total_chunks} chunks from {len(folders)} folders")
    return total_chunks


# ==================== Blog Crawling ====================
def crawl_cnblogs(blog_url):
    """Crawl all blog posts from cnblogs."""
    print(f"\n[Blog] Crawling: {blog_url}")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    all_posts = []
    page = 1

    while True:
        url = f"{blog_url}/default.html?page={page}" if page > 1 else blog_url
        print(f"[Blog] Fetching page {page}: {url}")

        try:
            resp = httpx.get(url, headers=headers, follow_redirects=True, timeout=30)
            if resp.status_code != 200:
                print(f"[Blog] Page {page} returned {resp.status_code}, stopping")
                break
        except Exception as e:
            print(f"[Blog] Error fetching page {page}: {e}")
            break

        soup = BeautifulSoup(resp.text, "html.parser")

        # Find post links
        posts_on_page = []
        for link in soup.select(".postTitle2, .postTitle a, .day .postTitle a, a.postTitle2"):
            href = link.get("href", "")
            title = link.get_text(strip=True)
            if href and title and "cnblogs.com" in href:
                posts_on_page.append({"url": href, "title": title})

        # Alternative selector for cnblogs
        if not posts_on_page:
            for link in soup.select("a[class*='postTitle']"):
                href = link.get("href", "")
                title = link.get_text(strip=True)
                if href and title:
                    posts_on_page.append({"url": href, "title": title})

        # Try broader selectors
        if not posts_on_page:
            for item in soup.select(".day"):
                title_el = item.select_one(".postTitle a")
                if title_el:
                    href = title_el.get("href", "")
                    title = title_el.get_text(strip=True)
                    if href and title:
                        posts_on_page.append({"url": href, "title": title})

        # Even broader - any link to a post
        if not posts_on_page:
            for link in soup.find_all("a", href=True):
                href = link["href"]
                if "/p/" in href and "cnblogs.com" in href:
                    title = link.get_text(strip=True)
                    if title and len(title) > 5:
                        posts_on_page.append({"url": href, "title": title})

        if not posts_on_page:
            print(f"[Blog] No posts found on page {page}, stopping")
            break

        all_posts.extend(posts_on_page)
        print(f"[Blog] Found {len(posts_on_page)} posts on page {page}")

        # Check if there's a next page
        next_link = soup.select_one("#nav_next_page a, .pager a:last-child, a[href*='page=']")
        has_next = False
        if next_link:
            next_text = next_link.get_text(strip=True)
            if ">" in next_text or "Next" in next_text.lower() or "下一页" in next_text:
                has_next = True

        if not has_next and page > 1:
            break
        if page >= 20:  # Safety limit
            break
        page += 1
        time.sleep(1)

    # Deduplicate
    seen = set()
    unique = []
    for p in all_posts:
        if p["url"] not in seen:
            seen.add(p["url"])
            unique.append(p)
    all_posts = unique

    print(f"\n[Blog] Total unique posts: {len(all_posts)}")

    # Fetch each post
    total_chunks = 0
    for i, post in enumerate(all_posts):
        print(f"[Blog] ({i+1}/{len(all_posts)}) Fetching: {post['title']}")
        try:
            resp = httpx.get(post["url"], headers=headers, follow_redirects=True, timeout=30)
            if resp.status_code != 200:
                print(f"  Skipped (status {resp.status_code})")
                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract content from cnblogs post body
            content_div = soup.select_one("#cnblogs_post_body, .postBody, .post")
            if content_div:
                # Remove code blocks' visual noise but keep text
                for tag in content_div.select("script, style, .cnblogs_code_toolbar"):
                    tag.decompose()
                text = content_div.get_text(separator="\n", strip=True)
            else:
                text = soup.get_text(separator="\n", strip=True)

            if len(text) < 50:
                print(f"  Skipped (too short: {len(text)} chars)")
                continue

            # Prepend title
            full_text = f"# {post['title']}\n\n{text}"
            count = rag.ingest(full_text, "blog", post["title"])
            total_chunks += count
            print(f"  OK: {count} chunks, {len(text)} chars")

            time.sleep(0.5)  # Be nice to the server
        except Exception as e:
            print(f"  Error: {e}")

    print(f"\n[Blog] Ingested {total_chunks} chunks from {len(all_posts)} posts")
    return total_chunks


# ==================== Main ====================
if __name__ == "__main__":
    print("=" * 60)
    print("Digital Twin Data Import")
    print("=" * 60)

    # 1. Import Edge bookmarks
    bookmarks_path = r"C:\Users\106660\AppData\Local\Microsoft\Edge\User Data\Default\Bookmarks"
    try:
        bm_chunks = import_edge_bookmarks(bookmarks_path)
    except Exception as e:
        print(f"[Bookmarks] Error: {e}")
        bm_chunks = 0

    # 2. Crawl blog
    try:
        blog_chunks = crawl_cnblogs("https://www.cnblogs.com/wzxNote")
    except Exception as e:
        print(f"[Blog] Error: {e}")
        blog_chunks = 0

    # Summary
    stats = rag.get_stats()
    print("\n" + "=" * 60)
    print("Import Complete!")
    print(f"  Bookmark chunks: {bm_chunks}")
    print(f"  Blog chunks: {blog_chunks}")
    print(f"  Total chunks in DB: {stats['total_chunks']}")
    print(f"  Total sources: {stats['total_documents']}")
    print("=" * 60)
