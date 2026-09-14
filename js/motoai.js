import { auth, onAuthStateChanged } from './firebase-config.js';

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
        return;
    }

    const chat = document.createElement('div');
    chat.className = 'motoai-chat';
    chat.innerHTML = '<div class="motoai-avatar"><i class="lucide lucide-message-circle" aria-hidden="true"></i></div>';
    const message = document.createElement('p');
    message.className = 'motoai-message';
    message.textContent = text;
    chat.appendChild(message);
    messages.appendChild(chat);
}

function submitPrompt(prompt) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    addMessage(trimmedPrompt, 'user');
    addMessage(getResponse(trimmedPrompt), 'assistant');
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('motoAiForm');
    const input = document.getElementById('motoAiPrompt');
    const context = new URLSearchParams(window.location.search).get('context');

    if (context && input) {
        input.value = `Tell me more about this: ${context}`;
    }

    form?.addEventListener('submit', (event) => {
        event.preventDefault();
        submitPrompt(input.value);
        input.value = '';
        input.focus();
    });

    document.querySelectorAll('[data-motoai-prompt]').forEach((button) => {
        button.addEventListener('click', () => {
            submitPrompt(button.dataset.motoaiPrompt || '');
        });
    });

    document.getElementById('motoAiClose')?.addEventListener('click', () => {
        window.location.href = './dashboard.html';
    });
    document.getElementById('motoAiBackdrop')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) window.location.href = './dashboard.html';
    });
});

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    }
});
