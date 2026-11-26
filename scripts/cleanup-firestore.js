#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const COLLECTIONS = ['motorcycles', 'repairs', 'maintenance', 'notifications', 'emailReminders'];
const ORPHAN_COLLECTIONS = new Set(['repairs', 'maintenance']);
const BATCH_SIZE = 500;
const MODES = new Set(['purge-deleted', 'fresh-start']);

function parseArgs(args) {
    const options = { execute: false, uid: null, mode: 'purge-deleted' };

    for (const arg of args) {
        if (arg === '--execute') {
            options.execute = true;
        } else if (arg.startsWith('--uid=')) {
            options.uid = arg.slice('--uid='.length).trim();
            if (!options.uid) throw new Error('--uid requires a non-empty UID.');
        } else if (arg.startsWith('--mode=')) {
            options.mode = arg.slice('--mode='.length);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!MODES.has(options.mode)) {
        throw new Error(`Invalid mode "${options.mode}". Use purge-deleted or fresh-start.`);
    }
    if (options.mode === 'fresh-start' && !options.uid) {
        throw new Error('--uid=<uid> is required with --mode=fresh-start.');
    }

    return options;
}

function createStats() {
    return {
        total: 0,
        softDeleted: 0,
        orphaned: 0,
        samples: { total: [], softDeleted: [], orphaned: [] }
    };
}

function addSample(samples, id) {
    if (samples.length < 5) samples.push(id);
}

async function askForConfirmation() {
    const terminal = readline.createInterface({ input: stdin, output: stdout });
    try {
        const answer = await terminal.question('Type DELETE to permanently delete the selected documents: ');
        return answer === 'DELETE';
    } finally {
        terminal.close();
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
        throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to the service account JSON file path.');
    }
    if (!fs.existsSync(path.resolve(credentialsPath))) {
        throw new Error(`Service account file not found: ${path.resolve(credentialsPath)}`);
    }

    const functionsDirectory = path.resolve(__dirname, '..', 'functions');
    const admin = require(require.resolve('firebase-admin', { paths: [functionsDirectory] }));
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    const db = admin.firestore();

    const motorcycleQuery = options.uid
        ? db.collection('motorcycles').where('uid', '==', options.uid)
        : db.collection('motorcycles');
    const motorcycleSnapshot = await motorcycleQuery.get();
    const activeMotorcycleIds = new Set(
        motorcycleSnapshot.docs
            .filter((document) => document.get('deleted') !== true)
            .map((document) => document.id)
    );

    const statsByCollection = new Map();
    const docsByCollection = new Map();

    for (const collectionName of COLLECTIONS) {
        const collectionQuery = options.uid
            ? db.collection(collectionName).where('uid', '==', options.uid)
            : db.collection(collectionName);
        const snapshot = collectionName === 'motorcycles'
            ? motorcycleSnapshot
            : await collectionQuery.get();
        const stats = createStats();

        for (const document of snapshot.docs) {
            const data = document.data();
            stats.total += 1;
            addSample(stats.samples.total, document.id);

            if (data.deleted === true) {
                stats.softDeleted += 1;
                addSample(stats.samples.softDeleted, document.id);
            }

            const motorcycleId = String(data.motorcycleId || '').trim();
            if (motorcycleId && !activeMotorcycleIds.has(motorcycleId)) {
                stats.orphaned += 1;
                addSample(stats.samples.orphaned, document.id);
            }
        }

        statsByCollection.set(collectionName, stats);
        docsByCollection.set(collectionName, snapshot.docs);
    }

    console.log(JSON.stringify({
        mode: options.mode,
        uid: options.uid || '(all users)',
        execute: options.execute,
        collections: Object.fromEntries(statsByCollection)
    }, null, 2));

    if (!options.execute) {
        console.log('Dry run only. No documents were changed. Add --execute to request deletion.');
        return;
    }

    if (!(await askForConfirmation())) {
        console.log('Confirmation did not match DELETE. No documents were changed.');
        return;
    }

    let totalDeleted = 0;
    const deletedByCollection = {};

    for (const collectionName of COLLECTIONS) {
        const eligibleDocs = docsByCollection.get(collectionName).filter((document) => {
            const data = document.data();
            if (options.mode === 'fresh-start') return true;
            if (data.deleted === true) return true;

            const motorcycleId = String(data.motorcycleId || '').trim();
            return ORPHAN_COLLECTIONS.has(collectionName)
                && motorcycleId
                && !activeMotorcycleIds.has(motorcycleId);
        });

        let deletedForCollection = 0;
        for (let offset = 0; offset < eligibleDocs.length; offset += BATCH_SIZE) {
            const batch = db.batch();
            const docsInBatch = eligibleDocs.slice(offset, offset + BATCH_SIZE);
            for (const document of docsInBatch) batch.delete(document.ref);
            await batch.commit();

            deletedForCollection += docsInBatch.length;
            totalDeleted += docsInBatch.length;
            console.log(
                `Progress: ${collectionName} ${deletedForCollection}/${eligibleDocs.length}; total ${totalDeleted}`
            );
        }

        deletedByCollection[collectionName] = deletedForCollection;
    }

    console.log(JSON.stringify({
        result: 'complete',
        mode: options.mode,
        uid: options.uid || '(all users)',
        deletedByCollection,
        totalDeleted
    }, null, 2));
}

main().catch((error) => {
    console.error('Firestore cleanup failed:', error.message);
    process.exitCode = 1;
});
