import { auth, db } from './firebase-config.js?v=3';
import { doc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';
import { ensureMotorcyclesTrackedFromOdo, getFirestoreDocs } from './firebaseUtils.js?v=4';
import { MAINTENANCE_RULES, classifyMotorcycleCategory } from './maintenanceOptions.js?v=2';
import { getMaintenanceTaskStatus } from './maintenanceStatus.js?v=2';

let syncInFlight = null;
let queuedSync = null;

function getMotorcycleName(motorcycle) {
    return motorcycle.motorcycleName
        || [motorcycle.brand, motorcycle.model].filter(Boolean).join(' ')
        || 'Motorcycle';
}

function getCurrentOdo(motorcycle) {
    const raw = motorcycle.mileage ?? motorcycle.odo ?? motorcycle.currentOdo ?? motorcycle.odometer ?? 0;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function getNotificationId(uid, motorcycleId, taskKey, status, dueOdo) {
    return `${uid}_${motorcycleId}_${taskKey}_${status}_${dueOdo}`
        .replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function syncOnce(uid, options = {}) {
    let warned = false;
    const warnOnce = (error) => {
        if (warned) return;
        warned = true;
        console.warn('Maintenance notification sync failed; continuing without blocking the app.', error);
    };

    try {
        if (!uid || auth.currentUser?.uid !== uid) {
            throw new Error('The active user does not match the maintenance notification request.');
        }

        const loadedMotorcycles = Array.isArray(options.motorcycles)
            ? options.motorcycles
            : await getFirestoreDocs('motorcycles');
        const loadedMaintenance = Array.isArray(options.maintenance)
            ? options.maintenance
            : await getFirestoreDocs('maintenance');
        const activeMotorcycles = await ensureMotorcyclesTrackedFromOdo(
            loadedMotorcycles.filter((motorcycle) => motorcycle.deleted !== true)
        );
        const activeMaintenance = loadedMaintenance.filter((record) => record.deleted !== true);
        const candidates = [];

        for (const motorcycle of activeMotorcycles) {
            const category = classifyMotorcycleCategory(motorcycle);
            const rules = MAINTENANCE_RULES[category.key] || [];
            const currentOdo = getCurrentOdo(motorcycle);
            const motorcycleName = getMotorcycleName(motorcycle);

            for (const rule of rules) {
                const taskStatus = getMaintenanceTaskStatus(motorcycle, rule, activeMaintenance);
                let notificationStatus = '';
                if (taskStatus.status.key === 'overdue' || taskStatus.status.key === 'due') {
                    notificationStatus = 'overdue';
                } else if (taskStatus.status.key === 'upcoming') {
                    notificationStatus = 'due_soon';
                }
                if (!notificationStatus) continue;

                const dueOdo = taskStatus.dueMileage;
                candidates.push({
                    id: getNotificationId(uid, motorcycle.id, rule.key, notificationStatus, dueOdo),
                    document: {
                        uid,
                        read: false,
                        type: 'maintenance',
                        status: notificationStatus,
                        title: `${rule.task} is ${notificationStatus === 'overdue' ? 'overdue' : 'due soon'}`,
                        message: `${motorcycleName} · due at ${dueOdo.toLocaleString()} km · now ${currentOdo.toLocaleString()} km`,
                        motorcycleId: motorcycle.id,
                        motorcycleName,
                        taskKey: rule.key,
                        dueOdo,
                        currentOdo,
                        targetUrl: 'schedule.html',
                        createdAt: serverTimestamp()
                    }
                });
            }
        }

        let createdCount = 0;
        for (const candidate of candidates) {
            if (createdCount >= 10) break;
            try {
                const notificationRef = doc(db, 'notifications', candidate.id);
                const wasCreated = await runTransaction(db, async (transaction) => {
                    const existing = await transaction.get(notificationRef);
                    if (existing.exists()) return false;
                    transaction.set(notificationRef, candidate.document);
                    return true;
                });
                if (wasCreated) createdCount += 1;
            } catch (error) {
                warnOnce(error);
            }
        }
    } catch (error) {
        warnOnce(error);
    }
}

export function syncMaintenanceNotifications(uid, options = {}) {
    queuedSync = { uid, options };
    if (!syncInFlight) {
        syncInFlight = (async () => {
            while (queuedSync) {
                const request = queuedSync;
                queuedSync = null;
                await syncOnce(request.uid, request.options);
            }
        })().catch((error) => {
            console.warn('Maintenance notification sync failed; continuing without blocking the app.', error);
        }).finally(() => {
            syncInFlight = null;
            if (queuedSync) {
                const request = queuedSync;
                queuedSync = null;
                syncMaintenanceNotifications(request.uid, request.options);
            }
        });
    }
    return syncInFlight;
}
