const authModal = document.getElementById('auth-modal');
const profileModal = document.getElementById('profile-modal');
const landingPanel = document.getElementById('landing-panel');
const appPanel = document.getElementById('app-panel');
const authMessage = document.getElementById('auth-message');
const signInButton = document.getElementById('open-auth-button');
const accountIdentity = document.querySelector('.account-identity');
const accountMenuTrigger = document.getElementById('account-menu-trigger');
const accountDropdown = document.getElementById('account-dropdown');
const notificationMenu = document.getElementById('notification-menu');
const notificationBell = document.getElementById('notification-bell');
const notificationsPanel = document.getElementById('notifications-panel');
const insightsRangeControl = document.getElementById('insights-range');
const siteIntro = document.getElementById('site-intro');
const themeToggle = document.getElementById('theme-toggle');
const miniAssistantPanel = document.getElementById('mini-assistant-panel');
const miniAssistant = document.getElementById('mini-assistant');
const miniAssistantTrigger = document.getElementById('mini-assistant-trigger');
const miniChatMessages = document.getElementById('mini-chat-messages');
const miniChatInput = document.getElementById('mini-chat-input');
const miniChatSignIn = document.getElementById('mini-chat-signin');
let merchantProfession = 'General retailer';
let merchantAuthenticated = false;
let miniConversation = [];
let copilotConversation = [];
let copilotRequestPending = false;

function addMiniChatMessage(text, role, pending = false) {
    const message = document.createElement('p');
    message.className = `mini-chat-message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
    if (pending) message.classList.add('is-pending');
    message.textContent = text;
    miniChatMessages.appendChild(message);
    miniChatMessages.scrollTop = miniChatMessages.scrollHeight;
    return message;
}

function addCopilotMessage(text, role, pending = false) {
    const message = document.createElement('p');
    message.className = `copilot-message ${role}-message${pending ? ' is-pending' : ''}`;
    message.textContent = text;
    const conversation = document.getElementById('ai-response');
    conversation.appendChild(message);
    conversation.scrollTop = conversation.scrollHeight;
    return message;
}

function resetCopilotConversation() {
    copilotConversation = [];
    document.getElementById('ai-response').replaceChildren();
    document.getElementById('question').placeholder = 'Ask about your business…';
}

function resetMiniAssistant() {
    miniConversation = [];
    miniChatMessages.replaceChildren();
    addMiniChatMessage(merchantAuthenticated
        ? `Hi! I'm Mitra. I can help with ${merchantProfession.toLowerCase()} sales, stock, and business questions.`
        : 'Hi! I can answer questions about your business once you sign in.', 'assistant');
    miniChatSignIn.hidden = merchantAuthenticated;
    document.getElementById('mini-assistant-note').innerText = merchantAuthenticated
        ? 'Grounded in your sales and inventory.'
        : 'Sign in to connect your business data.';
}

function setMiniAssistantOpen(isOpen) {
    miniAssistantPanel.hidden = !isOpen;
    miniAssistant.classList.toggle('is-open', isOpen);
    miniAssistantTrigger.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) window.setTimeout(() => miniChatInput.focus(), 0);
}

resetMiniAssistant();
miniAssistantTrigger.addEventListener('click', () => setMiniAssistantOpen(miniAssistantPanel.hidden));
document.getElementById('mini-assistant-close').addEventListener('click', () => setMiniAssistantOpen(false));
document.getElementById('mini-chat-signin').addEventListener('click', () => {
    setMiniAssistantOpen(false);
    openAuth('login');
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !miniAssistantPanel.hidden) {
        setMiniAssistantOpen(false);
        miniAssistantTrigger.focus();
    }
});

document.getElementById('mini-chat-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = miniChatInput.value.trim();
    if (!question) return;
    addMiniChatMessage(question, 'user');
    miniChatInput.value = '';

    if (!merchantAuthenticated) {
        addMiniChatMessage('Sign in first and I can answer using your sales and inventory.', 'assistant');
        miniChatSignIn.hidden = false;
        return;
    }

    const history = miniConversation.slice(-8);
    miniConversation.push({ role: 'user', content: question });
    const thinking = addMiniChatMessage('Mitra is thinking…', 'assistant', true);
    const sendButton = document.querySelector('#mini-chat-form button[type="submit"]');
    sendButton.disabled = true;
    try {
        const response = await fetch('/api/ask-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, range: insightsRangeControl.value, history }),
        });
        const data = await response.json();
        thinking.remove();
        if (response.status === 401) {
            setSignedOut('Your session has expired. Please sign in again.');
            return;
        }
        if (!response.ok) throw new Error(data.error || data.message || 'I could not answer that right now.');
        const answer = data.answer || 'I did not receive an answer. Please try again.';
        addMiniChatMessage(answer, 'assistant');
        miniConversation.push({ role: 'assistant', content: answer });
        miniConversation = miniConversation.slice(-8);
    } catch (error) {
        thinking.remove();
        addMiniChatMessage(error.message, 'assistant');
    } finally {
        sendButton.disabled = false;
        miniChatInput.focus();
    }
});

