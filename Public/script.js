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
    const postsFeed = document.getElementById('posts-feed');
    const audioInput = document.getElementById('audio-input');
    const songNameInput = document.getElementById('song-name-input');
    const artistNameInput = document.getElementById('artist-name-input');
    const audioFeed = document.getElementById('audio-feed');
    const footerLink = document.querySelector('footer p');

    let adminPassword = localStorage.getItem('adminPassword') || null;
    let isAdminMode = false;

    // --- Persistence Logic ---

    checkAdminStatus();
    fetchProfile();
    fetchMessages();

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

    footerLink.style.cursor = 'pointer';
    footerLink.addEventListener('click', async () => {
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
            fetchMessages(); // Refresh to show edit buttons
        } else {
            alert('Invalid Password');
        }
    });

    async function fetchProfile() {
        try {
            const response = await fetch('/api/get-profile');
            const data = await response.json();
            if (data.name) nameEl.textContent = data.name;
            if (data.bio) bioEl.textContent = data.bio;
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
                name: nameEl.textContent.trim(),
                bio: bioEl.textContent.trim()
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
                        displayAudio(msg.id, msg.content, msg.title, msg.artist, msg.created_at);
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
        messageInput.value = '';
        await saveMessage(text, 'text');
        fetchMessages(true); // fetchMessages now scrolls to bottom
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
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
                body: JSON.stringify({ content, type, title, artist })
            });
        } catch (error) {
            console.error('Error saving message:', error);
        }
    }

    async function updateMessage(id, content, title, artist) {
        try {
            const data = { id };
            if (content !== undefined) data.content = content;
            if (title !== undefined) data.title = title;
            if (artist !== undefined) data.artist = artist;

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
            }
        } catch (error) {
            console.error('Error updating message:', error);
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
                if (e.key === 'Enter' && !e.shiftKey) {
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

    audioInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const title = songNameInput.value.trim() || file.name.replace(/\.[^/.]+$/, "");
        const artist = artistNameInput.value.trim() || 'Unknown Artist';

        // Vercel hard limit is 4.5MB. 
        const vlimit = 4.5 * 1024 * 1024;
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

        if (file.size > vlimit) {
            alert(`عذراً، الملف حجمه (${fileSizeMB} ميجا) وهو أكبر من الحد المسموح لـ Vercel (4.5 ميجا). حاول ترفع ملف أصغر قليلاً.`);
            return;
        }

        try {
            // Send as RAW binary to avoid Base64 overhead in request body
            const response = await fetch(`/api/upload-audio?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'x-admin-password': adminPassword
                },
                body: file
            });

            if (response.ok) {
                audioInput.value = '';
                songNameInput.value = '';
                artistNameInput.value = '';
                fetchMessages(true);
            } else {
                const err = await response.json();
                alert('فشل الرفع: ' + (err.error || 'خطأ غير معروف'));
            }
        } catch (error) {
            console.error('Error uploading audio:', error);
            alert('حدث خطأ أثناء الرفع.');
        }
    });

    function displayAudio(id, base64, title, artist, timestamp) {
        const audioDiv = document.createElement('div');
        audioDiv.className = 'audio-card';
        const date = new Date(timestamp);
        const timeString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        audioDiv.innerHTML = `
            <div class="card-actions" style="display: ${isAdminMode ? 'flex' : 'none'}"></div>
            <div class="audio-info">
                <span class="audio-title">${escapeHtml(title || 'Untitled')}</span>
                <span class="audio-artist">${escapeHtml(artist || 'Unknown Artist')}</span>
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
                <button class="ctrl-btn prev-btn">⏮</button>
                <button class="ctrl-btn play-pause-btn">▶</button>
                <button class="ctrl-btn next-btn">⏭</button>
            </div>
            <audio class="hidden-player" src="/api/audio/${id}"></audio>
        `;

        const actionsDiv = audioDiv.querySelector('.card-actions');

        // Add Edit Button for Audio
        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn';
        editBtn.innerHTML = '✏️';
        editBtn.title = 'Edit Info';
        editBtn.onclick = () => {
            const newTitle = prompt('Enter new song title:', title || '');
            const newArtist = prompt('Enter new artist name:', artist || '');
            if (newTitle !== null || newArtist !== null) {
                updateMessage(id, undefined, newTitle, newArtist);
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
        };

        audio.onloadedmetadata = () => {
            durationEl.textContent = formatTime(audio.duration);
        };

        progressBar.onclick = (e) => {
            const rect = progressBar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            audio.currentTime = pos * audio.duration;
        };

        audioFeed.appendChild(audioDiv);
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
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
});
