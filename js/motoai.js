import { app, auth, onAuthStateChanged } from './firebase-config.js?v=2';

const motoAiModelName = 'gemini-3.8-flash';
const motoAiSystemInstruction = `You are MotoAI, a motorcycle maintenance assistant for MotoCare.
Give concise, practical answers in Taglish when appropriate.
Do not claim to diagnose a dangerous mechanical problem.
For safety-critical issues, advise the user to stop riding and consult a qualified mechanic.
Use only the information in the user's question and do not invent motorcycle records.`;

const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

const responses = [
    {
        matches: ['oil', 'change'],
        answer: 'Usually every 2,000 to 4,000 km, pero check your owner manual. Change sooner kung dusty or heavy ang paggamit.'
    },
    {
        matches: ['brake', 'pads'],
        answer: 'Check brake pads for thin lining, uneven wear, or squeaking. Kapag manipis na, schedule a replacement soon.'
    },
    {
        matches: ['mileage', 'km'],
        answer: 'Track your odometer and follow the service intervals. Good habit ang quick inspection every 500 to 1,000 km.'
    },
    {
        matches: ['major', 'service', 'next'],
        answer: 'Major service usually includes oil, filters, spark plug, chain, brakes, and a full safety check. Check your mileage schedule.'
    }
];

function getResponse(prompt) {
    const normalizedPrompt = prompt.toLowerCase();
    const matchedResponse = responses.find((response) => response.matches.some((word) => normalizedPrompt.includes(word)));
    return matchedResponse?.answer || 'I can help with maintenance, service timing, and pre-ride checks. Try a quick question above.';
}

function addMessage(text, type) {
    const messages = document.getElementById('motoAiMessages');
    if (!messages) return;

    if (type === 'user') {
        const message = document.createElement('p');
        message.className = 'motoai-response';
        message.textContent = text;
        messages.appendChild(message);
        messages.scrollTop = messages.scrollHeight;
        return message;
    }

    const chat = document.createElement('div');
    chat.className = 'motoai-chat';
    chat.innerHTML = '<div class="motoai-avatar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 18.5 4 21l.8-4.1A8 8 0 1 1 7.5 18.5Z"/></svg></div>';
    const message = document.createElement('p');
    message.className = 'motoai-message';
    message.textContent = text;
    chat.appendChild(message);
    messages.appendChild(chat);
    messages.scrollTop = messages.scrollHeight;
    return message;
}

async function getAiResponse(prompt) {
    const { getAI, getGenerativeModel, GoogleAIBackend } =
        await import('https://www.gstatic.com/firebasejs/12.5.0/firebase-ai.js');
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, {
        model: motoAiModelName,
        systemInstruction: motoAiSystemInstruction,
        generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.4
        }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    if (!text) throw new Error('MotoAI returned an empty response.');
    return text;
}

async function submitPrompt(prompt) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    addMessage(trimmedPrompt, 'user');
    const assistantMessage = addMessage('Thinking...', 'assistant');

    try {
        assistantMessage.textContent = await getAiResponse(trimmedPrompt);
        if (isDevelopment) console.log('[MotoAI] reply source: AI');
    } catch (error) {
        console.warn('[MotoAI] AI request failed; using local fallback.', {
            name: error?.name,
            code: error?.code,
            message: error?.message
        });
        assistantMessage.textContent = getResponse(trimmedPrompt);
        if (isDevelopment) console.log('[MotoAI] reply source: fallback');
    }
}

