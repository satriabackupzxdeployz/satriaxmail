import { db, ref, set, push, onValue, remove, update } from './config.js';

const IP_STORAGE = 'satriamail_ip';
const DEFAULT_AVATAR = 'https://files.clugx.my.id/QO2mP.jpeg';

let currentIP = getUserIP();
let currentUser = null;
let allUsers = [];
let messages = [];
let publicChats = [];
let replyContext = null;
let replyToMessage = null;

function getUserIP() {
    let ip = localStorage.getItem(IP_STORAGE);
    if (!ip) {
        ip = 'ip_' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem(IP_STORAGE, ip);
    }
    return ip;
}

function navigate(path) {
    window.history.pushState({}, '', path);
    handleRoute();
}

window.addEventListener('popstate', handleRoute);

function handleRoute() {
    const path = window.location.pathname;
    
    document.querySelectorAll('.tab-view').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item, .nav-fab').forEach(i => i.classList.remove('active'));
    
    if (!currentUser && path !== '/sendv2') {
        const landing = document.getElementById('landingTab');
        if(landing) landing.classList.add('active');
        const bottomNav = document.getElementById('bottomNav');
        if(bottomNav) bottomNav.style.display = 'none';
        return;
    }
    
    const bottomNav = document.getElementById('bottomNav');
    if(bottomNav) bottomNav.style.display = 'flex';

    const routeMap = {
        '/': currentUser ? 'homeTab' : 'landingTab',
        '/home': 'homeTab',
        '/inbox': 'inboxTab',
        '/send': 'composeTab',
        '/public': 'publicTab',
        '/sendv2': 'sendv2Tab'
    };
    
    let activeTabId = routeMap[path] || 'homeTab';
    const activeTab = document.getElementById(activeTabId);
    if (activeTab) activeTab.classList.add('active');

    const navMap = { '/home': 'home', '/inbox': 'inbox', '/send': 'compose', '/public': 'public' };
    const navName = navMap[path];
    if (navName) {
        const navEl = document.querySelector(`[data-tab="${navName}"]`);
        if (navEl) navEl.classList.add('active');
    }

    if (path === '/inbox') {
        renderInbox();
        markInboxRead();
    } else if (path === '/public') {
        renderPublicChat();
    } else if (path === '/sendv2') {
        renderSendV2();
    }
}

