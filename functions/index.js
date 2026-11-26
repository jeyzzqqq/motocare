const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const { defineString } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();

const SENDGRID_KEY = defineString('SENDGRID_KEY');
const SENDGRID_FROM = defineString('SENDGRID_FROM');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function reminderKey(data) {
  return [
    data.uid || '',
    data.motorcycleId || '',
    data.taskKey || data.task || data.reminderText || '',
    data.dueMileage || '',
  ].map((value) => String(value).trim().toLowerCase()).join('::');
}

function formatMileage(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('en-US') : String(value || 'Not set');
}

function buildReminderMessage(data) {
  const motorcycleName = data.motorcycleName || 'Motorcycle';
  const task = data.task || 'Maintenance reminder';
  const reminder = data.reminderText || 'Please check your maintenance schedule.';
  const dueMileage = formatMileage(data.dueMileage);
  const currentOdo = formatMileage(data.currentOdo);
  const category = data.categoryLabel || '';
  const text = [
    'Hi,',
    '',
    'Your MotoCare maintenance reminder is ready.',
    '',
    `Motorcycle: ${motorcycleName}`,
    `Task: ${task}`,
    `Reminder: ${reminder}`,
    `Due mileage: ${dueMileage} km`,
    `Current odometer: ${currentOdo} km`,
    category ? `Motorcycle type: ${category}` : '',
    '',
    'Keep your ride safe and up to date.',
    'MotoCare',
  ].filter(Boolean).join('\n');

  const rows = [
    ['Motorcycle', motorcycleName],
    ['Maintenance task', task],
    ['Reminder', reminder],
    ['Due mileage', `${dueMileage} km`],
    ['Current odometer', `${currentOdo} km`],
    ...(category ? [['Motorcycle type', category]] : []),
  ];
  const htmlRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;color:#66736a;font-size:13px;border-bottom:1px solid #e8eee9;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;color:#17221a;font-size:13px;font-weight:600;border-bottom:1px solid #e8eee9;">${escapeHtml(value)}</td>
    </tr>`).join('');

  const html = `
    <div style="margin:0;padding:28px 12px;background:#f3f6f3;font-family:Arial,sans-serif;color:#17221a;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3ebe4;border-radius:16px;overflow:hidden;">
        <div style="padding:22px 24px;background:#1b5e20;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.8;">MotoCare</div>
          <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;">Maintenance reminder</h1>
        </div>
        <div style="padding:22px 24px;">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">Hi, here's a reminder to keep your ride safe and up to date.</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;">${htmlRows}</table>
          <p style="margin:18px 0 0;color:#66736a;font-size:12px;line-height:1.6;">This reminder is based on the motorcycle details and odometer readings saved in your MotoCare account.</p>
        </div>
      </div>
    </div>`;

  return { text, html };
}

async function sendPendingRemindersImpl() {
  const isDryRun = process.env.EMAIL_DRY_RUN === 'true' || process.env.FUNCTIONS_EMULATOR === 'true';
  const sendgridKey = SENDGRID_KEY.value();
  const sendgridFrom = SENDGRID_FROM.value() || 'noreply@motocare.example.com';

  if (!sendgridKey && !isDryRun) {
    console.error('SendGrid key missing; aborting sendPendingReminders run. Set SENDGRID_KEY as a Firebase param.');
    return null;
  }

  if (sendgridKey && !isDryRun) {
    sgMail.setApiKey(sendgridKey);
  }

  const now = admin.firestore.Timestamp.now();

  try {
    const snapshot = await db.collection('emailReminders')
      .where('sent', '==', false)
      .limit(200)
      .get();

    if (snapshot.empty) {
      console.log('No pending reminders to send.');
      return null;
    }

    const pendingWrites = [];
    const seenReminderKeys = new Map();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const docRef = doc.ref;

      let sendAtField = data.sendAt;
      let sendAtTs = null;

      try {
        if (!sendAtField) {
          sendAtTs = admin.firestore.Timestamp.now();
        } else if (sendAtField instanceof admin.firestore.Timestamp) {
          sendAtTs = sendAtField;
        } else if (typeof sendAtField === 'string') {
          const parsed = new Date(sendAtField);
          if (!isNaN(parsed.getTime())) {
            sendAtTs = admin.firestore.Timestamp.fromDate(parsed);
          }
        } else if (sendAtField instanceof Date) {
          sendAtTs = admin.firestore.Timestamp.fromDate(sendAtField);
        } else if (typeof sendAtField === 'number') {
          sendAtTs = admin.firestore.Timestamp.fromMillis(Number(sendAtField));
        }
      } catch (e) {
        console.warn('Could not parse sendAt for', doc.id, e?.message || e);
      }

      if (!sendAtTs) {
        pendingWrites.push(batchWrite(docRef, { lastError: 'invalid-sendAt', lastAttempt: admin.firestore.Timestamp.now() }));
        continue;
      }

      if (sendAtTs.toMillis() > now.toMillis()) {
        continue;
      }

      const key = reminderKey(data);
      const originalDocId = seenReminderKeys.get(key);
      if (originalDocId) {
        pendingWrites.push(batchWrite(docRef, {
          sent: true,
          sentAt: now,
          duplicateOf: originalDocId,
          lastError: null,
        }));
        continue;
      }
      seenReminderKeys.set(key, doc.id);

      const to = data.email;
      if (!to) {
        console.warn('Skipping reminder with no email:', doc.id);
        pendingWrites.push(batchWrite(docRef, { lastError: 'no-recipient-email', lastAttempt: admin.firestore.Timestamp.now() }));
        continue;
      }

      const claimed = await db.runTransaction(async (transaction) => {
        const latest = await transaction.get(docRef);
        if (!latest.exists) return false;
        const latestData = latest.data();
        if (latestData.sent === true) return false;
        const leaseUntil = latestData.sendLeaseUntil;
        if (leaseUntil && typeof leaseUntil.toMillis === 'function' && leaseUntil.toMillis() > now.toMillis()) {
          return false;
        }
        transaction.update(docRef, {
          sendLeaseUntil: admin.firestore.Timestamp.fromMillis(now.toMillis() + 10 * 60 * 1000),
          lastAttempt: now,
        });
        return true;
      });

      if (!claimed) continue;

      const subject = `MotoCare maintenance reminder: ${data.motorcycleName || 'Service due'}`;
      const message = buildReminderMessage(data);

      if (isDryRun) {
        console.log('[dry-run] Would send reminder email to', to, 'subject:', subject);
        pendingWrites.push(batchWrite(docRef, {
          sent: true,
          sentAt: admin.firestore.Timestamp.now(),
          sendLeaseUntil: null,
          lastError: null,
          dryRun: true,
        }));
        continue;
      }

      const msg = {
        to,
        from: sendgridFrom,
        subject,
        ...message,
      };

      try {
        await sgMail.send(msg);
        pendingWrites.push(batchWrite(docRef, {
          sent: true,
          sentAt: admin.firestore.Timestamp.now(),
          sendLeaseUntil: null,
          lastError: null,
        }));
      } catch (err) {
        console.error('Send failed for', doc.id, err?.message || err);
        pendingWrites.push(batchWrite(docRef, {
          sendLeaseUntil: null,
          lastError: String(err?.message || err),
          lastAttempt: admin.firestore.Timestamp.now(),
        }));
      }
    }

    await Promise.all(pendingWrites);
    console.log(`Processed ${snapshot.size} reminders.`);
    return null;
  } catch (err) {
    console.error('Error in sendPendingReminders:', err);
    return null;
  }
}

function batchWrite(docRef, data) {
  return db.batch().update(docRef, data).commit();
}