function setTheme(theme, persist = false) {
    const selectedTheme = theme === 'light' ? 'light' : 'dark';
    const isDark = selectedTheme === 'dark';
    document.documentElement.dataset.theme = selectedTheme;
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
    themeToggle.title = `Switch to ${isDark ? 'light' : 'dark'} theme`;
    if (persist) {
        try {
            window.localStorage.setItem('mitra-theme', selectedTheme);
        } catch {
            // The selected theme still applies for this page view if storage is unavailable.
        }
    }
}

let savedTheme = 'dark';
try {
    savedTheme = window.localStorage.getItem('mitra-theme') || 'dark';
} catch {
    // Keep the dark theme when browser storage is unavailable.
}
setTheme(savedTheme);
themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
});

if (siteIntro) {
    const finishIntro = () => {
        siteIntro.hidden = true;
        document.body.classList.remove('intro-active');
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        finishIntro();
    } else {
        document.body.classList.add('intro-active');
        siteIntro.addEventListener('animationend', (event) => {
            if (event.target === siteIntro && event.animationName === 'intro-curtain') finishIntro();
        });
        window.setTimeout(finishIntro, 3400);
    }
}

function showAuthForm(mode) {
    document.getElementById('login-form').hidden = mode !== 'login';
    document.getElementById('register-form').hidden = mode !== 'register';
    document.getElementById('auth-title').innerText = mode === 'login' ? 'Welcome back' : 'Create your account';
    document.getElementById('auth-intro').innerText = mode === 'login'
        ? 'Sign in to pick up where you left off.'
        : 'Start getting a clearer view of your business.';
    document.getElementById('show-login').classList.toggle('is-active', mode === 'login');
    document.getElementById('show-register').classList.toggle('is-active', mode === 'register');
    authMessage.innerText = '';
}

function openAuth(mode = 'login') {
    showAuthForm(mode);
    authModal.hidden = false;
    const field = document.getElementById(mode === 'login' ? 'login-email' : 'register-username');
    window.setTimeout(() => field.focus(), 0);
}

function closeAuth() {
    authModal.hidden = true;
}

function updateBusinessSpecificAILabels() {
    const placeholder = `Ask about your ${merchantProfession} business…`;
    document.getElementById('question').placeholder = placeholder;
    miniChatInput.placeholder = placeholder;
    document.getElementById('mini-assistant-scope').textContent = `Sales, stock, and promotion ideas for your ${merchantProfession} business`;
}

function setSignedIn(user) {
    landingPanel.hidden = true;
    closeAuth();
    signInButton.hidden = true;
    accountIdentity.hidden = false;
    notificationMenu.hidden = false;
    appPanel.hidden = false;
    miniAssistant.hidden = false;
    const username = String(user.username || '').trim();
    document.getElementById('account-name').textContent = username;
    accountMenuTrigger.textContent = Array.from(username)[0]?.toLocaleUpperCase() || 'M';
    merchantProfession = user.profession || 'General retailer';
    resetCopilotConversation();
    updateBusinessSpecificAILabels();
    merchantAuthenticated = true;
    resetMiniAssistant();
    setMiniAssistantOpen(false);
    setActivePage(getPageFromHash(), false);
    loadDashboard();
    loadDailyBriefing();
    loadRecentSales();
    loadInventory();
}

function getPageFromHash() {
    const requestedPage = window.location.hash.slice(1);
    return ['overview', 'sales', 'inventory', 'copilot'].includes(requestedPage) ? requestedPage : 'overview';
}