function showToast(msg) {
    let t = document.querySelector('.toast');
    if (!t) {
        t = document.createElement('div');
        t.className = 'toast';
        document.getElementById('toastContainer').appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

function unreadCount() {
    return messages.filter(m => m.to === currentUser?.email && !m.read).length || 0;
}
function updateUnreadBadge() {
    const count = unreadCount();
    const badge = document.getElementById('unreadBadge');
    const navDot = document.querySelector('.nav-item .icon-wrapper .nav-dot');
    if (badge) {
        badge.style.display = count > 0 ? 'inline-block' : 'none';
        badge.innerText = count;
    }
    if (navDot) navDot.style.display = count > 0 ? 'block' : 'none';
}

function initFirebaseListeners() {
    onValue(ref(db, 'users'), (snapshot) => {
        const data = snapshot.val() || {};
        allUsers = Object.values(data);
        const foundUser = data[currentIP];
        if (foundUser) {
            currentUser = foundUser;
            updateProfileUI();
        }
    });

    onValue(ref(db, 'messages'), (snapshot) => {
        const data = snapshot.val() || {};
        messages = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        renderInbox();
        updateUnreadBadge();
    });

    onValue(ref(db, 'publicChats'), (snapshot) => {
        const data = snapshot.val() || {};
        publicChats = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        renderPublicChat();
    });
}

function renderAppShell() {
    const root = document.getElementById('app');
    root.innerHTML = `
        <div class="top-bar"><div class="app-name">Satriamail</div></div>

        <div id="landingTab" class="tab-view">
            <div class="hero-card">
                <div class="icon-glow"><i class="fas fa-envelope-open-text"></i></div>
                <h2>Daftar dengan nama</h2>
                <p>kamu akan mendapatkan alamat ✦ <strong>nama@satria.dev</strong></p>
            </div>
            <div class="email-action-area" style="margin-top:-10px;">
                <label>Nama kamu</label>
                <input type="text" id="usernameInput" class="compose-input" placeholder="cth: Ilham" style="margin-bottom:12px;">
                <label>Link Foto profile (opsional)</label>
                <input type="url" id="avatarInput" class="compose-input" placeholder="https://..." style="padding:16px;">
                <label>Bio (opsional)</label>
                <textarea id="bioInput" class="public-textarea" rows="2" placeholder="tulis bio singkat..."></textarea>
                <button id="createAccountBtn" class="send-btn" style="width:100%; margin-top:16px;"><i class="fas fa-arrow-right"></i> Lanjut</button>
            </div>
        </div>

        <div id="homeTab" class="tab-view">
            <div class="profile-card" id="profileAvatar">
                <div class="profile-card-avatar"><img src="" id="homeAvatarImg" alt=""></div>
                <div class="profile-card-info">
                    <h3 id="homeName"></h3>
                    <p id="homeBio"></p>
                </div>
            </div>
            <div class="email-action-area">
                <label>Email mu</label>
                <div class="email-display">
                    <span id="userEmail"></span>
                    <button class="copy-btn" id="copyEmailBtn"><i class="far fa-copy"></i></button>
                </div>
            </div>
        </div>

        <div id="inboxTab" class="tab-view">
            <div class="section-header">
                <h2>Inbox <span class="badge" id="unreadBadge" style="display:none;">0</span></h2>
                <button class="trash-btn" id="clearInboxBtn"><i class="fas fa-trash"></i></button>
            </div>
            <div id="inboxList" class="message-list"></div>
            <div id="emptyInbox" class="empty-placeholder"><i class="fas fa-inbox"></i> belum ada pesan</div>
        </div>

        <div id="publicTab" class="tab-view">
            <div class="section-header"><h2>Public chat</h2></div>
            <div id="publicList" class="public-chat-container"></div>
            <div id="replyContextBadge" class="reply-context-badge" style="display:none;">
                <i class="fas fa-reply"></i> Membalas ke <span id="replyToName"></span>: <span id="replyToText"></span>
                <span style="margin-left:auto; cursor:pointer;" id="cancelReply"><i class="fas fa-times"></i></span>
            </div>
            <textarea id="publicInput" class="public-textarea" placeholder="Tulis pesan publik..." rows="2"></textarea>
            <button id="sendPublicBtn" class="btn-secondary-full"><i class="fas fa-paper-plane"></i> Kirim ke publik</button>
        </div>

        <div id="composeTab" class="tab-view">
            <div class="section-header"><h2>Kirim pesan</h2></div>
            <div class="email-action-area">
                <label>Nama/Email Tujuan</label>
                <input type="text" id="targetName" class="compose-input" placeholder="contoh: ilham atau ilham@satria.dev">
                <label>Pesan</label>
                <textarea id="messageText" class="public-textarea" rows="4" placeholder="tulis pesan..."></textarea>
                <button id="sendMsgBtn" class="btn-secondary-full"><i class="fas fa-paper-plane"></i> Kirim pesan</button>
            </div>
        </div>

        <div id="sendv2Tab" class="tab-view">
            <div class="section-header"><h2>Kirim Pesan (Anonim/Bebas)</h2></div>
            <div class="email-action-area">
                <div id="sendv2SenderArea"></div>
                <label>Nama/Email Tujuan</label>
                <input type="text" id="targetNameV2" class="compose-input" placeholder="contoh: ilham atau ilham@satria.dev">
                <label>Pesan</label>
                <textarea id="messageTextV2" class="public-textarea" rows="4" placeholder="tulis pesan..."></textarea>
                <button id="sendMsgBtnV2" class="btn-secondary-full"><i class="fas fa-paper-plane"></i> Kirim pesan anonim</button>
            </div>
        </div>

        <div class="bottom-nav" id="bottomNav">
            <div class="nav-item" data-tab="home"><i class="fas fa-home"></i><span>Home</span></div>
            <div class="nav-item" data-tab="inbox"><div class="icon-wrapper"><i class="fas fa-inbox"></i><span class="nav-dot" style="display:none;"></span></div><span>Inbox</span></div>
            <div class="nav-fab" data-tab="compose"><i class="fas fa-feather-alt"></i><span>Send</span></div>
            <div class="nav-item" data-tab="public"><i class="fas fa-globe"></i><span>Public</span></div>
        </div>

        <div id="profileModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Pengaturan Profile</h3>
                    <button class="close-btn" id="closeProfileModal"><i class="fas fa-times"></i></button>
                </div>
                <div class="profile-settings">
                    <div class="settings-avatar"><img src="" id="settingsAvatarImg"></div>
                    <div class="settings-input">
                        <label>Link Foto profile (opsional)</label>
                        <input type="url" id="settingsAvatarInput" placeholder="https://...">
                    </div>
                    <div class="settings-input">
                        <label>Nama</label>
                        <input type="text" id="settingsName" disabled>
                    </div>
                    <div class="settings-input">
                        <label>Bio</label>
                        <textarea id="settingsBio" rows="3"></textarea>
                    </div>
                    <button id="saveProfileBtn" class="send-btn" style="width:100%;"><i class="fas fa-save"></i> Simpan</button>
                    <button id="deleteAccountBtn" class="delete-btn"><i class="fas fa-trash"></i> Hapus Akun</button>
                </div>
            </div>
        </div>

        <div id="userProfileModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Profile Pengguna</h3>
                    <button class="close-btn" id="closeUserProfile"><i class="fas fa-times"></i></button>
                </div>
                <div class="profile-settings">
                    <div class="settings-avatar" id="viewAvatar"><img src="" id="viewAvatarImg"></div>
                    <div class="settings-input"><label>Nama</label><input type="text" id="viewName" disabled></div>
                    <div class="settings-input"><label>Email</label><input type="text" id="viewEmail" disabled></div>
                    <div class="settings-input"><label>Bio</label><textarea id="viewBio" rows="3" disabled></textarea></div>
                </div>
            </div>
        </div>

        <div id="messageModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <button class="close-btn" id="closeMsgModal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-meta" id="modalMeta">
                    <div class="meta-avatar" id="modalAvatar"><img src="" id="modalAvatarImg"></div>
                    <div class="meta-info">
                        <span class="meta-from" id="modalFrom"></span>
                        <span class="meta-time" id="modalTime"></span>
                    </div>
                </div>
                <div class="modal-body" id="modalBody"></div>
                <div class="modal-actions">
                    <button class="reply-modal-btn" id="modalReplyBtn"><i class="fas fa-reply"></i> Balas</button>
                </div>
            </div>
        </div>
    `;

    attachEvents();
    
    onValue(ref(db, 'users/' + currentIP), (snapshot) => {
        if(snapshot.exists()) {
            currentUser = snapshot.val();
            updateProfileUI();
        }
        initFirebaseListeners();
        
        if (window.location.pathname === '/') {
            navigate(currentUser ? '/home' : '/');
        } else {
            handleRoute();
        }
    }, { onlyOnce: true });
}

function attachEvents() {
    document.querySelectorAll('.nav-item, .nav-fab').forEach(el => {
        el.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            if (tab) navigate('/' + tab);
        });
    });

    document.getElementById('createAccountBtn').addEventListener('click', () => {
        const name = document.getElementById('usernameInput').value.trim();
        if (!name || !/^[a-zA-Z0-9]+$/.test(name)) return alert('hanya huruf/angka tanpa spasi');
        
        const avatarUrl = document.getElementById('avatarInput').value.trim() || DEFAULT_AVATAR;
        const bio = document.getElementById('bioInput').value.trim() || 'Halo, saya pengguna Satriamail';
        
        const newUser = {
            name: name,
            email: name + '@satria.dev',
            ip: currentIP,
            avatar: avatarUrl,
            bio: bio,
            createdAt: Date.now()
        };
        
        set(ref(db, 'users/' + currentIP), newUser).then(() => {
            currentUser = newUser;
            navigate('/home');
        });
    });

    document.getElementById('copyEmailBtn').addEventListener('click', () => {
        navigator.clipboard?.writeText(currentUser.email).then(() => showToast('Email disalin'));
    });

    document.getElementById('clearInboxBtn').addEventListener('click', () => {
        if (confirm('Hapus semua pesan masuk?')) {
            const userMsgs = messages.filter(m => m.to === currentUser.email);
            userMsgs.forEach(m => remove(ref(db, 'messages/' + m.id)));
            showToast('Inbox dibersihkan');
        }
    });

    document.getElementById('sendMsgBtn').addEventListener('click', () => {
        const rawTarget = document.getElementById('targetName').value.trim();
        const text = document.getElementById('messageText').value.trim();
        if (!rawTarget || !text) return alert('isi semua');
        
        const targetEmail = rawTarget.includes('@') ? rawTarget : rawTarget + '@satria.dev';
        const targetUser = allUsers.find(u => u.email === targetEmail);
        
        if (!targetUser) return alert('Pengguna tidak ditemukan di database');
        
        push(ref(db, 'messages'), {
            from: currentUser.email,
            to: targetEmail,
            text: text,
            timestamp: Date.now(),
            read: false
        }).then(() => {
            alert('Pesan terkirim!');
            document.getElementById('messageText').value = '';
            document.getElementById('targetName').value = '';
        });
    });

    document.getElementById('sendMsgBtnV2').addEventListener('click', () => {
        const rawTarget = document.getElementById('targetNameV2').value.trim();
        const text = document.getElementById('messageTextV2').value.trim();
        if (!rawTarget || !text) return alert('isi semua');
        
        let senderName = 'Anonymous';
        if (currentUser) {
            senderName = currentUser.email; 
        } else {
            const customNameInput = document.getElementById('customSenderName');
            if(customNameInput && customNameInput.value.trim() !== '') {
                senderName = customNameInput.value.trim();
            }
        }

        const targetEmail = rawTarget.includes('@') ? rawTarget : rawTarget + '@satria.dev';
        const targetUser = allUsers.find(u => u.email === targetEmail);
        
        if (!targetUser) return alert('Tujuan pengguna tidak ditemukan di database');
        
        push(ref(db, 'messages'), {
            from: senderName,
            to: targetEmail,
            text: text,
            timestamp: Date.now(),
            read: false
        }).then(() => {
            alert('Pesan rahasia/anonim terkirim!');
            document.getElementById('messageTextV2').value = '';
            document.getElementById('targetNameV2').value = '';
        });
    });

    document.getElementById('sendPublicBtn').addEventListener('click', () => {
        const input = document.getElementById('publicInput');
        const txt = input.value.trim();
        if (!txt) return;
        
        push(ref(db, 'publicChats'), {
            from: currentUser.email,
            senderName: currentUser.name,
            text: txt,
            replyTo: replyContext ? { text: replyContext.text, from: replyContext.from, name: replyContext.senderName } : null,
            timestamp: Date.now()
        }).then(() => {
            input.value = '';
            replyContext = null;
            document.getElementById('replyContextBadge').style.display = 'none';
        });
    });

    document.getElementById('cancelReply').addEventListener('click', () => {
        replyContext = null;
        document.getElementById('replyContextBadge').style.display = 'none';
    });

    document.getElementById('closeMsgModal').addEventListener('click', () => document.getElementById('messageModal').classList.remove('show'));
    document.getElementById('closeProfileModal').addEventListener('click', () => document.getElementById('profileModal').classList.remove('show'));
    document.getElementById('closeUserProfile').addEventListener('click', () => document.getElementById('userProfileModal').classList.remove('show'));
    
    document.getElementById('profileAvatar').addEventListener('click', () => {
        document.getElementById('settingsAvatarInput').value = currentUser.avatar;
        document.getElementById('profileModal').classList.add('show');
    });

    document.getElementById('saveProfileBtn').addEventListener('click', () => {
        const newUrl = document.getElementById('settingsAvatarInput').value.trim() || DEFAULT_AVATAR;
        const newBio = document.getElementById('settingsBio').value.trim();
        
        update(ref(db, 'users/' + currentIP), {
            avatar: newUrl,
            bio: newBio
        }).then(() => {
            showToast('Profile diperbarui');
            document.getElementById('profileModal').classList.remove('show');
        });
    });

    document.getElementById('deleteAccountBtn').addEventListener('click', () => {
        if (confirm('Yakin ingin menghapus akun? Semua data akan hilang.')) {
            remove(ref(db, 'users/' + currentIP)).then(() => {
                currentUser = null;
                navigate('/');
            });
        }
    });

    document.getElementById('modalReplyBtn').addEventListener('click', () => {
        if (replyToMessage) {
            navigate('/send');
            document.getElementById('targetName').value = replyToMessage.from.includes('@') ? replyToMessage.from.split('@')[0] : replyToMessage.from;
            document.getElementById('messageText').focus();
            document.getElementById('messageModal').classList.remove('show');
            showToast('Membalas ke ' + replyToMessage.from);
        }
    });

    window.openMessageModal = function(msgId) {
        const msg = messages.find(m => m.id === msgId);
        if(!msg) return;
        replyToMessage = msg;
        document.getElementById('modalFrom').innerText = msg.from;
        document.getElementById('modalTime').innerText = new Date(msg.timestamp).toLocaleString();
        document.getElementById('modalBody').innerText = msg.text;
        
        const user = allUsers.find(u => u.email === msg.from);
        document.getElementById('modalAvatarImg').src = user?.avatar || `https://ui-avatars.com/api/?name=${msg.from.charAt(0)}&background=111&color=fff`;
        document.getElementById('messageModal').classList.add('show');
    };

    window.viewUserProfile = function(email) {
        const user = allUsers.find(u => u.email === email);
        if (user) {
            document.getElementById('viewAvatarImg').src = user.avatar;
            document.getElementById('viewName').value = user.name;
            document.getElementById('viewEmail').value = user.email;
            document.getElementById('viewBio').value = user.bio || '';
            document.getElementById('userProfileModal').classList.add('show');
        }
    };
    
    window.setReplyContext = function(chatId) {
        const chat = publicChats.find(c => c.id === chatId);
        if (chat) {
            replyContext = chat;
            document.getElementById('replyToName').innerText = chat.senderName || chat.from;
            document.getElementById('replyToText').innerText = chat.text.substring(0,30);
            document.getElementById('replyContextBadge').style.display = 'flex';
            document.getElementById('publicInput').focus();
        }
    };
}

