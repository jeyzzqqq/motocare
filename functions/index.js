const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const { defineString } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();

const SENDGRID_KEY = defineString('SENDGRID_KEY');
const SENDGRID_FROM = defineString('SENDGRID_FROM');

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

      const to = data.email;
      if (!to) {
        console.warn('Skipping reminder with no email:', doc.id);
        pendingWrites.push(batchWrite(docRef, { lastError: 'no-recipient-email', lastAttempt: admin.firestore.Timestamp.now() }));
        continue;
      }

      const subject = `MotoCare Reminder: ${data.motorcycleName || 'Service due'}`;
      const text = `Hi,\n\nThis is your MotoCare reminder.\n\nMotorcycle: ${data.motorcycleName || ''}\nTask: ${data.task || ''}\nReminder: ${data.reminderText || ''}\nDue Mileage: ${data.dueMileage || ''}\nCurrent ODO: ${data.currentOdo || ''}\nCategory: ${data.categoryLabel || ''}\nApp: MotoCare\nSent At: ${new Date().toLocaleString()}\n\nPlease check your motorcycle maintenance schedule.\n`;

      if (isDryRun) {
        console.log('[dry-run] Would send reminder email to', to, 'subject:', subject);
        pendingWrites.push(batchWrite(docRef, { sent: true, sentAt: admin.firestore.Timestamp.now(), lastError: null, dryRun: true }));
        continue;
      }

      const msg = {
        to,
        from: sendgridFrom,
        subject,
        text,
      };

      try {
        await sgMail.send(msg);
        pendingWrites.push(batchWrite(docRef, { sent: true, sentAt: admin.firestore.Timestamp.now(), lastError: null }));
      } catch (err) {
        console.error('Send failed for', doc.id, err?.message || err);
        pendingWrites.push(batchWrite(docRef, { lastError: String(err?.message || err), lastAttempt: admin.firestore.Timestamp.now() }));
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

exports.sendPendingReminders = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => sendPendingRemindersImpl());

exports._test = {
  sendPendingRemindersImpl,
};