function setActivePage(page, updateHistory = true) {
    const titles = { overview: 'Overview', sales: 'Sales', inventory: 'Inventory', copilot: 'AI Copilot' };
    if (!titles[page]) page = 'overview';
    document.querySelectorAll('[data-app-page]').forEach((section) => {
        section.hidden = section.dataset.appPage !== page;
    });
    document.querySelectorAll('.app-nav-item').forEach((button) => {
        const active = button.dataset.pageTarget === page;
        button.classList.toggle('is-active', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });
    document.getElementById('page-breadcrumb').innerText = titles[page];
    if (updateHistory && window.location.hash !== `#${page}`) {
        window.history.pushState({ page }, '', `#${page}`);
    }
}

document.querySelectorAll('[data-page-target]').forEach((button) => {
    button.addEventListener('click', () => setActivePage(button.dataset.pageTarget));
});

window.addEventListener('popstate', () => setActivePage(getPageFromHash(), false));

function setSignedOut(message = '') {
    merchantAuthenticated = false;
    resetCopilotConversation();
    miniAssistant.hidden = true;
    setMiniAssistantOpen(false);
    appPanel.hidden = true;
    landingPanel.hidden = false;
    signInButton.hidden = false;
    accountIdentity.hidden = true;
    notificationMenu.hidden = true;
    setNotificationsOpen(false);
    closeAuth();
    document.getElementById('question').placeholder = 'Ask about your business…';
    miniChatInput.placeholder = 'Ask about your business…';
    document.getElementById('mini-assistant-scope').textContent = 'Business-specific sales and stock help';
    document.getElementById('daily-briefing-content').textContent = 'Your daily briefing will appear here after you sign in.';
    document.getElementById('daily-briefing-content').dataset.loaded = '';
    document.getElementById('daily-briefing-updated').textContent = '';
    document.getElementById('promotion-plan-output').hidden = true;
    document.getElementById('promotion-plan-output').textContent = '';
    document.getElementById('landing-message').innerText = message;
    showAuthForm('login');
    resetMiniAssistant();
}

async function submitAuth(endpoint, payload) {
    authMessage.innerText = 'Please wait…';
    try {
        const response = await fetch(`/api/users/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not sign in.');
        setSignedIn(data.user);
    } catch (error) {
        authMessage.innerText = error.message;
    }
}

document.getElementById('open-auth-button').addEventListener('click', () => openAuth('login'));
document.getElementById('hero-create-account').addEventListener('click', () => openAuth('register'));
document.getElementById('close-auth-button').addEventListener('click', closeAuth);
document.getElementById('show-login').addEventListener('click', () => showAuthForm('login'));
document.getElementById('show-register').addEventListener('click', () => showAuthForm('register'));
authModal.addEventListener('click', (event) => {
    if (event.target === authModal) closeAuth();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !authModal.hidden) closeAuth();
    if (event.key === 'Escape' && !profileModal.hidden) closeBusinessProfile();
});

function closeBusinessProfile() {
    profileModal.hidden = true;
}

function openBusinessProfile() {
    setAccountMenuOpen(false);
    document.getElementById('profile-profession').value = merchantProfession;
    document.getElementById('profile-message').innerText = '';
    profileModal.hidden = false;
    document.getElementById('profile-profession').focus();
}

document.getElementById('edit-business-profile').addEventListener('click', openBusinessProfile);
document.getElementById('close-profile-button').addEventListener('click', closeBusinessProfile);
profileModal.addEventListener('click', (event) => {
    if (event.target === profileModal) closeBusinessProfile();
});

document.getElementById('profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('profile-message');
    message.innerText = 'Saving…';
    try {
        const response = await fetch('/api/users/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profession: document.getElementById('profile-profession').value }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not update your business type.');
        merchantProfession = data.user.profession || 'General retailer';
        resetCopilotConversation();
        updateBusinessSpecificAILabels();
        const period = insightsRangeControl.options[insightsRangeControl.selectedIndex].text;
        document.getElementById('ai-context-label').innerText = `Sales from ${period} · focused on your ${merchantProfession} business`;
        resetMiniAssistant();
        document.getElementById('promotion-plan-output').hidden = true;
        document.getElementById('promotion-plan-output').textContent = '';
        loadDailyBriefing(true);
        closeBusinessProfile();
    } catch (error) {
        message.innerText = error.message;
    }
});

document.getElementById('login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth('login', {
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value,
    });
});

document.getElementById('register-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth('register', {
        username: document.getElementById('register-username').value,
        email: document.getElementById('register-email').value,
        profession: document.getElementById('register-profession').value,
        password: document.getElementById('register-password').value,
    });
});

document.querySelectorAll('.password-toggle').forEach((button) => {
    button.addEventListener('click', () => {
        const passwordInput = document.getElementById(button.dataset.passwordTarget);
        const shouldShow = passwordInput.type === 'password';
        passwordInput.type = shouldShow ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(shouldShow));
        button.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
        button.title = shouldShow ? 'Hide password' : 'Show password';
        button.querySelector('.eye-slash').hidden = !shouldShow;
    });
});

document.querySelectorAll('.copilot-prompt').forEach((button) => {
    button.addEventListener('click', () => {
        document.getElementById('question').value = button.dataset.question;
        askAI();
    });
});

document.getElementById('copilot-question-form').addEventListener('submit', (event) => {
    event.preventDefault();
    askAI();
});

document.getElementById('logout-button').addEventListener('click', async () => {
    await fetch('/api/users/logout', { method: 'POST' });
    setAccountMenuOpen(false);
    setSignedOut('You have signed out.');
});

document.getElementById('refresh-sales').addEventListener('click', loadRecentSales);
document.getElementById('refresh-inventory').addEventListener('click', loadInventory);
document.getElementById('refresh-daily-briefing').addEventListener('click', () => loadDailyBriefing(true));
document.getElementById('generate-promotion-plan').addEventListener('click', generatePromotionPlan);
insightsRangeControl.addEventListener('change', loadDashboard);

function setNotificationsOpen(isOpen) {
    notificationsPanel.hidden = !isOpen;
    notificationBell.setAttribute('aria-expanded', String(isOpen));
}

notificationBell.addEventListener('click', () => {
    const shouldOpen = notificationsPanel.hidden;
    setNotificationsOpen(shouldOpen);
    if (shouldOpen) loadNotifications();
});

document.getElementById('mark-notifications-read').addEventListener('click', async () => {
    try {
        await fetch('/api/notifications/read-all', { method: 'PATCH' });
        loadNotifications();
    } catch (error) {
        document.getElementById('notification-summary').innerText = 'Could not update notifications.';
    }
});

document.getElementById('inventory-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('inventory-message');
    message.innerText = 'Adding item…';
    try {
        const response = await fetch('/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product: document.getElementById('inventory-product').value,
                quantity: document.getElementById('inventory-quantity').value,
                lowStockThreshold: document.getElementById('inventory-threshold').value,
            }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not add the item.');
        message.innerText = data.message;
        document.getElementById('inventory-product').value = '';
        document.getElementById('inventory-quantity').value = '';
        document.getElementById('inventory-threshold').value = '5';
        await loadInventory();
    } catch (error) {
        message.innerText = error.message;
    }
});

document.getElementById('inventory-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-restock-id]');
    if (!button) return;
    const row = button.closest('.inventory-row');
    const quantity = row.querySelector('.restock-quantity').value;
    const message = document.getElementById('inventory-list-message');
    button.disabled = true;
    try {
        const response = await fetch(`/api/inventory/${encodeURIComponent(button.dataset.restockId)}/restock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not restock this item.');
        message.innerText = data.message;
        await loadInventory();
    } catch (error) {
        message.innerText = error.message;
        button.disabled = false;
    }
});

function setAccountMenuOpen(isOpen) {
    accountDropdown.hidden = !isOpen;
    accountMenuTrigger.setAttribute('aria-expanded', String(isOpen));
}

accountMenuTrigger.addEventListener('click', () => {
    setAccountMenuOpen(accountDropdown.hidden);
});

document.addEventListener('click', (event) => {
    if (!event.target.closest('.account-menu')) setAccountMenuOpen(false);
    if (!event.target.closest('.notification-menu')) setNotificationsOpen(false);
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !accountDropdown.hidden) {
        setAccountMenuOpen(false);
        accountMenuTrigger.focus();
    }
    if (event.key === 'Escape' && !notificationsPanel.hidden) {
        setNotificationsOpen(false);
        notificationBell.focus();
    }
});