function updateProfileUI() {
    if(!currentUser) return;
    document.getElementById('homeName').innerText = currentUser.name;
    document.getElementById('homeBio').innerText = currentUser.bio || '';
    document.getElementById('userEmail').innerText = currentUser.email;
    document.getElementById('homeAvatarImg').src = currentUser.avatar;
    document.getElementById('settingsAvatarImg').src = currentUser.avatar;
    document.getElementById('settingsName').value = currentUser.name;
    document.getElementById('settingsBio').value = currentUser.bio || '';
}

function markInboxRead() {
    messages.filter(m => m.to === currentUser?.email && !m.read).forEach(m => {
        update(ref(db, 'messages/' + m.id), { read: true });
    });
}

function renderInbox() {
    const container = document.getElementById('inboxList');
    const empty = document.getElementById('emptyInbox');
    if (!container || !currentUser) return;
    
    const myMessages = messages.filter(m => m.to === currentUser.email).sort((a,b)=>b.timestamp - a.timestamp);
    
    if (myMessages.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    container.innerHTML = myMessages.map(m => `
        <div class="message-card ${m.read ? 'read' : 'unread'}" onclick="window.openMessageModal('${m.id}')">
            <div class="msg-content">
                <div class="msg-header"><span class="msg-from">${m.from}</span><span class="msg-time">${new Date(m.timestamp).toLocaleTimeString()}</span></div>
                <div class="msg-subject">✉️ pesan</div>
                <div class="msg-snippet">${m.text.substring(0,60)}${m.text.length>60?'...':''}</div>
            </div>
        </div>
    `).join('');
}

function renderPublicChat() {
    const container = document.getElementById('publicList');
    if (!container) return;
    
    if (publicChats.length === 0) {
        container.innerHTML = '<div class="empty-placeholder"><i class="fas fa-comments"></i> belum ada obrolan</div>';
        return;
    }
    
    container.innerHTML = publicChats.sort((a,b)=>a.timestamp - b.timestamp).map(c => {
        const user = allUsers.find(u => u.email === c.from) || { name: c.senderName, avatar: null };
        return `
        <div class="public-message">
            <div class="public-header" onclick="window.viewUserProfile('${c.from}')">
                <div class="public-avatar"><img src="${user.avatar || `https://ui-avatars.com/api/?name=${user.name.charAt(0)}&background=111&color=fff`}"></div>
                <span class="public-name">${user.name}</span>
                <span class="public-time">${new Date(c.timestamp).toLocaleTimeString()}</span>
            </div>
            ${c.replyTo ? `<div class="reply-indicator"><i class="fas fa-reply"></i> <span class="reply-to">${c.replyTo.name || c.replyTo.from}</span>: ${c.replyTo.text.substring(0,50)}</div>` : ''}
            <div class="public-text">${c.text}</div>
            <div class="public-reply-trigger" onclick="window.setReplyContext('${c.id}')"><i class="fas fa-comment-dots"></i> Balas</div>
        </div>`;
    }).join('');
}

function renderSendV2() {
    const senderArea = document.getElementById('sendv2SenderArea');
    if(currentUser) {
        senderArea.innerHTML = `<input type="text" class="compose-input" value="Mengirim sebagai: ${currentUser.email}" disabled style="background:#e5e7eb; color:#4b5563;">`;
    } else {
        senderArea.innerHTML = `
            <label>Nama Pengirim (Opsional / Biarkan kosong untuk anonim)</label>
            <input type="text" id="customSenderName" class="compose-input" placeholder="contoh: Secret Admirer">
        `;
    }
}

renderAppShell();