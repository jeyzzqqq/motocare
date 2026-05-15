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