async function restoreSession() {
    try {
        const response = await fetch('/api/users/me');
        if (!response.ok) return setSignedOut();
        const data = await response.json();
        setSignedIn(data.user);
    } catch {
        setSignedOut('Could not connect to the server. Please try again.');
    }
}

async function loadDashboard() {
    const chartMessage = document.getElementById('chart-message');
    chartMessage.innerText = 'Loading sales data…';
    try {
        const range = insightsRangeControl.value;
        const response = await fetch(`/api/insights?range=${encodeURIComponent(range)}`, { cache: 'no-store' });
        if (response.status === 401) return setSignedOut('Your session has expired. Please sign in again.');
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not load sales insights.');
        document.getElementById('insights-message').innerText = '';
        document.getElementById('sales').innerText = new Intl.NumberFormat('en-IN', {
            style: 'currency', currency: 'INR', maximumFractionDigits: 2,
        }).format(data.summary.sales);
        document.getElementById('orders').innerText = data.summary.orders;
        document.getElementById('products').innerText = data.summary.products;
        document.getElementById('sales-page-total').innerText = document.getElementById('sales').innerText;
        document.getElementById('sales-page-orders').innerText = data.summary.orders;
        document.getElementById('sales-page-units').innerText = data.summary.products;
        document.getElementById('trend-period-label').innerText = range === 'all' ? 'Monthly sales' : 'Daily sales';
        document.getElementById('ai-context-label').innerText = `Sales from ${data.periodLabel || 'the selected period'} · focused on your ${merchantProfession} business`;
        renderSalesChart(completeTrend(data.trend, range), range);
        renderTopProducts(data.topProducts);
    } catch (error) {
        document.getElementById('insights-message').innerText = error.message;
        chartMessage.innerText = `Could not load the chart: ${error.message}`;
    }
}

