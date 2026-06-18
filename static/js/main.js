// BigQuery Release Notes Social Hub JS
// Coordinates fetching, filtering, selection, and Twitter drafting.

document.addEventListener('DOMContentLoaded', () => {
    // State management
    let releaseNotes = [];
    let selectedNotes = new Map(); // Map of cardId -> {date, category, text}
    let currentFilter = 'ALL';
    let searchQuery = '';

    // Element Cache
    const btnRefresh = document.getElementById('btn-refresh');
    const iconRefresh = document.getElementById('icon-refresh-svg');
    const searchInput = document.getElementById('search-input');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const categoryFiltersContainer = document.getElementById('category-filters-container');
    const notesContainer = document.getElementById('notes-timeline-container');
    const cacheStatusText = document.getElementById('status-text');
    const cacheIndicator = document.getElementById('cache-status-indicator');
    const btnExportCsv = document.getElementById('btn-export-csv');
    const checkboxTheme = document.getElementById('checkbox-theme');
    
    // Composer Elements
    const tweetTextarea = document.getElementById('tweet-textarea');
    const charCountDisplay = document.getElementById('char-count-display');
    const progressRing = document.getElementById('char-progress-ring');
    const btnTweet = document.getElementById('btn-tweet');
    const btnCopyTweet = document.getElementById('btn-copy-tweet');
    const btnClearSelection = document.getElementById('btn-clear-selection');
    const selectionSummary = document.getElementById('selection-summary');
    const composerSection = document.querySelector('.composer-section');
    
    // Toast Element
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    // Emoji Mapping for Categories
    const categoryEmojis = {
        'Feature': '🚀',
        'Announcement': '📢',
        'Issue': '⚠️',
        'Deprecation': '🛑',
        'General': '📝'
    };

    // Theme Management Initialization
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        checkboxTheme.checked = true;
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        checkboxTheme.checked = false;
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Initialize Notes Loading
    fetchReleaseNotes();

    // Event Listeners
    btnRefresh.addEventListener('click', () => fetchReleaseNotes(true));

    checkboxTheme.addEventListener('change', () => {
        if (checkboxTheme.checked) {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
    });
    
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        btnClearSearch.style.display = searchQuery ? 'flex' : 'none';
        filterAndRenderTimeline();
    });

    btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        btnClearSearch.style.display = 'none';
        searchInput.focus();
        filterAndRenderTimeline();
    });

    categoryFiltersContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.filter-tab');
        if (!tab) return;
        
        // Update active class
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        currentFilter = tab.dataset.category;
        filterAndRenderTimeline();
    });

    // Composer Input sync
    tweetTextarea.addEventListener('input', () => {
        updateMetrics(tweetTextarea.value.length);
    });

    // Clear Selection
    btnClearSelection.addEventListener('click', () => {
        selectedNotes.clear();
        document.querySelectorAll('.note-card').forEach(card => {
            card.classList.remove('selected');
        });
        updateTweetComposer();
    });

    // Copy Tweet Button
    btnCopyTweet.addEventListener('click', () => {
        const text = tweetTextarea.value;
        if (!text) return;
        
        navigator.clipboard.writeText(text).then(() => {
            showToast('Tweet copied to clipboard! 📋');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showToast('Failed to copy text.');
        });
    });

    // Share on X Button
    btnTweet.addEventListener('click', () => {
        const text = tweetTextarea.value;
        if (!text) return;
        
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'width=550,height=420,toolbar=no,menubar=no,scrollbars=yes');
    });

    // Export to CSV Button
    btnExportCsv.addEventListener('click', () => {
        if (!releaseNotes || releaseNotes.length === 0) return;

        let csvRows = [
            ['Date', 'Category', 'Update Content', 'Alternate Link']
        ];

        releaseNotes.forEach(entry => {
            const date = entry.date;
            const link = entry.link;

            entry.updates.forEach(update => {
                const matchesCategory = currentFilter === 'ALL' || update.category === currentFilter;
                const matchesSearch = !searchQuery || 
                    update.category.toLowerCase().includes(searchQuery) || 
                    update.text.toLowerCase().includes(searchQuery);

                if (matchesCategory && matchesSearch) {
                    const escapedContent = update.text.replace(/"/g, '""');
                    const escapedCategory = update.category.replace(/"/g, '""');
                    const escapedDate = date.replace(/"/g, '""');
                    const escapedLink = link.replace(/"/g, '""');
                    csvRows.push([
                        `"${escapedDate}"`,
                        `"${escapedCategory}"`,
                        `"${escapedContent}"`,
                        `"${escapedLink}"`
                    ]);
                }
            });
        });

        if (csvRows.length <= 1) {
            showToast('No items matching filters to export.');
            return;
        }

        const csvContent = csvRows.map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        
        const filterStr = currentFilter !== 'ALL' ? `_${currentFilter.toLowerCase()}` : '';
        const searchStr = searchQuery ? `_search_${searchQuery.replace(/\s+/g, '_')}` : '';
        const dateStr = new Date().toISOString().slice(0, 10);
        
        link.setAttribute("download", `bigquery_release_notes${filterStr}${searchStr}_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('CSV Export successful! 📥');
    });

    // Fetch and Load Release Notes
    function fetchReleaseNotes(forceRefresh = false) {
        // Toggle loading state
        btnRefresh.disabled = true;
        btnExportCsv.disabled = true;
        iconRefresh.classList.add('spinning');
        cacheStatusText.textContent = forceRefresh ? 'Refreshing feed...' : 'Loading feed...';
        
        if (forceRefresh) {
            // Render Skeleton screen
            renderSkeletons();
        }

        const url = `/api/notes${forceRefresh ? '?refresh=true' : ''}`;

        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error('Network response error');
                return res.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    releaseNotes = data.notes;
                    btnExportCsv.disabled = false;
                    
                    // Update Cache Indicator
                    const statusDot = cacheIndicator.querySelector('.status-dot');
                    statusDot.className = 'status-dot';
                    cacheStatusText.textContent = data.cached ? 'Loaded from cache' : 'Live updated';
                    
                    filterAndRenderTimeline();
                    
                    if (forceRefresh) {
                        showToast('Feed refreshed successfully! ✨');
                    }
                } else {
                    throw new Error(data.message || 'Error fetching data');
                }
            })
            .catch(err => {
                console.error(err);
                btnExportCsv.disabled = true;
                showToast('Error loading release notes feed.');
                cacheStatusText.textContent = 'Connection error';
                const statusDot = cacheIndicator.querySelector('.status-dot');
                statusDot.className = 'status-dot loading';
                
                // If notes container only has skeleton, show error screen
                if (notesContainer.querySelector('.skeleton-timeline')) {
                    renderErrorState();
                }
            })
            .finally(() => {
                btnRefresh.disabled = false;
                iconRefresh.classList.remove('spinning');
            });
    }

    // Render skeleton screens
    function renderSkeletons() {
        notesContainer.innerHTML = `
            <div class="skeleton-timeline">
                <div class="skeleton-group">
                    <div class="skeleton-date"></div>
                    <div class="skeleton-card"></div>
                    <div class="skeleton-card"></div>
                </div>
                <div class="skeleton-group">
                    <div class="skeleton-date"></div>
                    <div class="skeleton-card"></div>
                </div>
            </div>
        `;
    }

    // Render error layout inside the feed timeline
    function renderErrorState() {
        notesContainer.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h3>Failed to load release notes</h3>
                <p>We encountered an issue fetching the feed from Google. Please verify your connection and try again.</p>
                <button class="btn-primary" onclick="location.reload()">Reload Page</button>
            </div>
        `;
    }

    // Render Timeline based on filters
    function filterAndRenderTimeline() {
        if (!releaseNotes || releaseNotes.length === 0) {
            notesContainer.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <h3>No release notes available</h3>
                    <p>It looks like the BigQuery feed is currently empty or unavailable.</p>
                </div>
            `;
            return;
        }

        let filteredCount = 0;
        let htmlContent = '';

        releaseNotes.forEach(entry => {
            const date = entry.date;
            const link = entry.link;
            
            // Filter the sub-updates in this entry
            const matchingUpdates = entry.updates.filter(update => {
                const matchesCategory = currentFilter === 'ALL' || update.category === currentFilter;
                const matchesSearch = !searchQuery || 
                    update.category.toLowerCase().includes(searchQuery) || 
                    update.text.toLowerCase().includes(searchQuery);
                return matchesCategory && matchesSearch;
            });

            if (matchingUpdates.length > 0) {
                filteredCount += matchingUpdates.length;
                
                // Build HTML for this date group
                let groupHtml = `
                    <div class="date-group">
                        <div class="date-heading-wrapper">
                            <h2 class="date-heading">${date}</h2>
                            <a href="${link}" target="_blank" rel="noopener" class="date-notes-link">
                                <span>Official Notes</span>
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            </a>
                        </div>
                        <div class="cards-list">
                `;

                matchingUpdates.forEach(update => {
                    const cardId = update.id;
                    const isSelected = selectedNotes.has(cardId);
                    const categoryClass = `badge-${update.category.toLowerCase()}`;
                    
                    groupHtml += `
                        <div class="note-card ${isSelected ? 'selected' : ''}" data-id="${cardId}" data-date="${date}" data-category="${update.category}">
                            <div class="note-card-selector">
                                <div class="custom-checkbox" aria-label="Select update">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                </div>
                            </div>
                            <div class="note-card-content">
                                <div class="note-card-header">
                                    <span class="badge ${categoryClass}">${update.category}</span>
                                    <div class="card-actions">
                                        <button class="btn-card-action btn-card-copy" data-id="${cardId}" title="Copy plaintext of this update to clipboard">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                            </svg>
                                        </button>
                                        <button class="btn-card-action btn-card-tweet" data-id="${cardId}" title="Share this single update on X">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="note-body">
                                    ${update.html}
                                </div>
                            </div>
                        </div>
                    `;
                });

                groupHtml += `
                        </div>
                    </div>
                `;
                htmlContent += groupHtml;
            }
        });

        if (filteredCount === 0) {
            notesContainer.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <h3>No matching results</h3>
                    <p>No release notes found matching details: "<strong>${searchQuery || currentFilter}</strong>". Try tweaking your filters or search terms.</p>
                </div>
            `;
            return;
        }

        notesContainer.innerHTML = htmlContent;

        // Attach event listeners to cards
        attachCardListeners();
    }

    // Card interactive handlers
    function attachCardListeners() {
        document.querySelectorAll('.note-card').forEach(card => {
            const cardId = card.dataset.id;
            
            // Card selection click
            card.addEventListener('click', (e) => {
                // Prevent click handler from firing when clicking links or the individual tweet button
                if (e.target.closest('a') || e.target.closest('.btn-card-action')) {
                    return;
                }
                
                toggleCardSelection(card);
            });

            // Single card copy button click
            const btnCardCopy = card.querySelector('.btn-card-copy');
            btnCardCopy.addEventListener('click', (e) => {
                e.stopPropagation();

                const date = card.dataset.date;
                const category = card.dataset.category;
                const bodyText = card.querySelector('.note-body').innerText.trim();

                const copyText = `BigQuery Update (${date}) [${category}]:\n${bodyText}`;

                navigator.clipboard.writeText(copyText).then(() => {
                    showToast('Update copied to clipboard! 📋');
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                    showToast('Failed to copy text.');
                });
            });

            // Single card instant tweet button click
            const btnCardTweet = card.querySelector('.btn-card-tweet');
            btnCardTweet.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Get this card's specific content
                const date = card.dataset.date;
                const category = card.dataset.category;
                const bodyText = card.querySelector('.note-body').innerText.trim();
                
                // Formulate a beautiful clean single tweet
                const emoji = categoryEmojis[category] || '📝';
                let tweetDraft = `${emoji} BigQuery Update (${date}):\n\n`;
                
                const remainingLength = 280 - tweetDraft.length - 25; // Reserve 25 chars for short URL
                
                if (bodyText.length > remainingLength) {
                    tweetDraft += bodyText.substring(0, remainingLength - 3) + '...';
                } else {
                    tweetDraft += bodyText;
                }
                
                tweetDraft += '\n\n#GCP #BigQuery';
                
                // Open Twitter Intent window
                const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetDraft)}`;
                window.open(url, '_blank', 'width=550,height=420,toolbar=no,menubar=no,scrollbars=yes');
            });
        });
    }

    // Toggle card selected state
    function toggleCardSelection(card) {
        const cardId = card.dataset.id;
        const date = card.dataset.date;
        const category = card.dataset.category;
        const text = card.querySelector('.note-body').innerText.trim();

        if (selectedNotes.has(cardId)) {
            selectedNotes.delete(cardId);
            card.classList.remove('selected');
        } else {
            selectedNotes.set(cardId, { date, category, text });
            card.classList.add('selected');
        }

        // Trigger visual sync for mobile panel slider if items > 0
        if (selectedNotes.size > 0 && window.innerWidth <= 1024) {
            composerSection.classList.add('active');
        } else if (selectedNotes.size === 0 && window.innerWidth <= 1024) {
            composerSection.classList.remove('active');
        }

        updateTweetComposer();
    }

    // Dynamic Tweet Generator
    function updateTweetComposer() {
        const size = selectedNotes.size;
        
        // Sync clear button
        btnClearSelection.disabled = size === 0;

        if (size === 0) {
            selectionSummary.innerHTML = `Select one or more release note items to generate a shareable tweet.`;
            tweetTextarea.value = '';
            updateMetrics(0);
            btnTweet.disabled = true;
            btnCopyTweet.disabled = true;
            return;
        }

        // Group selections by date to structure the tweet elegantly
        const grouped = new Map();
        selectedNotes.forEach((val) => {
            if (!grouped.has(val.date)) {
                grouped.set(val.date, []);
            }
            grouped.get(val.date).push(val);
        });

        // Draft structure
        let tweetContent = "";
        
        if (grouped.size === 1) {
            // All items belong to a single date
            const date = grouped.keys().next().value;
            const items = grouped.get(date);
            
            tweetContent += `🆕 BigQuery Updates (${date}):\n\n`;
            
            items.forEach(item => {
                const emoji = categoryEmojis[item.category] || '📝';
                tweetContent += `${emoji} [${item.category}] ${item.text}\n\n`;
            });
        } else {
            // Multi-date selection
            tweetContent += `📈 Multiple BigQuery Updates:\n\n`;
            
            grouped.forEach((items, date) => {
                tweetContent += `📅 ${date}:\n`;
                items.forEach(item => {
                    const emoji = categoryEmojis[item.category] || '📝';
                    tweetContent += `• ${emoji} ${item.text}\n`;
                });
                tweetContent += `\n`;
            });
        }

        tweetContent = tweetContent.trim();
        
        // Truncate to X character limit if needed (preserving hashtag space)
        const footerTag = "\n\n#GCP #BigQuery";
        const maxTextLength = 280 - footerTag.length;
        
        if (tweetContent.length > maxTextLength) {
            tweetContent = tweetContent.substring(0, maxTextLength - 3) + '...' + footerTag;
        } else {
            tweetContent += footerTag;
        }

        tweetTextarea.value = tweetContent;
        updateMetrics(tweetContent.length);

        // Update selection summary text
        selectionSummary.innerHTML = `Selected <strong>${size}</strong> item${size > 1 ? 's' : ''} across <strong>${grouped.size}</strong> date${grouped.size > 1 ? 's' : ''}.`;
        
        btnTweet.disabled = false;
        btnCopyTweet.disabled = false;
    }

    // Update Metrics and Circle Ring
    function updateMetrics(charLength) {
        charCountDisplay.textContent = `${charLength}/280`;

        // Circumference is 2 * PI * r = 2 * 3.14159 * 11 ≈ 69.1
        const circ = 69.1;
        
        // Cap count at 280 for visual progress, but let it grow if needed
        const progressVal = Math.min(charLength, 280);
        const offset = circ - (progressVal / 280) * circ;
        progressRing.style.strokeDashoffset = offset;

        // Visual alerts
        if (charLength > 280) {
            charCountDisplay.className = 'char-count error';
            progressRing.style.stroke = '#ef4444';
            btnTweet.disabled = true;
        } else if (charLength > 250) {
            charCountDisplay.className = 'char-count warning';
            progressRing.style.stroke = '#f59e0b';
            btnTweet.disabled = false;
        } else {
            charCountDisplay.className = 'char-count';
            progressRing.style.stroke = '#3b82f6';
            btnTweet.disabled = charLength === 0;
        }
    }

    // Helper to display toast warnings/successes
    function showToast(message) {
        toastMessage.textContent = message;
        toast.classList.add('active');
        
        setTimeout(() => {
            toast.classList.remove('active');
        }, 3000);
    }
});