const motoAiMarkup = `
<div class="motoai-backdrop" id="motoAiBackdrop" hidden>
    <section class="motoai-sheet" role="dialog" aria-modal="true" aria-labelledby="motoAiTitle">
        <div class="motoai-sheet__inner">
            <header class="motoai-header">
                <div class="motoai-header__badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z"></path><path d="m19 15 .7 2.3L22 18l-2.3 1.4L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"></path></svg></div>
                <div class="motoai-header__content"><div class="motoai-title-row"><h1 id="motoAiTitle" class="motoai-title">MotoAI</h1></div><p class="motoai-online">● Online</p></div>
                <button id="motoAiClose" class="motoai-close" type="button" aria-label="Close MotoAI"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5 L19 19"/><path d="M19 5 L5 19"/></svg></button>
            </header>
            <div id="motoAiMessages" class="motoai-messages" aria-live="polite">
                <p class="motoai-date">TODAY</p>
                <div class="motoai-chat"><div class="motoai-avatar"></div><p class="motoai-message">Kumusta! I'm MotoAI — your smart maintenance assistant. Ask me anything about your bike's upkeep, schedules, or what to check next.</p></div>
                <p class="motoai-response">What's due for my Honda CBR 150R?</p>
                <article class="motoai-rich-card"><h2>Your next service is coming up.</h2><p class="motoai-rich-card__subtitle">Oil change · September 10</p><p class="motoai-rich-card__body">You're riding around 45 km a day. Keep an eye on your oil level and check your brake pads within 2 weeks.</p><a class="motoai-rich-card__link" href="./schedule.html">View maintenance schedule <span aria-hidden="true">→</span></a></article>
            </div>
            <p class="motoai-disclaimer">MotoAI offers guidance, not a mechanic's diagnosis.</p>
            <div class="motoai-suggestions"><button type="button" data-motoai-prompt="Kailan palitan ang oil?" class="motoai-suggestion">Kailan palitan ang oil?</button><button type="button" data-motoai-prompt="Check brake pads?" class="motoai-suggestion">Check brake pads?</button><button type="button" data-motoai-prompt="Mileage tips?" class="motoai-suggestion">Mileage tips?</button><button type="button" data-motoai-prompt="Next major service?" class="motoai-suggestion">Next major service?</button></div>
            <form id="motoAiForm" class="motoai-input-bar"><label class="sr-only" for="motoAiPrompt">Ask about your bike</label><input id="motoAiPrompt" class="motoai-input" type="text" required maxlength="180" placeholder="Ask about your bike"><button class="motoai-send" type="submit" aria-label="Send message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 4.5 L21 12 L3.5 19.5 L3.5 19.5 L6.5 12 Z"/><path d="M6.5 12 H21"/></svg></button></form>
        </div>
    </section>
</div>`;

function ensureMotoAiOverlay() {
    if (document.getElementById('motoAiBackdrop')) return document.getElementById('motoAiBackdrop');
    document.body.insertAdjacentHTML('beforeend', motoAiMarkup);
    return document.getElementById('motoAiBackdrop');
}

function ensureMotoAiStyles() {
    if (document.getElementById('motoai-overlay-styles')) return;
    const link = document.createElement('link');
    link.id = 'motoai-overlay-styles';
    link.rel = 'stylesheet';
    link.href = './css/motoai-overlay.css';
    document.head.appendChild(link);
}

function setMotoAiOpen(open) {
    const backdrop = document.getElementById('motoAiBackdrop');
    if (!backdrop) return;
    if (open) {
        backdrop.hidden = false;
        requestAnimationFrame(() => backdrop.classList.add('is-open'));
        document.body.classList.add('motoai-open');
        document.getElementById('motoAiPrompt')?.focus({ preventScroll: true });
        document.getElementById('motoAiMessages')?.scrollTo(0, document.getElementById('motoAiMessages').scrollHeight);
    } else {
        backdrop.classList.remove('is-open');
        document.body.classList.remove('motoai-open');
        window.setTimeout(() => { if (!backdrop.classList.contains('is-open')) backdrop.hidden = true; }, 220);
    }
}

function bindMotoAi() {
    const form = document.getElementById('motoAiForm');
    const input = document.getElementById('motoAiPrompt');
    const backdrop = document.getElementById('motoAiBackdrop');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';
    form?.addEventListener('submit', (event) => {
        event.preventDefault();
        submitPrompt(input.value);
        input.value = '';
        input.focus();
    });

    document.querySelectorAll('[data-motoai-prompt]').forEach((button) => {
        if (button.dataset.motoaiBound === 'true') return;
        button.dataset.motoaiBound = 'true';
        button.addEventListener('click', () => {
            submitPrompt(button.dataset.motoaiPrompt || '');
        });
    });
    document.getElementById('motoAiClose')?.addEventListener('click', () => setMotoAiOpen(false));
    backdrop?.addEventListener('click', (event) => { if (event.target === backdrop) setMotoAiOpen(false); });
    document.querySelectorAll('.motoai-rich-card__link').forEach((link) => {
        link.addEventListener('click', () => setMotoAiOpen(false));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    ensureMotoAiStyles();
    const standalone = document.getElementById('motoAiBackdrop');
    if (!standalone) ensureMotoAiOverlay();
    bindMotoAi();
    const context = new URLSearchParams(window.location.search).get('context');
    if (context) {
        const input = document.getElementById('motoAiPrompt');
        if (input) input.value = `Tell me more about this: ${context}`;
    }
    document.addEventListener('click', (event) => {
        const trigger = event.target.closest('a[href*="motoai.html"], [data-motoai-open]');
        if (!trigger || trigger.closest('#motoAiBackdrop')) return;
        event.preventDefault();
        setMotoAiOpen(true);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !document.getElementById('motoAiBackdrop')?.hidden) setMotoAiOpen(false);
    });
    document.addEventListener('motoai:open', (event) => {
        const contextPrompt = event.detail?.context;
        const input = document.getElementById('motoAiPrompt');
        if (contextPrompt && input) input.value = `Tell me more about this: ${contextPrompt}`;
        setMotoAiOpen(true);
    });
    if (standalone) setMotoAiOpen(true);
});

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    }
});