function completeTrend(trend, range) {
    if (!trend?.length) return [];
    const salesByDate = new Map(trend.map((point) => [point._id, Number(point.sales)]));
    const completed = [];

    if (range === 'all') {
        const [firstYear, firstMonth] = trend[0]._id.split('-').map(Number);
        const cursor = new Date(Date.UTC(firstYear, firstMonth - 1, 1));
        const end = new Date();
        end.setUTCDate(1);
        end.setUTCHours(0, 0, 0, 0);
        while (cursor <= end) {
            const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
            completed.push({ _id: key, sales: salesByDate.get(key) || 0 });
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
        return completed;
    }

    const days = { '7d': 7, '30d': 30, '90d': 90 }[range];
    const cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    cursor.setUTCDate(cursor.getUTCDate() - (days - 1));
    for (let index = 0; index < days; index += 1) {
        const key = cursor.toISOString().slice(0, 10);
        completed.push({ _id: key, sales: salesByDate.get(key) || 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return completed;
}

function addSvgElement(svg, tagName, attributes, text = '') {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
    if (text) element.textContent = text;
    svg.appendChild(element);
    return element;
}

function formatTrendLabel(key, range) {
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day || 1));
    const options = range === 'all'
        ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
        : { day: 'numeric', month: 'short', timeZone: 'UTC' };
    return new Intl.DateTimeFormat(undefined, options).format(date);
}

function renderSalesChart(trend, range) {
    const svg = document.getElementById('sales-chart');
    const message = document.getElementById('chart-message');
    svg.replaceChildren();

    if (!trend?.length) {
        svg.setAttribute('hidden', '');
        message.innerText = 'No sales recorded in this date range yet.';
        return;
    }

    svg.removeAttribute('hidden');
    message.innerText = '';
    const width = 760;
    const height = 290;
    const left = 72;
    const right = 20;
    const top = 20;
    const bottom = 238;
    const maxSales = Math.max(...trend.map((point) => Number(point.sales)), 1);
    const yLabel = new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1,
    });

    const defs = addSvgElement(svg, 'defs', {});
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', 'sales-area-gradient');
    gradient.setAttribute('x1', '0');
    gradient.setAttribute('x2', '0');
    gradient.setAttribute('y1', '0');
    gradient.setAttribute('y2', '1');
    [['0%', '0.28'], ['100%', '0.01']].forEach(([offset, opacity]) => {
        const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', '#78a4ff');
        stop.setAttribute('stop-opacity', opacity);
        gradient.appendChild(stop);
    });
    defs.appendChild(gradient);

    for (let step = 0; step <= 4; step += 1) {
        const ratio = step / 4;
        const y = top + ratio * (bottom - top);
        const value = maxSales * (1 - ratio);
        addSvgElement(svg, 'line', {
            x1: left, y1: y, x2: width - right, y2: y, class: 'chart-grid-line',
        });
        addSvgElement(svg, 'text', {
            x: left - 10, y: y + 4, class: 'chart-axis-label', 'text-anchor': 'end',
        }, yLabel.format(value));
    }

    const points = trend.map((point, index) => {
        const x = trend.length === 1
            ? (left + width - right) / 2
            : left + (index / (trend.length - 1)) * (width - left - right);
        const y = bottom - (Number(point.sales) / maxSales) * (bottom - top);
        return { x, y, point };
    });
    const pointString = points.map(({ x, y }) => `${x},${y}`).join(' ');
    const areaString = `${left},${bottom} ${pointString} ${width - right},${bottom}`;
    addSvgElement(svg, 'polygon', { points: areaString, class: 'chart-area' });
    addSvgElement(svg, 'polyline', { points: pointString, class: 'chart-series' });
    points.forEach(({ x, y, point }) => {
        if (Number(point.sales) > 0) addSvgElement(svg, 'circle', { cx: x, cy: y, r: 4, class: 'chart-point' });
    });

    const labelIndexes = [...new Set([0, Math.round((points.length - 1) / 2), points.length - 1])];
    labelIndexes.forEach((index) => {
        const { x, point } = points[index];
        addSvgElement(svg, 'text', {
            x, y: height - 14, class: 'chart-axis-label', 'text-anchor': index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle',
        }, formatTrendLabel(point._id, range));
    });
}

function renderTopProducts(products) {
    const list = document.getElementById('top-products-list');
    const message = document.getElementById('top-products-message');
    list.replaceChildren();

    if (!products?.length) {
        message.innerText = 'No products sold in this date range yet.';
        return;
    }

    message.innerText = '';
    products.forEach((product, index) => {
        const item = document.createElement('li');
        const rank = document.createElement('span');
        rank.className = 'product-rank';
        rank.innerText = String(index + 1).padStart(2, '0');

        const details = document.createElement('div');
        details.className = 'product-details';
        const name = document.createElement('strong');
        name.textContent = product.productName || product._id;
        const units = document.createElement('span');
        units.textContent = `${product.units} ${product.units === 1 ? 'unit' : 'units'} sold`;
        details.append(name, units);

        const revenue = document.createElement('strong');
        revenue.className = 'product-revenue';
        revenue.textContent = new Intl.NumberFormat('en-IN', {
            style: 'currency', currency: 'INR', maximumFractionDigits: 2,
        }).format(product.revenue);
        item.append(rank, details, revenue);
        list.appendChild(item);
    });
}

