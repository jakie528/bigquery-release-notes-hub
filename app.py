import os
import requests
import xml.etree.ElementTree as ET
import time
import hashlib
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# Cache structure
cache = {
    "data": None,
    "timestamp": 0
}
CACHE_DURATION = 300 # 5 minutes

def parse_release_notes():
    try:
        response = requests.get(FEED_URL, timeout=10)
        response.raise_for_status()
        xml_content = response.content
    except Exception as e:
        print(f"Error fetching feed: {e}")
        return None

    try:
        # Namespace map for Atom
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        root = ET.fromstring(xml_content)
        
        parsed_entries = []
        for entry in root.findall('atom:entry', ns):
            title_el = entry.find('atom:title', ns)
            updated_el = entry.find('atom:updated', ns)
            link_el = entry.find('atom:link[@rel="alternate"]', ns)
            if link_el is None:
                link_el = entry.find('atom:link', ns)
            
            content_el = entry.find('atom:content', ns)
            
            date_str = title_el.text if title_el is not None else "Unknown Date"
            updated_str = updated_el.text if updated_el is not None else ""
            link_href = link_el.get('href') if link_el is not None else ""
            content_html = content_el.text if content_el is not None else ""
            
            # Parse sub-updates in the content HTML
            soup = BeautifulSoup(content_html, 'html.parser')
            updates = []
            
            current_category = "General"
            current_elements = []
            
            # Helper to add an update
            def add_update(cat, elems):
                # Convert list of elements to HTML string
                html_str = "".join(str(el) for el in elems)
                # Parse text content safely
                text_content = BeautifulSoup(html_str, 'html.parser').get_text(separator=' ').strip()
                # If content is empty, don't add
                if not text_content:
                    return
                # Create a unique ID for selection
                update_hash = hashlib.md5(f"{date_str}-{cat}-{text_content[:20]}".encode('utf-8')).hexdigest()[:8]
                updates.append({
                    "id": f"up-{update_hash}",
                    "category": cat,
                    "html": html_str,
                    "text": text_content
                })

            for child in soup.contents:
                if child.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                    if current_elements:
                        add_update(current_category, current_elements)
                    current_category = child.get_text(strip=True)
                    current_elements = []
                elif child.name or (isinstance(child, str) and child.strip()):
                    current_elements.append(child)
            
            if current_elements:
                add_update(current_category, current_elements)
                
            # Fallback if no sub-updates were extracted, but there is some content
            if not updates and content_html.strip():
                add_update("General", [soup])
                
            parsed_entries.append({
                "date": date_str,
                "updated": updated_str,
                "link": link_href,
                "updates": updates
            })
            
        return parsed_entries
    except Exception as e:
        print(f"Error parsing feed: {e}")
        import traceback
        traceback.print_exc()
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/notes')
def get_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    now = time.time()
    
    if force_refresh or cache["data"] is None or (now - cache["timestamp"]) > CACHE_DURATION:
        notes = parse_release_notes()
        if notes is not None:
            cache["data"] = notes
            cache["timestamp"] = now
        else:
            if cache["data"] is not None:
                return jsonify({
                    "status": "success",
                    "notes": cache["data"],
                    "cached": True,
                    "warning": "Failed to refresh live feed; returning cached data."
                })
            return jsonify({
                "status": "error",
                "message": "Failed to fetch and parse release notes."
            }), 500
            
    return jsonify({
        "status": "success",
        "notes": cache["data"],
        "cached": True
    })

if __name__ == '__main__':
    app.run(debug=True, port=5050)
