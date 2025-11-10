// Configurazione API
const API_BASE_URL = 'http://localhost/turing-news/api';

// Classe per gestire le chiamate API
class ApiClient {
    constructor() {
        this.baseUrl = API_BASE_URL;
        this.token = localStorage.getItem('token');
    }

    // Headers comuni per le richieste
    getHeaders(isFormData = false) {
        const headers = {};
        
        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        return headers;
    }

    // Metodo generico per chiamate API
    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/${endpoint}`, {
                ...options,
                headers: {
                    ...this.getHeaders(options.isFormData),
                    ...options.headers
                }
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'Errore nella richiesta');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Salva token
    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    }

    // Rimuovi token
    clearToken() {
        this.token = null;
        localStorage.removeItem('token');
    }

    // ==================== AUTH ====================
    
    async register(username, email, password) {
        const data = await this.request('auth.php', {
            method: 'POST',
            body: JSON.stringify({
                action: 'register',
                username,
                email,
                password
            })
        });

        this.setToken(data.data.token);
        return data.data;
    }

    async login(email, password) {
        const data = await this.request('auth.php', {
            method: 'POST',
            body: JSON.stringify({
                action: 'login',
                email,
                password
            })
        });

        this.setToken(data.data.token);
        return data.data;
    }

    async getCurrentUser() {
        if (!this.token) return null;

        try {
            const data = await this.request('auth.php', {
                method: 'GET'
            });
            return data.data;
        } catch (error) {
            this.clearToken();
            return null;
        }
    }

    logout() {
        this.clearToken();
    }

    // ==================== POSTS ====================
    
    async getPosts(page = 1, perPage = 5, search = '') {
        const params = new URLSearchParams({
            page: page.toString(),
            per_page: perPage.toString()
        });

        if (search) {
            params.append('search', search);
        }

        const data = await this.request(`posts.php?${params.toString()}`, {
            method: 'GET'
        });

        return data.data;
    }

    async getUserPosts(userId) {
        const params = new URLSearchParams({
            user_id: userId.toString()
        });

        const data = await this.request(`posts.php?${params.toString()}`, {
            method: 'GET'
        });

        return data.data;
    }

    async createPost(title, content, imageUrl = null) {
        const data = await this.request('posts.php', {
            method: 'POST',
            body: JSON.stringify({
                title,
                content,
                image_url: imageUrl
            })
        });

        return data.data;
    }

    async deletePost(postId) {
        const data = await this.request(`posts.php?id=${postId}`, {
            method: 'DELETE'
        });

        return data;
    }

    // ==================== INTERACTIONS ====================
    
    async toggleLike(postId) {
        const data = await this.request('interactions.php', {
            method: 'POST',
            body: JSON.stringify({
                action: 'like',
                post_id: postId
            })
        });

        return data.data;
    }

    async addComment(postId, content) {
        const data = await this.request('interactions.php', {
            method: 'POST',
            body: JSON.stringify({
                action: 'comment',
                post_id: postId,
                content
            })
        });

        return data.data;
    }

    async getComments(postId) {
        const params = new URLSearchParams({
            action: 'comments',
            post_id: postId.toString()
        });

        const data = await this.request(`interactions.php?${params.toString()}`, {
            method: 'GET'
        });

        return data.data;
    }

    async getLikedPosts() {
        const params = new URLSearchParams({
            action: 'liked'
        });

        const data = await this.request(`interactions.php?${params.toString()}`, {
            method: 'GET'
        });

        return data.data;
    }

    async checkLike(postId) {
        const params = new URLSearchParams({
            action: 'check_like',
            post_id: postId.toString()
        });

        const data = await this.request(`interactions.php?${params.toString()}`, {
            method: 'GET'
        });

        return data.data.liked;
    }

    // ==================== UPLOAD ====================
    
    async uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`${this.baseUrl}/upload.php`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Errore durante il caricamento');
        }

        return data.data.url;
    }
}

// Istanza globale del client API
const api = new ApiClient();