function renderDailyBriefing(briefingText) {
    const content = document.getElementById('daily-briefing-content');
    const definitions = [
        { key: 'sales', title: 'Sales pulse', icon: '↗', pattern: /^(?:recent sales|sales pulse)(?:\s*\([^)]*\))?\s*:?\s*(.*)$/i, action: 'sales', button: 'View sales' },
        { key: 'stock', title: 'Stock watch', icon: '▤', pattern: /^(?:stock watch|inventory watch)\s*:?\s*(.*)$/i, action: 'inventory', button: 'Review inventory' },
        { key: 'action', title: 'Today’s action', icon: '✧', pattern: /^(?:today's action|one action for today|action for today)\s*:?\s*(.*)$/i, action: 'copilot', button: 'Ask Mitra about this' },
    ];
    const sections = new Map();
    let activeSection = null;

    String(briefingText || '').split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.trim().replace(/^#{1,6}\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/^[-*]\s*/, '').replace(/\*\*/g, '').replace(/[’‘]/g, "'");
        if (!line) return;
        const definition = definitions.find((item) => item.pattern.test(line));
        if (definition) {
            activeSection = definition;
            sections.set(definition.key, line.replace(definition.pattern, '$1').trim());
        } else if (activeSection) {
            const existing = sections.get(activeSection.key);
            sections.set(activeSection.key, existing ? `${existing}\n${line}` : line);
        }
    });

    const parsedSections = definitions
        .filter((definition) => sections.has(definition.key) && sections.get(definition.key))
        .map((definition) => ({ ...definition, body: sections.get(definition.key) }));
    const cards = parsedSections.length
        ? parsedSections
        : [{ key: 'briefing', title: 'Mitra’s briefing', icon: '✧', body: String(briefingText || 'No briefing details are available yet.') }];

    content.replaceChildren();
    cards.forEach((section) => {
        const card = document.createElement('article');
        card.className = `daily-briefing-section daily-briefing-${section.key}`;
        const heading = document.createElement('div');
        heading.className = 'daily-briefing-section-heading';
        const icon = document.createElement('span');
        icon.className = 'daily-briefing-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = section.icon;
        const title = document.createElement('h3');
        title.textContent = section.title;
        heading.append(icon, title);
        const body = document.createElement('p');
        body.className = 'daily-briefing-section-body';
        body.textContent = section.body;
        card.append(heading, body);

        if (section.action) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'briefing-action-button';
            button.textContent = section.button;
            button.addEventListener('click', () => {
                if (section.action === 'sales') setActivePage('sales');
                if (section.action === 'inventory') setActivePage('inventory');
                if (section.action === 'copilot') {
                    setActivePage('copilot');
                    const question = document.getElementById('question');
                    question.value = `Help me act on this recommendation from my daily briefing: ${section.body}`;
                    question.focus();
                }
            });
            card.appendChild(button);
        }
        content.appendChild(card);
    });
}

