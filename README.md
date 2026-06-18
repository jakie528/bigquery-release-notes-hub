# BigQuery Release Notes Hub & Social Composer

A modern, responsive web application built with **Python Flask** and **Vanilla JS/CSS** that allows you to easily track, filter, and share Google Cloud BigQuery release updates directly to X (Twitter).

## 🚀 Key Features

* **Granular Updates Split**: Parses the official Atom feed, separating monolithic daily logs into distinct, structured cards based on headers (Features, Announcements, Issues, Deprecations).
* **Premium Dark Theme**: Sleek, glassmorphic layout styled with a customized dark theme, responsive grid systems, and subtle glowing category indicators.
* **Smart Search & Filters**: Instantly find specific updates using the search bar or filter the entire feed by categories.
* **Dual-Action Sharing**:
  * **Quick Tweet**: Direct one-click share buttons on every individual update card.
  * **Batch Composer**: Multi-select notes to generate a unified draft tweet complete with automatic character counting, progress ring warnings, and automatic truncation at X's 280-character limit.
* **Cached Reloads**: Minimizes payload loads using 5-minute request caching, featuring a live status indicator and a manual spinning **Refresh** trigger.

---

## 🛠️ Architecture

```
                       [ Google Cloud XML Feed ]
                                  │
                       ( Requests / python3 )
                                  ▼
                         [ Flask Backend ] ──( Caches 5 mins )
                                  │
                    ( BeautifulSoup HTML Parser )
                                  ▼
                           [ API /api/notes ]
                                  │
                            ( Vanilla JS )
                                  ▼
                    [ Dashboard UI (HTML & CSS) ]
                     ├── Timeline Feed
                     └── Batch Tweet Composer ──► [ X (Twitter) Intent ]
```

---

## 💻 Tech Stack

* **Backend**: Python 3.9+, Flask
* **Frontend**: HTML5, Vanilla JavaScript, Vanilla CSS
* **Parsing**: BeautifulSoup4 (BS4), XML ElementTree
* **APIs**: Twitter Web Intent

---

## ⚡ Quick Start

### 1. Setup Environment
Clone the repository and navigate to the project directory:
```bash
git clone https://github.com/jakie528/bigquery-release-notes-hub.git
cd bigquery-release-notes-hub
```

Create and activate the virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate
```

Install the dependencies:
```bash
pip install -r requirements.txt
```

### 2. Run the App
Start the Flask local development server:
```bash
python3 app.py
```

Open your browser and navigate to:
**[http://127.0.0.1:5050/](http://127.0.0.1:5050/)**

---

## 📝 License
This project is open-source and available under the MIT License.
