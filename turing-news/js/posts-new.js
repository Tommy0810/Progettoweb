// Gestione post con API REST

let currentPage = 1;
let currentSearch = '';

async function createPost(title, content, imageUrl = null) {
    try {
        const post = await api.createPost(title, content, imageUrl);
        return post;
    } catch (error) {
        throw error;
    }
}

async function getPosts(page = 1, search = '') {
    try {
        const data = await api.getPosts(page, 5, search);
        return data;
    } catch (error) {
        console.error('Errore nel caricamento dei post:', error);
        return { posts: [], pagination: { total: 0, current_page: 1, total_pages: 0 } };
    }
}

async function renderPosts(posts) {
    const newsFeed = document.getElementById('news-feed');
    
    if (!newsFeed) return;
    
    // Mantieni la paginazione esistente
    const existingPagination = document.querySelector('.pagination');
    newsFeed.innerHTML = '';
    
    if (posts.length === 0) {
        newsFeed.innerHTML = '<p>Nessuna notizia disponibile. Sii il primo a postare!</p>';
        return;
    }
    
    const user = await getCurrentUser();
    
    for (const post of posts) {
        const postElement = document.createElement('div');
        postElement.className = 'news-card';
        postElement.dataset.postId = post.id;
        
        let imageHtml = '';
        if (post.image_url) {
            imageHtml = `<img src="${post.image_url}" alt="${post.title}" class="post-image">`;
        }
        
        // Verifica se l'utente ha messo like
        let likedClass = '';
        if (user) {
            try {
                const hasLiked = await api.checkLike(post.id);
                likedClass = hasLiked ? 'liked' : '';
            } catch (error) {
                console.error('Errore controllo like:', error);
            }
        }
        
        postElement.innerHTML = `
            <h3>${post.title}</h3>
            <p><small>Pubblicato da ${post.username} il ${new Date(post.created_at).toLocaleDateString()}</small></p>
            ${imageHtml}
            <p>${post.content}</p>
            <div class="post-stats">
                <button class="like-btn ${likedClass}" data-post-id="${post.id}">
                    <span class="like-count">${post.likes_count}</span> Like
                </button>
                <button class="comment-btn" data-post-id="${post.id}">
                    ${post.comments_count} Commenti
                </button>
                <button class="share-btn" data-post-id="${post.id}">
                    ${post.shares_count} Condivisioni
                </button>
            </div>
            <div class="comments-section" id="comments-${post.id}" style="display: none;">
                <div class="comments-list"></div>
                <form class="add-comment-form">
                    <textarea placeholder="Aggiungi un commento..." required></textarea>
                    <button type="submit">Invia</button>
                </form>
            </div>
        `;
        
        newsFeed.appendChild(postElement);
        setupPostInteractions(post.id);
    }
    
    // Ripristina la paginazione se esisteva
    if (existingPagination) {
        newsFeed.appendChild(existingPagination);
    }
}

function setupPostInteractions(postId) {
    // LIKE
    const likeBtn = document.querySelector(`.like-btn[data-post-id="${postId}"]`);
    if (likeBtn) {
        likeBtn.addEventListener('click', async function() {
            const user = await getCurrentUser();
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
            
            try {
                const result = await api.toggleLike(postId);
                this.classList.toggle('liked');
                this.querySelector('.like-count').textContent = result.likes_count;
            } catch (error) {
                alert('Errore: ' + error.message);
            }
        });
    }
    
    // COMMENTI
    const commentBtn = document.querySelector(`.comment-btn[data-post-id="${postId}"]`);
    if (commentBtn) {
        commentBtn.addEventListener('click', async function() {
            const commentsSection = document.getElementById(`comments-${postId}`);
            if (commentsSection.style.display === 'none') {
                commentsSection.style.display = 'block';
                await loadComments(postId);
            } else {
                commentsSection.style.display = 'none';
            }
        });
    }
    
    // CONDIVISIONE
    const shareBtn = document.querySelector(`.share-btn[data-post-id="${postId}"]`);
    if (shareBtn) {
        shareBtn.addEventListener('click', async function() {
            const user = await getCurrentUser();
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
            
            try {
                const result = await api.sharePost(postId);
                this.textContent = `${result.shares_count} Condivisioni`;
                this.classList.add('shared');
                setTimeout(() => this.classList.remove('shared'), 1000);
            } catch (error) {
                alert('Errore: ' + error.message);
            }
        });
    }
    
    // AGGIUNGI COMMENTO
    const commentForm = document.querySelector(`#comments-${postId} .add-comment-form`);
    if (commentForm) {
        commentForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const textarea = this.querySelector('textarea');
            const content = textarea.value.trim();
            
            if (content) {
                try {
                    await api.addComment(postId, content);
                    textarea.value = '';
                    await loadComments(postId);
                    
                    // Aggiorna contatore commenti
                    const commentBtn = document.querySelector(`.comment-btn[data-post-id="${postId}"]`);
                    const currentCount = parseInt(commentBtn.textContent);
                    commentBtn.textContent = `${currentCount + 1} Commenti`;
                } catch (error) {
                    alert('Errore: ' + error.message);
                }
            }
        });
    }
}