async function loadDailyBriefing(refresh = false) {
    const content = document.getElementById('daily-briefing-content');
    const updated = document.getElementById('daily-briefing-updated');
    const button = document.getElementById('refresh-daily-briefing');
    if (!content.dataset.loaded) content.textContent = 'Preparing your daily briefing…';
    button.disabled = true;

    try {
        const response = await fetch(`/api/daily-briefing${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
        const data = await response.json();
        if (response.status === 401) {
            setSignedOut('Your session has expired. Please sign in again.');
            return;
        }
        if (!response.ok) throw new Error(data.message || 'Could not load your daily briefing.');
        renderDailyBriefing(data.briefing || 'Mitra did not return a briefing. Refresh to try again.');
        content.dataset.loaded = 'true';
        const generatedAt = data.generatedAt ? new Date(data.generatedAt) : new Date();
        const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(generatedAt);
        updated.textContent = `${data.cached ? 'Today’s saved briefing' : 'Briefing refreshed'} · ${time}`;
    } catch (error) {
        content.textContent = error.message || 'Could not load your daily briefing.';
        content.dataset.loaded = '';
        updated.textContent = '';
    } finally {
        button.disabled = false;
    }
}

async function generatePromotionPlan() {
    const output = document.getElementById('promotion-plan-output');
    const button = document.getElementById('generate-promotion-plan');
    output.hidden = false;
    output.textContent = 'Comparing your last 30 days of sales with current stock…';
    button.disabled = true;

    try {
        const response = await fetch('/api/promotion-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        const data = await response.json();
        if (response.status === 401) {
            setSignedOut('Your session has expired. Please sign in again.');
            return;
        }
        if (!response.ok) throw new Error(data.message || 'Could not create a promotion plan.');
        output.textContent = data.plan || 'Mitra did not return a promotion plan.';
    } catch (error) {
        output.textContent = error.message || 'Could not create a promotion plan.';
    } finally {
        button.disabled = false;
    }
}

async function loadRecentSales() {
    const body = document.getElementById('sales-history-body');
    const message = document.getElementById('sales-history-message');
    message.innerText = 'Loading sales…';
    body.replaceChildren();

    try {
        const response = await fetch('/api/sales');
        if (response.status === 401) return setSignedOut('Your session has expired. Please sign in again.');
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not load recent sales.');

        if (!data.sales?.length) {
            message.innerText = 'No sales yet. Add your first sale to see it here.';
            return;
        }

        const rows = data.sales.map((sale) => {
            const row = document.createElement('tr');
            const values = [
                new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(sale.createdAt)),
                sale.product,
                String(sale.quantity),
                new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(sale.amount),
            ];
            values.forEach((value) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.appendChild(cell);
            });
            const actionCell = document.createElement('td');
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'delete-sale-button';
            deleteButton.textContent = 'Delete';
            deleteButton.setAttribute('aria-label', `Delete ${sale.product} sale`);
            deleteButton.addEventListener('click', () => deleteSale(sale, deleteButton));
            actionCell.appendChild(deleteButton);
            row.appendChild(actionCell);
            return row;
        });

        body.replaceChildren(...rows);
        message.innerText = `Showing ${rows.length} recent ${rows.length === 1 ? 'sale' : 'sales'}.`;
    } catch (error) {
        message.innerText = error.message;
    }
}

async function deleteSale(sale, button) {
    const confirmed = window.confirm(`Delete this sale of ${sale.product}? The amount will be removed from sales totals and the quantity returned to inventory.`);
    if (!confirmed) return;

    const message = document.getElementById('sales-history-message');
    button.disabled = true;
    message.textContent = 'Deleting sale…';
    try {
        const response = await fetch(`/api/sales/${encodeURIComponent(sale._id)}`, { method: 'DELETE' });
        const data = await response.json();
        if (response.status === 401) {
            setSignedOut('Your session has expired. Please sign in again.');
            return;
        }
        if (!response.ok) throw new Error(data.message || 'Could not delete the sale.');
        await Promise.all([loadDashboard(), loadRecentSales(), loadInventory()]);
        message.textContent = data.message;
        loadDailyBriefing(true);
    } catch (error) {
        message.textContent = error.message || 'Could not delete the sale.';
    } finally {
        button.disabled = false;
    }
}

async function loadInventory() {
    const message = document.getElementById('inventory-list-message');
    const list = document.getElementById('inventory-list');
    message.innerText = 'Loading inventory…';
    try {
        const response = await fetch('/api/inventory', { cache: 'no-store' });
        if (response.status === 401) return setSignedOut('Your session has expired. Please sign in again.');
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not load inventory.');
        const items = data.items || [];
        const lowStockItems = items.filter((item) => item.quantity <= item.lowStockThreshold);
        document.getElementById('inventory-count').innerText = items.length;
        document.getElementById('low-stock-count').innerText = lowStockItems.length;
        document.getElementById('inventory-units').innerText = items.reduce((total, item) => total + item.quantity, 0);
        renderInventory(items);
        message.innerText = items.length ? `${items.length} ${items.length === 1 ? 'product' : 'products'} tracked.` : 'No inventory yet. Add a product to start tracking stock.';
        await loadNotifications();
    } catch (error) {
        message.innerText = error.message;
        list.replaceChildren();
    }
}

function renderInventory(items) {
    const list = document.getElementById('inventory-list');
    list.replaceChildren();
    items.forEach((item) => {
        const row = document.createElement('article');
        row.className = 'inventory-row';
        const details = document.createElement('div');
        details.className = 'inventory-product-details';
        const name = document.createElement('strong');
        name.textContent = item.product;
        const threshold = document.createElement('span');
        threshold.textContent = `Refill alert at ${item.lowStockThreshold} ${item.lowStockThreshold === 1 ? 'unit' : 'units'}`;
        details.append(name, threshold);

        const stock = document.createElement('div');
        stock.className = 'inventory-stock';
        const quantity = document.createElement('strong');
        quantity.textContent = `${item.quantity} ${item.quantity === 1 ? 'unit' : 'units'}`;
        const status = document.createElement('span');
        const isLow = item.quantity <= item.lowStockThreshold;
        status.className = `stock-status${isLow ? ' is-low' : ''}`;
        status.textContent = isLow ? 'Low stock' : 'In stock';
        stock.append(quantity, status);

        const restock = document.createElement('div');
        restock.className = 'inventory-restock';
        const input = document.createElement('input');
        input.className = 'restock-quantity';
        input.type = 'number';
        input.min = '1';
        input.step = '1';
        input.placeholder = '+ Qty';
        input.setAttribute('aria-label', `Units to add for ${item.product}`);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'restock-button';
        button.dataset.restockId = item._id;
        button.textContent = 'Restock';
        restock.append(input, button);
        row.append(details, stock, restock);
        list.appendChild(row);
    });
}

async function loadNotifications() {
    if (notificationMenu.hidden) return;
    try {
        const response = await fetch('/api/notifications', { cache: 'no-store' });
        if (response.status === 401) return setSignedOut('Your session has expired. Please sign in again.');
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not load notifications.');
        const unreadCount = data.unreadCount || 0;
        const countBadge = document.getElementById('notification-count');
        countBadge.hidden = unreadCount === 0;
        countBadge.innerText = unreadCount > 99 ? '99+' : String(unreadCount);
        notificationBell.setAttribute('aria-label', unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications');
        document.getElementById('notification-summary').innerText = unreadCount
            ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}`
            : 'You are all caught up';

        const list = document.getElementById('notification-list');
        list.replaceChildren();
        if (!data.notifications?.length) {
            const empty = document.createElement('p');
            empty.className = 'notification-empty';
            empty.textContent = 'No inventory notifications yet.';
            list.appendChild(empty);
            return;
        }
        data.notifications.forEach((notification) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `notification-entry${notification.readAt ? '' : ' is-unread'}`;
            item.dataset.notificationId = notification._id;
            const icon = document.createElement('span');
            icon.className = 'notification-entry-icon';
            icon.textContent = '↓';
            const content = document.createElement('span');
            content.className = 'notification-entry-content';
            const message = document.createElement('strong');
            message.textContent = notification.message;
            const date = document.createElement('small');
            date.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(notification.createdAt));
            content.append(message, date);
            item.append(icon, content);
            item.addEventListener('click', async () => {
                if (!notification.readAt) {
                    try {
                        await fetch(`/api/notifications/${encodeURIComponent(notification._id)}/read`, { method: 'PATCH' });
                        loadNotifications();
                    } catch {
                        // Keep the notification visible if marking it read is temporarily unavailable.
                    }
                }
                setNotificationsOpen(false);
                if (notification.inventoryItemId) setActivePage('inventory');
            });
            list.appendChild(item);
        });
    } catch {
        document.getElementById('notification-summary').innerText = 'Could not load notifications.';
    }
}

