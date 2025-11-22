const API_URL = 'api/api.php';

// --- FUNZIONE API GENERICA ---
async function api(action, data = null, isFile = false) {
    let options = { 
        method: data ? 'POST' : 'GET',
        credentials: 'include', 
        cache: 'no-store'
    };
    
    if (data && !isFile) {
        options.body = JSON.stringify(data);
        options.headers = { 'Content-Type': 'application/json' };
    } else if (data && isFile) {
        options.body = data;
    }

    let url = `${API_URL}?action=${action}&t=${new Date().getTime()}`;
    
    try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`Errore server: ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error("Errore API:", e);
        return { success: false, message: 'Errore di comunicazione col server' };
    }
}

// --- GESTIONE UI E EVENTI ---
document.addEventListener('DOMContentLoaded', async () => {
    const userRes = await api('check_auth');
    const user = userRes.success ? userRes.data : null;

    updateMenu(user);

    const path = window.location.pathname;

    if (!user && (path.includes('post.html') || path.includes('dashboard.html'))) {
        window.location.href = 'login.html';
        return;
    }

    if (path.includes('index.html') || path.endsWith('/')) {
        loadFeed(user);
    } else if (path.includes('post.html')) {
        setupPostForm();
    } else if (path.includes('login.html')) {
        setupLogin();
    } else if (path.includes('register.html')) {
        setupRegister();
    } else if (path.includes('dashboard.html')) {
        loadUserDashboard(user);
    }

    const logoutBtn = document.getElementById('logout-link');
    if(logoutBtn) logoutBtn.onclick = async (e) => {
        e.preventDefault();
        await api('logout');
        window.location.href = 'index.html';
    };
});

function updateMenu(user) {
    if (user) {
        document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'inline');
        document.querySelectorAll('.guest-only').forEach(el => el.style.display = 'none');
    } else {
        document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.guest-only').forEach(el => el.style.display = 'inline');
    }
}

// --- FUNZIONI FEED ---

async function loadFeed(currentUser) {
    const feed = document.getElementById('news-feed');
    if(!feed) return;

    const res = await api('get_posts');
    if (!res.success || !res.data || res.data.length === 0) {
        feed.innerHTML = '<p>Nessuna notizia disponibile.</p>';
        return;
    }

    feed.innerHTML = res.data.map(post => `
        <div class="news-card">
            <h3>${post.title}</h3>
            <small>Di ${post.username}</small>
            ${post.image_url ? `<img src="${post.image_url}" class="post-image">` : ''}
            <p>${post.content}</p>
            
            <div class="post-stats">
                <button onclick="toggleLike(${post.id}, this)" class="${post.liked_by_me ? 'liked' : ''}">
                    ❤️ <span class="count">${post.likes}</span>
                </button>
                <button onclick="toggleComments(${post.id})" class="comment-btn" style="margin-left: 10px; cursor:pointer;">
                    💬 Commenti
                </button>
                ${currentUser && currentUser.id == post.user_id ? 
                  `<button onclick="deletePost(${post.id})" class="delete-btn">🗑️ Elimina</button>` : ''}
            </div>

            <div id="comments-${post.id}" class="comments-section" style="display:none; margin-top:15px; border-top:1px solid #eee; padding-top:10px;">
                <div class="comments-list" style="margin-bottom:10px;"></div>
                ${currentUser ? `
                    <form onsubmit="sendComment(event, ${post.id})" style="display:flex; gap:5px;">
                        <input type="text" placeholder="Scrivi un commento..." required style="flex:1;">
                        <button type="submit" style="padding:5px 10px;">Invia</button>
                    </form>
                ` : '<small>Effettua il login per commentare.</small>'}
            </div>
        </div>
    `).join('');
}


async function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    const list = section.querySelector('.comments-list');
    
    if (section.style.display === 'none') {
        section.style.display = 'block';
        list.innerHTML = '<em>Caricamento...</em>';
        
        const res = await api('get_comments', { post_id: postId });
        
        if (res.success && res.data.length > 0) {
            list.innerHTML = res.data.map(c => `
                <div style="margin-bottom:5px; font-size: 0.9rem;">
                    <strong>${c.username}:</strong> ${c.content}
                </div>
            `).join('');
        } else {
            list.innerHTML = '<small>Nessun commento.</small>';
        }
    } else {
        section.style.display = 'none';
    }
}

async function sendComment(e, postId) {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const content = input.value;
    
    const res = await api('add_comment', { post_id: postId, content: content });
    if (res.success) {
        input.value = ''; 
        // Ricarica i commenti chiudendo e riaprendo velocemente la sezione
        const section = document.getElementById(`comments-${postId}`);
        section.style.display = 'none'; 
        toggleComments(postId);
    } else {
        alert(res.message || 'Errore invio commento');
    }
}


async function loadUserDashboard(user) {
    const container = document.querySelector('.posts-container');
    if(!container) return;
    const res = await api('get_posts');
    if (res.success && res.data) {
        const myPosts = res.data.filter(p => p.user_id === user.id);
        container.innerHTML = myPosts.length ? myPosts.map(post => `
            <div class="news-card">
                <h3>${post.title}</h3>
                <small>Pubblicato il ${post.created_at}</small>
                <button onclick="deletePost(${post.id})" class="delete-btn">Elimina</button>
            </div>
        `).join('') : '<p>Non hai ancora pubblicato nulla.</p>';
    }
}

async function toggleLike(postId, btn) {
    const res = await api('toggle_like', { post_id: postId });
    if (res.success) {
        btn.classList.toggle('liked');
        btn.querySelector('.count').textContent = res.data;
    } else {
        alert(res.message || 'Effettua il login');
    }
}

async function deletePost(id) {
    if(!confirm('Eliminare?')) return;
    const res = await api('delete_post', { id: id });
    if(res.success) location.reload();
}

function setupPostForm() {
    const form = document.getElementById('post-form');
    if(!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const title = document.getElementById('title').value;
        const content = document.getElementById('content').value;
        const fileInput = document.getElementById('post-image');
        
        let imageUrl = null;
        if (fileInput.files[0]) {
            const formData = new FormData();
            formData.append('image', fileInput.files[0]);
            const uploadRes = await api('upload', formData, true);
            if(uploadRes.success) imageUrl = uploadRes.data;
        }

        const res = await api('create_post', { title, content, image_url: imageUrl });
        if (res.success) window.location.href = 'index.html';
        else alert('Errore: ' + res.message);
    };
}

function setupLogin() {
    const form = document.getElementById('login-form');
    if(!form) return;
    form.onsubmit = async (e) => {
        e.preventDefault();
        const res = await api('login', {
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
        });
        if (res.success) window.location.href = 'index.html';
        else alert(res.message);
    };
}

function setupRegister() {
    const form = document.getElementById('register-form');
    if(!form) return;
    form.onsubmit = async (e) => {
        e.preventDefault();
        const res = await api('register', {
            username: document.getElementById('username').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
        });
        if (res.success) window.location.href = 'index.html';
        else alert(res.message);
    };
}