async function loadComments(postId) {
    const commentsList = document.querySelector(`#comments-${postId} .comments-list`);
    if (!commentsList) return;
    
    try {
        const comments = await api.getComments(postId);
        commentsList.innerHTML = '';
        
        if (comments.length === 0) {
            commentsList.innerHTML = '<p>Nessun commento ancora. Sii il primo a commentare!</p>';
            return;
        }
        
        comments.forEach(comment => {
            const commentElement = document.createElement('div');
            commentElement.className = 'comment';
            commentElement.innerHTML = `
                <strong>${comment.username}</strong>
                <small>${new Date(comment.created_at).toLocaleString()}</small>
                <p>${comment.content}</p>
            `;
            commentsList.appendChild(commentElement);
        });
    } catch (error) {
        commentsList.innerHTML = '<p>Errore nel caricamento dei commenti</p>';
    }
}

async function renderPaginatedPosts(page = 1, search = '') {
    currentPage = page;
    currentSearch = search;
    
    const data = await getPosts(page, search);
    await renderPosts(data.posts);
    setupPagination(data.pagination.total_pages, data.pagination.current_page);
}

function setupPagination(totalPages, currentPageNum) {
    const paginationContainer = document.createElement('div');
    paginationContainer.className = 'pagination';
    
    if (currentPageNum > 1) {
        const prevLink = document.createElement('a');
        prevLink.href = '#';
        prevLink.textContent = '« Precedente';
        prevLink.addEventListener('click', (e) => {
            e.preventDefault();
            renderPaginatedPosts(currentPageNum - 1, currentSearch);
        });
        paginationContainer.appendChild(prevLink);
    }
    
    for (let i = 1; i <= totalPages; i++) {
        const pageLink = document.createElement('a');
        pageLink.href = '#';
        pageLink.textContent = i;
        if (i === currentPageNum) {
            pageLink.className = 'active';
        } else {
            pageLink.addEventListener('click', (e) => {
                e.preventDefault();
                renderPaginatedPosts(i, currentSearch);
            });
        }
        paginationContainer.appendChild(pageLink);
    }
    
    if (currentPageNum < totalPages) {
        const nextLink = document.createElement('a');
        nextLink.href = '#';
        nextLink.textContent = 'Successivo »';
        nextLink.addEventListener('click', (e) => {
            e.preventDefault();
            renderPaginatedPosts(currentPageNum + 1, currentSearch);
        });
        paginationContainer.appendChild(nextLink);
    }
    
    const newsFeed = document.getElementById('news-feed');
    if (newsFeed) {
        const existingPagination = document.querySelector('.pagination');
        if (existingPagination) {
            newsFeed.replaceChild(paginationContainer, existingPagination);
        } else {
            newsFeed.appendChild(paginationContainer);
        }
    }
}

function setupSearch() {
    const searchForm = document.getElementById('search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const query = document.getElementById('search-input').value.trim();
            await renderPaginatedPosts(1, query);
        });
    }
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', async function() {
            if (this.value.trim() === '') {
                await renderPaginatedPosts(1, '');
            }
        });
    }
}

async function uploadImage(file) {
    try {
        const imageUrl = await api.uploadImage(file);
        return imageUrl;
    } catch (error) {
        throw error;
    }
}