async function addSale() {
    const product = document.getElementById('product').value.trim();
    const quantity = document.getElementById('quantity').value;
    const amount = document.getElementById('amount').value;
    const message = document.getElementById('message');
    if (!product || !quantity || amount === '') {
        message.innerText = 'Enter a product, quantity, and total amount.';
        return;
    }

    try {
        const response = await fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product, quantity, amount }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not add the sale.');
        message.innerText = data.message;
        document.getElementById('product').value = '';
        document.getElementById('quantity').value = '';
        document.getElementById('amount').value = '';
        loadDashboard();
        loadRecentSales();
        loadInventory();
    } catch (error) {
        message.innerText = error.message;
    }
}

async function askAI() {
    const question = document.getElementById('question').value.trim();
    const answerBox = document.getElementById('ai-response');
    if (!question) {
        addCopilotMessage('Please enter a question.', 'assistant');
        return;
    }
    if (copilotRequestPending) return;

    copilotRequestPending = true;
    const askButton = document.getElementById('ask-mitra-button');
    askButton.disabled = true;
    const history = copilotConversation.slice(-8);
    addCopilotMessage(question, 'user');
    document.getElementById('question').value = '';
    const thinking = addCopilotMessage('Mitra is thinking…', 'assistant', true);
    try {
        const response = await fetch('/api/ask-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, range: insightsRangeControl.value, history }),
        });
        const data = await response.json();
        thinking.remove();
        if (response.status === 401) {
            setSignedOut('Your session has expired. Please sign in again.');
            return;
        }
        if (!response.ok) throw new Error(data.error || data.message || 'Request failed.');
        const answer = data.answer || 'No answer received.';
        copilotConversation.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
        addCopilotMessage(answer, 'assistant');
        document.getElementById('question').placeholder = 'Ask a follow-up…';
    } catch (error) {
        thinking.remove();
        addCopilotMessage(error.message || 'Mitra could not answer right now.', 'assistant');
    } finally {
        copilotRequestPending = false;
        askButton.disabled = false;
    }
}

restoreSession();
