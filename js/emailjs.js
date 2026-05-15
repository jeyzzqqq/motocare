// NOTE: Public key, service ID and template ID are safe to include in frontend code.
// Do NOT place the EmailJS private key (secret) in this file — keep any private
// credentials on a secure backend and never commit them to source control.
const DEFAULT_PUBLIC_KEY = 'nmJQtK4ALM9B8qXPl';
const DEFAULT_SERVICE_ID = 'service_me60alu';
const DEFAULT_TEMPLATE_ID = 'template_wh04j4o';

function getEmailJsClient() {
    if (typeof window === 'undefined' || !window.emailjs) {
        throw new Error('EmailJS SDK is not loaded.');
    }

    return window.emailjs;
}

export function initEmailJS(publicKey = DEFAULT_PUBLIC_KEY) {
    const emailjs = getEmailJsClient();
    if (!publicKey || publicKey.startsWith('YOUR_')) {
        return false;
    }

    emailjs.init({ publicKey });
    return true;
}

export async function sendMaintenanceReminder({
    toEmail,
    motorcycleName,
    task,
    reminder,
    dueMileage,
    currentOdo,
    categoryLabel,
    publicKey = DEFAULT_PUBLIC_KEY,
    serviceId = DEFAULT_SERVICE_ID,
    templateId = DEFAULT_TEMPLATE_ID,
}) {
    if (!toEmail) {
        throw new Error('Recipient email is required.');
    }

    const emailjs = getEmailJsClient();

    if (!publicKey || publicKey.startsWith('YOUR_')) {
        throw new Error('Configure your EmailJS public key first.');
    }

    if (!serviceId || serviceId.startsWith('YOUR_')) {
        throw new Error('Configure your EmailJS service ID first.');
    }

    if (!templateId || templateId.startsWith('YOUR_')) {
        throw new Error('Configure your EmailJS template ID first.');
    }

    emailjs.init({ publicKey });

    return emailjs.send(serviceId, templateId, {
        to_email: toEmail,
        email: toEmail,
        motorcycle_name: motorcycleName || 'Motorcycle',
        task: task || 'Maintenance reminder',
        reminder: reminder || '',
        due_mileage: Number(dueMileage || 0).toLocaleString(),
        current_odo: Number(currentOdo || 0).toLocaleString(),
        category_label: categoryLabel || '',
        app_name: 'MotoCare',
        sent_at: new Date().toLocaleString(),
    });
}

export async function sendMaintenanceDigest({
    toEmail,
    items = [],
    publicKey = DEFAULT_PUBLIC_KEY,
    serviceId = DEFAULT_SERVICE_ID,
    templateId = DEFAULT_TEMPLATE_ID,
}) {
    if (!toEmail) throw new Error('Recipient email is required.');
    if (!Array.isArray(items) || items.length === 0) throw new Error('No reminder items provided for digest.');

    const emailjs = getEmailJsClient();
    emailjs.init({ publicKey });

    // Build aggregated strings for the template. Use simple HTML-friendly join.
    const lines = items.map((it) => {
        const moto = it.motorcycleName || '';
        const task = it.task || it.title || 'Maintenance';
        const due = Number(it.dueMileage || it.due || 0).toLocaleString();
        const odo = Number(it.currentOdo || it.current || 0).toLocaleString();
        const note = it.reminder || '';
        return `<li><strong>${moto}</strong>: ${escapeHtml(task)} — target ${due} km (current ${odo} km) <br/>${escapeHtml(note)}</li>`;
    }).join('\n');

    // Send a single email containing all reminders
    return emailjs.send(serviceId, templateId, {
        to_email: toEmail,
        email: toEmail,
        motorcycle_name: items.map(i => i.motorcycleName || '').filter(Boolean).join(', '),
        task: `Multiple reminders (${items.length})`,
        reminder: `<ul>${lines}</ul>`,
        due_mileage: '',
        current_odo: '',
        category_label: '',
        app_name: 'MotoCare',
        sent_at: new Date().toLocaleString(),
        is_digest: 'true'
    });
}

function escapeHtml(value = '') {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}