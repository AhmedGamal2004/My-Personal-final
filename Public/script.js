document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const coverUpload = document.getElementById('cover-upload');
    const coverDisplay = document.getElementById('cover-display');
    const avatarUpload = document.getElementById('avatar-upload');
    const avatarImg = document.getElementById('avatar-img');
    const avatarPlaceholder = document.getElementById('avatar-display');
    const nameEl = document.querySelector('.name');
    const bioEl = document.querySelector('.bio');
    const sendBtn = document.getElementById('send-btn');
    const messageInput = document.getElementById('message-input');
    const adminTrigger = document.getElementById('admin-trigger');
    const postsFeed = document.getElementById('posts-feed');
    const audioInput = document.getElementById('audio-input');
    const lyricsInput = document.getElementById('lyrics-input');
    const artworkInput = document.getElementById('artwork-input');
    const artworkPreview = document.getElementById('artwork-preview');
    const artworkPreviewImg = document.getElementById('artwork-preview-img');
    const musicLinkInput = document.getElementById('music-link-input'); // NEW
    const addMusicBtn = document.getElementById('add-music-btn'); // NEW
    const loadingIndicator = document.getElementById('loadingIndicator'); // NEW
    const songNameInput = document.getElementById('song-name-input');
    const artistNameInput = document.getElementById('artist-name-input');
    const audioFeed = document.getElementById('audio-feed');

    let adminPassword = localStorage.getItem('adminPassword') || null;
    let isAdminMode = false;
    let adminClickCount = 0;
    let adminClickTimer = null;

    // --- Persistence Logic ---

    checkAdminStatus();
    fetchProfile();
    fetchMessages();
    restoreDrafts();

    function restoreDrafts() {
        const messageDraft = localStorage.getItem('messageDraft');
        if (messageDraft) {
            messageInput.value = messageDraft;
        }

        const audioDraft = JSON.parse(localStorage.getItem('audioDraft') || '{}');
        if (audioDraft.title) songNameInput.value = audioDraft.title;
        if (audioDraft.artist) artistNameInput.value = audioDraft.artist;
        if (audioDraft.lyrics) lyricsInput.value = audioDraft.lyrics;
        if (audioDraft.description) {
            const descriptionInput = document.getElementById('description-input');
            if (descriptionInput) descriptionInput.value = audioDraft.description;
        }
    }

    function saveAudioDraft() {
        const descriptionInput = document.getElementById('description-input');
        const draft = {
            title: songNameInput.value,
            artist: artistNameInput.value,
            lyrics: lyricsInput.value,
            description: descriptionInput ? descriptionInput.value : ''
        };
        localStorage.setItem('audioDraft', JSON.stringify(draft));
    }

    messageInput.addEventListener('input', () => {
        localStorage.setItem('messageDraft', messageInput.value);
    });

    [songNameInput, artistNameInput, lyricsInput].forEach(el => {
        el.addEventListener('input', saveAudioDraft);
    });
    // Description input might be dynamic or just there
    document.addEventListener('input', (e) => {
        if (e.target.id === 'description-input') saveAudioDraft();
    });

    async function checkAdminStatus() {
        if (!adminPassword) {
            setAdminUI(false);
            return;
        }

        try {
            const response = await fetch('/api/verify-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: adminPassword })
            });

            if (response.ok) {
                isAdminMode = true;
                setAdminUI(true);
            } else {
                localStorage.removeItem('adminPassword');
                adminPassword = null;
                setAdminUI(false);
            }
        } catch (error) {
            setAdminUI(false);
        }
    }

    function setAdminUI(isAdmin) {
        isAdminMode = isAdmin;

        // Hide/Show Input Cards
        document.querySelectorAll('.input-card').forEach(card => {
            card.style.display = isAdmin ? 'block' : 'none';
        });

        // Toggle contenteditable on profile
        nameEl.setAttribute('contenteditable', isAdmin ? 'true' : 'false');
        bioEl.setAttribute('contenteditable', isAdmin ? 'true' : 'false');

        // Toggle edit/delete buttons (will be handled in displayPost/displayAudio too)
        document.querySelectorAll('.post-actions, .card-actions').forEach(el => {
            el.style.display = isAdmin ? 'flex' : 'none';
        });
    }

    adminTrigger.addEventListener('click', async () => {
        if (isAdminMode) {
            adminPassword = null;
            isAdminMode = false;
            localStorage.removeItem('adminPassword');
            setAdminUI(false);
            alert('Admin Mode Disabled!');
            fetchMessages();
        } else {
            adminClickCount++;
            if (adminClickTimer) clearTimeout(adminClickTimer);
            adminClickTimer = setTimeout(() => {
                adminClickCount = 0;
            }, 2000);

            if (adminClickCount >= 5) {
                adminClickCount = 0;
                const pass = prompt('Enter Admin Password:');
                if (!pass) return;

                const response = await fetch('/api/verify-admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pass })
                });

                if (response.ok) {
                    adminPassword = pass;
                    localStorage.setItem('adminPassword', pass);
                    checkAdminStatus();
                    alert('Admin Mode Enabled!');
                    fetchMessages();
                } else {
                    alert('Invalid Password');
                }
            }
        }
    });

    async function fetchProfile() {
        try {
            const response = await fetch('/api/get-profile');
            const data = await response.json();
            if (data.name) nameEl.innerText = data.name;
            if (data.bio) bioEl.innerText = data.bio;
            if (data.cover) coverDisplay.style.backgroundImage = `url('${data.cover}')`;
            if (data.avatar) {
                avatarImg.src = data.avatar;
                avatarImg.style.display = 'block';
                avatarPlaceholder.style.display = 'none';
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        }
    }

    async function updateProfile(fields) {
        try {
            await fetch('/api/update-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-password': adminPassword
                },
                body: JSON.stringify(fields)
            });
        } catch (error) {
            console.error('Error updating profile:', error);
        }
    }

    nameEl.setAttribute('contenteditable', 'true');
    bioEl.setAttribute('contenteditable', 'true');

    [nameEl, bioEl].forEach(el => {
        el.addEventListener('blur', () => {
            updateProfile({
                name: nameEl.innerText.trim(),
                bio: bioEl.innerText.trim()
            });
        });
    });

    coverUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                alert('Image is too large. Please keep it under 2MB.');
                return;
            }
            const base64 = await toBase64(file);
            coverDisplay.style.backgroundImage = `url('${base64}')`;
            updateProfile({ cover: base64 });
        }
    });

    avatarUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                alert('Image is too large. Please keep it under 2MB.');
                return;
            }
            const base64 = await toBase64(file);
            avatarImg.src = base64;
            avatarImg.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
            updateProfile({ avatar: base64 });
        }
    });

    artworkInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 1 * 1024 * 1024) {
                alert('Image is too large. Please keep it under 1MB.');
                artworkInput.value = '';
                return;
            }
            const base64 = await toBase64(file);
            artworkPreviewImg.src = base64;
            artworkPreview.style.display = 'block';
        } else {
            artworkPreview.style.display = 'none';
        }
    });

    // Navigation
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Messaging & Audio
    async function fetchMessages(shouldScroll = false) {
        try {
            const response = await fetch('/api/get-messages');
            const messages = await response.json();
            postsFeed.innerHTML = '';
            audioFeed.innerHTML = '';

            if (messages.length === 0) {
                postsFeed.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No messages yet.</p>';
                audioFeed.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No audio yet.</p>';
            } else {
                messages.forEach(msg => {
                    if (msg.type === 'audio') {
                        displayAudio(msg.id, msg.content, msg.title, msg.artist, msg.created_at, msg.cover_image, msg.lyrics, msg.description);
                    } else {
                        displayPost(msg.id, msg.content, msg.created_at);
                    }
                });
            }
            if (shouldScroll) {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    }

    sendBtn.addEventListener('click', async () => {
        const text = messageInput.value.trim();
        if (!text) return;

        // Disable button while sending
        sendBtn.disabled = true;
        sendBtn.innerText = 'Posting...';

        try {
            const success = await saveMessage(text, 'text');
            // ONLY clear if the save returned something that indicates success
            // Note: saveMessage currently doesn't return anything. Let's fix that.
            
            // Re-fetching success status from saveMessage update below
            messageInput.value = '';
            localStorage.removeItem('messageDraft');
            fetchMessages(true); 
        } catch (error) {
            console.error('Failed to post:', error);
            alert('❌ فشل الحفظ: ' + error.message + '\n\nكلامك لسه موجود في المربع، جرب تدوس تاني أو خده Copy.');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerText = 'Post';
        }
    });

    messageInput.addEventListener('keydown', (e) => {
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    async function saveMessage(content, type, title = '', artist = '') {
        try {
            const response = await fetch('/api/create-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-password': adminPassword
                },
                body: JSON.stringify({ content, type, title, artist, description: '' })
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Server error');
            }
            return true;
        } catch (error) {
            console.error('Error saving message:', error);
            throw error; // Rethrow to be caught in event listener
        }
    }

    async function updateMessage(id, content, title, artist, cover_image, lyrics, description) {
        try {
            const data = { id };
            if (content !== undefined && content !== null) data.content = content;
            if (title !== undefined && title !== null) data.title = title;
            if (artist !== undefined && artist !== null) data.artist = artist;
            if (cover_image !== undefined && cover_image !== null) data.cover_image = cover_image;
            if (lyrics !== undefined && lyrics !== null) data.lyrics = lyrics;
            if (description !== undefined && description !== null) data.description = description;

            const response = await fetch('/api/update-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-password': adminPassword
                },
                body: JSON.stringify(data)
            });
            if (response.ok) {
                fetchMessages();
            } else {
                const err = await response.json();
                alert('فشل التعديل: ' + (err.error || 'خطأ غير معروف'));
            }
        } catch (error) {
            console.error('Error updating message:', error);
            alert('حصلت مشكلة في الاتصال بالخادم.');
        }
    }

    async function deleteMessage(id) {
        if (!confirm('Are you sure you want to delete this?')) return;
        try {
            const response = await fetch('/api/delete-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-password': adminPassword
                },
                body: JSON.stringify({ id })
            });
            if (response.ok) fetchMessages();
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    }

    function createDeleteBtn(id) {
        const btn = document.createElement('button');
        btn.className = 'action-btn delete-btn';
        btn.innerHTML = '🗑️';
        btn.title = 'Delete';
        btn.onclick = () => deleteMessage(id);
        return btn;
    }

    function createEditBtn(postDiv, id, originalText) {
        const btn = document.createElement('button');
        btn.className = 'action-btn msg-edit-btn';
        btn.innerHTML = '✏️';
        btn.title = 'Edit';
        btn.onclick = () => {
            const textP = postDiv.querySelector('.post-text');
            const originalContent = textP.textContent;

            // Create edit UI
            postDiv.classList.add('editing');
            textP.setAttribute('contenteditable', 'true');
            textP.focus();

            // Selection at end
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(textP);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);

            const actions = postDiv.querySelector('.post-actions');
            actions.style.display = 'none';

            const editActions = document.createElement('div');
            editActions.className = 'edit-actions';

            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.className = 'save-btn';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.className = 'cancel-btn';

            const cancelEdit = () => {
                postDiv.classList.remove('editing');
                textP.removeAttribute('contenteditable');
                textP.textContent = originalContent;
                actions.style.display = 'flex';
                if (editActions.parentNode) editActions.remove();
            };

            const handleSave = async () => {
                const newContent = textP.innerText.trim();
                if (newContent && newContent !== originalContent.trim()) {
                    await updateMessage(id, newContent);
                } else {
                    cancelEdit();
                }
            };

            saveBtn.onclick = handleSave;
            cancelBtn.onclick = cancelEdit;

            editActions.appendChild(saveBtn);
            editActions.appendChild(cancelBtn);
            postDiv.appendChild(editActions);

            // Handle Keyboard shortcuts
            textP.addEventListener('keydown', (e) => {
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
                    e.preventDefault();
                    handleSave();
                }
                if (e.key === 'Escape') {
                    cancelEdit();
                }
            });
        };
        return btn;
    }

    function displayPost(id, text, timestamp) {
        const postDiv = document.createElement('div');
        postDiv.className = 'post-card';
        const date = new Date(timestamp);
        const timeString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        postDiv.innerHTML = `
            <p class="post-text">${linkify(escapeHtml(text))}</p>
            <div class="post-meta">
                <span class="post-date">${timeString}</span>
                <div class="post-actions" style="display: ${isAdminMode ? 'flex' : 'none'}"></div>
            </div>
        `;

        const actionsDiv = postDiv.querySelector('.post-actions');
        actionsDiv.appendChild(createEditBtn(postDiv, id, text));
        actionsDiv.appendChild(createDeleteBtn(id));

        postsFeed.appendChild(postDiv);
    }

    addMusicBtn.addEventListener('click', async () => {
        const file = audioInput.files[0];
        const descriptionInput = document.getElementById('description-input');

        if (!file) {
            alert('أرجوك ارفع ملف صوتي الأول.');
            return;
        }

        // --- Logic: Handle Direct File Upload ---
        if (file) {
            const title = songNameInput.value.trim() || file.name.replace(/\.[^/.]+$/, "");
            const artist = artistNameInput.value.trim() || 'Unknown Artist';
            const lyrics = lyricsInput.value.trim();
            const description = descriptionInput ? descriptionInput.value.trim() : '';
            const artworkFile = artworkInput.files[0];
            let artworkBase64 = '';

            if (artworkFile) {
                artworkBase64 = await toBase64(artworkFile);
            }

            // Vercel hard limit is 4.5MB. 
            const vlimit = 4.5 * 1024 * 1024;
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

            if (file.size > vlimit) {
                alert(`عذراً، الملف حجمه (${fileSizeMB} ميجا) وهو أكبر من الحد المسموح لـ Vercel (4.5 ميجا). حاول ترفع ملف أصغر قليلاً.`);
                return;
            }

            loadingIndicator.innerText = "جاري رفع الملف... ثواني ⏳";
            loadingIndicator.style.display = 'block';
            addMusicBtn.disabled = true;

            try {
                // Since we need to send metadata + image + audio, we use a single JSON request
                const audioBase64 = await toBase64(file);
                
                const response = await fetch('/api/create-message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-admin-password': adminPassword
                    },
                    body: JSON.stringify({
                        content: audioBase64,
                        type: 'audio',
                        title,
                        artist,
                        cover_image: artworkBase64,
                        lyrics,
                        description
                    })
                });

                if (response.ok) {
                    audioInput.value = '';
                    artworkInput.value = '';
                    lyricsInput.value = '';
                    artworkPreview.style.display = 'none';
                    songNameInput.value = '';
                    artistNameInput.value = '';
                    if (descriptionInput) descriptionInput.value = '';
                    
                    localStorage.removeItem('audioDraft'); // Clear draft on success
                    fetchMessages(true);
                } else {
                    const err = await response.json();
                    alert('فشل الرفع: ' + (err.error || 'خطأ غير معروف'));
                }
            } catch (error) {
                console.error('Error uploading audio:', error);
                alert('حدث خطأ أثناء الرفع.');
            } finally {
                loadingIndicator.style.display = 'none';
                addMusicBtn.disabled = false;
                loadingIndicator.innerText = "عاملين بنزل الأغنية من اللينك... ثواني ⏳"; // Reset msg
            }
        }
    });

    function displayAudio(id, base64, title, artist, timestamp, coverImage, lyrics, description) {
        const audioDiv = document.createElement('div');
        audioDiv.className = 'audio-card';
        const date = new Date(timestamp);
        const timeString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const coverHtml = coverImage ? `<img src="${coverImage}" class="audio-cover">` : '<div class="audio-cover-placeholder">♪</div>';
        const parsedLyrics = parseLRC(lyrics || '');

        audioDiv.innerHTML = `
            <div class="card-actions" style="display: ${isAdminMode ? 'flex' : 'none'}"></div>
            <div class="audio-header">
                ${coverHtml}
                <div class="audio-info">
                    <span class="audio-title">${escapeHtml(title || 'Untitled')}</span>
                    <span class="audio-artist">${escapeHtml(artist || 'Unknown Artist')}</span>
                    <span class="audio-date">${timeString}</span>
                </div>
            </div>

            <div class="audio-description" style="display: ${description ? 'block' : 'none'}">${linkify(escapeHtml(description || ''))}</div>
            
            <div class="lyrics-container" style="display: none;">
                <div class="lyrics-content"></div>
            </div>

            <div class="audio-controls-container">
                <div class="audio-progress-bar">
                    <div class="audio-progress-fill"></div>
                </div>
                <div class="audio-time-total">
                    <span class="current-time">0:00</span>
                    <span class="total-duration">0:00</span>
                </div>
            </div>
            <div class="audio-main-controls">
                <button class="ctrl-btn lyrics-toggle-btn" title="Lyrics" style="font-size: 0.9rem; opacity: 0.6;">🎙️</button>
                <div style="display: flex; gap: 24px; align-items: center;">
                    <button class="ctrl-btn prev-btn">⏮</button>
                    <button class="ctrl-btn play-pause-btn">▶</button>
                    <button class="ctrl-btn next-btn">⏭</button>
                </div>
                <button class="ctrl-btn download-btn" title="Download" style="font-size: 0.9rem; opacity: 0.6; display: ${isAdminMode ? 'flex' : 'none'};">📥</button>
            </div>
            <audio class="hidden-player" src="/api/audio/${id}"></audio>
        `;

        const actionsDiv = audioDiv.querySelector('.card-actions');

        // Add Edit Button for Audio
        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn';
        editBtn.innerHTML = '✏️';
        editBtn.title = 'Edit Info';
        editBtn.onclick = async () => {
            const newTitle = prompt('Enter new song title:', title || '');
            const newArtist = prompt('Enter new artist name:', artist || '');
            
            let newLyrics = undefined;
            if (confirm('هل تريد تعديل الكلمات (Lyrics)؟')) {
                const lyricsPrompt = prompt('Paste new LRC Lyrics:', lyrics || '');
                if (lyricsPrompt !== null) {
                    newLyrics = lyricsPrompt;
                }
            }

            // Function to perform the actual update with whatever we have
            const doUpdate = async (imgBase64 = undefined) => {
                await updateMessage(
                    id, 
                    undefined, 
                    newTitle !== null ? newTitle : undefined, 
                    newArtist !== null ? newArtist : undefined, 
                    imgBase64, 
                    newLyrics,
                    descriptionPrompt !== null ? descriptionPrompt : undefined
                );
            };

            const descriptionPrompt = prompt('تعديل الوصف:', description || '');

            if (confirm('هل تريد تغيير صورة الغلاف (Artwork)؟')) {
                const imgInput = document.createElement('input');
                imgInput.type = 'file';
                imgInput.accept = 'image/*';
                imgInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const base64Img = await toBase64(file);
                        await doUpdate(base64Img);
                    } else {
                        // User opened picker but didn't pick anything
                        await doUpdate();
                    }
                };
                imgInput.click();
            } else {
                // Not changing artwork, just save the other changes
                await doUpdate();
            }
        };
        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(createDeleteBtn(id));

        const audio = audioDiv.querySelector('.hidden-player');
        const playPauseBtn = audioDiv.querySelector('.play-pause-btn');
        const progressBar = audioDiv.querySelector('.audio-progress-bar');
        const progressFill = audioDiv.querySelector('.audio-progress-fill');
        const currentTimeEl = audioDiv.querySelector('.current-time');
        const durationEl = audioDiv.querySelector('.total-duration');

        const lyricsToggleBtn = audioDiv.querySelector('.lyrics-toggle-btn');
        const lyricsContainer = audioDiv.querySelector('.lyrics-container');
        const lyricsContent = audioDiv.querySelector('.lyrics-content');
        const downloadBtn = audioDiv.querySelector('.download-btn');

        downloadBtn.onclick = () => {
            const link = document.createElement('a');
            link.href = `/api/audio/${id}`;
            link.download = `${title || 'track'}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        // Populate lyrics
        if (parsedLyrics.length > 0) {
            parsedLyrics.forEach((line, index) => {
                const lineEl = document.createElement('p');
                lineEl.className = 'lyric-line';
                lineEl.dataset.time = line.time;
                lineEl.textContent = line.text;
                
                // Add click to seek
                lineEl.onclick = () => {
                    audio.currentTime = line.time;
                    if (audio.paused) {
                        playPauseBtn.click();
                    }
                };
                
                lyricsContent.appendChild(lineEl);
            });
        } else {
            lyricsContent.innerHTML = '<p style="text-align: center; opacity: 0.5;">No lyrics available</p>';
        }

        lyricsToggleBtn.onclick = () => {
            const isVisible = lyricsContainer.style.display !== 'none';
            lyricsContainer.style.display = isVisible ? 'none' : 'block';
            lyricsToggleBtn.style.opacity = isVisible ? '0.6' : '1';
        };

        playPauseBtn.onclick = () => {
            if (audio.paused) {
                // Pause all other audios
                document.querySelectorAll('audio').forEach(a => {
                    if (a !== audio) {
                        a.pause();
                        const card = a.closest('.audio-card');
                        if (card) card.querySelector('.play-pause-btn').innerHTML = '▶';
                    }
                });
                audio.play();
                playPauseBtn.innerHTML = '⏸';
            } else {
                audio.pause();
                playPauseBtn.innerHTML = '▶';
            }
        };

        audio.ontimeupdate = () => {
            const percent = (audio.currentTime / audio.duration) * 100;
            progressFill.style.width = percent + '%';
            currentTimeEl.textContent = formatTime(audio.currentTime);

            // Sync lyrics
            if (parsedLyrics.length > 0) {
                const currentT = audio.currentTime;
                let activeIndex = -1;
                for (let i = 0; i < parsedLyrics.length; i++) {
                    if (currentT >= parsedLyrics[i].time) {
                        activeIndex = i;
                    } else {
                        break;
                    }
                }

                if (activeIndex !== -1) {
                    const lines = lyricsContent.querySelectorAll('.lyric-line');
                    lines.forEach((l, idx) => {
                        if (idx === activeIndex) {
                            l.classList.add('active');
                            // Scroll to center
                            l.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                        } else {
                            l.classList.remove('active');
                        }
                    });
                }
            }
        };

        audio.onloadedmetadata = () => {
            durationEl.textContent = formatTime(audio.duration);
        };

        progressBar.onclick = (e) => {
            const rect = progressBar.getBoundingClientRect();
            // Since site is RTL, the bar starts from the right.
            const pos = (rect.right - e.clientX) / rect.width;
            audio.currentTime = pos * audio.duration;
        };

        const prevBtn = audioDiv.querySelector('.prev-btn');
        const nextBtn = audioDiv.querySelector('.next-btn');

        const playBrother = (direction) => {
            const cards = Array.from(document.querySelectorAll('.audio-card'));
            const currentIndex = cards.indexOf(audioDiv);
            if (currentIndex === -1) return;

            let targetIndex;
            if (direction === 'next') {
                targetIndex = (currentIndex + 1) % cards.length;
            } else {
                targetIndex = (currentIndex - 1 + cards.length) % cards.length;
            }

            const targetCard = cards[targetIndex];
            if (targetCard) {
                targetCard.querySelector('.play-pause-btn').click();
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        };

        nextBtn.onclick = () => playBrother('next');
        prevBtn.onclick = () => playBrother('prev');

        // Auto-play next track when finished
        audio.onended = () => playBrother('next');

        audioFeed.appendChild(audioDiv);
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function parseLRC(lrcText) {
        if (!lrcText) return [];
        const lines = lrcText.split('\n');
        const result = [];
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

        lines.forEach(line => {
            const match = timeRegex.exec(line);
            if (match) {
                const mins = parseInt(match[1]);
                const secs = parseInt(match[2]);
                const ms = parseInt(match[3]);
                const time = mins * 60 + secs + (ms / (match[3].length === 3 ? 1000 : 100));
                const text = line.replace(timeRegex, '').trim();
                if (text) {
                    result.push({ time, text });
                }
            }
        });
        return result.sort((a, b) => a.time - b.time);
    }

    function toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function linkify(text) {
        const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
        return text.replace(urlPattern, '<a href="$1" target="_blank" rel="noopener noreferrer" class="post-link">$1</a>');
    }

    // --- Keyboard Controls ---
    let lastPlayedAudio = null;

    window.addEventListener('keydown', (e) => {
        // Don't trigger if typing in an input or textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }

        const cards = Array.from(document.querySelectorAll('.audio-card'));
        if (cards.length === 0) return;

        // Space: Play/Pause
        if (e.code === 'Space') {
            e.preventDefault();
            const activeAudio = document.querySelector('audio:not([paused])');
            if (activeAudio) {
                // Find play button of this audio and click it
                activeAudio.closest('.audio-card').querySelector('.play-pause-btn').click();
            } else if (lastPlayedAudio) {
                lastPlayedAudio.closest('.audio-card').querySelector('.play-pause-btn').click();
            } else {
                // Play the first one
                cards[0].querySelector('.play-pause-btn').click();
            }
        }

        // Ctrl + Arrow keys
        if (e.ctrlKey) {
            let currentIndex = -1;
            const activeAudio = document.querySelector('audio:not([paused])') || lastPlayedAudio;
            
            if (activeAudio) {
                const activeCard = activeAudio.closest('.audio-card');
                currentIndex = cards.indexOf(activeCard);
            }

            // Ctrl + Right: Next
            if (e.code === 'ArrowRight') {
                e.preventDefault();
                const nextIndex = (currentIndex + 1) % cards.length;
                cards[nextIndex].querySelector('.play-pause-btn').click();
                cards[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Ctrl + Left: Previous
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                const prevIndex = (currentIndex - 1 + cards.length) % cards.length;
                cards[prevIndex].querySelector('.play-pause-btn').click();
                cards[prevIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });

    // Update lastPlayedAudio when any audio starts playing
    document.addEventListener('play', (e) => {
        if (e.target.tagName === 'AUDIO') {
            lastPlayedAudio = e.target;
        }
    }, true);
});
