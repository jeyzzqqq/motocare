// Force dry-run mode for local testing so no external email is sent.
process.env.EMAIL_DRY_RUN = 'true';
// Ensure a project id is available for the Google client libraries when running locally.
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'motocare-b874a';
const admin = require('firebase-admin');
const { _test } = require('./index');

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const docId = `dryrun-${Date.now()}`;
  const reminderRef = db.collection('emailReminders').doc(docId);

  await reminderRef.set({
    uid: 'dryrun-user',
    email: 'dryrun@example.com',
    motorcycleName: 'Dry Run Bike',
    task: 'Oil Change',
    reminderText: 'Test reminder from emulator',
    dueMileage: 1000,
    currentOdo: 950,
    sendAt: admin.firestore.Timestamp.now(),
    sent: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('Seeded test reminder:', docId);
  await _test.sendPendingRemindersImpl();

  const result = await reminderRef.get();
  console.log('Result document:', JSON.stringify(result.data(), null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });