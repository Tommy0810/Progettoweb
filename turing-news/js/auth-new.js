// Funzioni di autenticazione che usano le API REST

async function register(username, email, password) {
    try {
        const user = await api.register(username, email, password);
        localStorage.setItem('currentUser', JSON.stringify(user));
        return user;
    } catch (error) {
        throw error;
    }
}

async function login(email, password) {
    try {
        const user = await api.login(email, password);
        localStorage.setItem('currentUser', JSON.stringify(user));
        return user;
    } catch (error) {
        throw error;
    }
}

function logout() {
    api.logout();
    localStorage.removeItem('currentUser');
}

async function getCurrentUser() {
    // Prima controlla il localStorage
    const cachedUser = localStorage.getItem('currentUser');
    if (!cachedUser) return null;

    try {
        // Verifica che il token sia ancora valido
        const user = await api.getCurrentUser();
        localStorage.setItem('currentUser', JSON.stringify(user));
        return user;
    } catch (error) {
        // Token scaduto o non valido
        localStorage.removeItem('currentUser');
        return null;
    }
}

async function checkAuthStatus() {
    const user = await getCurrentUser();
    const loginLink = document.getElementById('login-link');
    const registerLink = document.getElementById('register-link');
    const dashboardLink = document.getElementById('dashboard-link');
    const postLink = document.getElementById('post-link');
    const logoutLink = document.getElementById('logout-link');
    
    if (user) {
        if (loginLink) loginLink.style.display = 'none';
        if (registerLink) registerLink.style.display = 'none';
        if (dashboardLink) dashboardLink.style.display = 'inline';
        if (postLink) postLink.style.display = 'inline';
        if (logoutLink) logoutLink.style.display = 'inline';
    } else {
        if (loginLink) loginLink.style.display = 'inline';
        if (registerLink) registerLink.style.display = 'inline';
        if (dashboardLink) dashboardLink.style.display = 'none';
        if (postLink) postLink.style.display = 'none';
        if (logoutLink) logoutLink.style.display = 'none';
    }

    return user;
}