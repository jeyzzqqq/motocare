import { auth, db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    updateDoc,
    writeBatch,
    doc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/**
 * Firebase Firestore Utility Functions
 * All operations include uid-based filtering for user isolation
 */

// ADD DOCUMENT
export async function addFirestoreDoc(collectionName, data) {
    try {
        const user = auth.currentUser;
        
        if (!user) {
            const error = new Error('User not authenticated. Please log in first.');
            console.error('Error: User is not authenticated', { user, auth: auth.currentUser });
            throw error;
        }
        
        console.log('Adding to Firestore:', collectionName, 'for user:', user.uid);
        
        const docData = {
            ...data,
            uid: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        const docRef = await addDoc(collection(db, collectionName), docData);
        console.log(`✓ Successfully added to ${collectionName}:`, docRef.id);
        
        // Return with local timestamp
        return { 
            id: docRef.id, 
            ...data,
            uid: user.uid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error(`✗ Error adding to ${collectionName}:`, error.message, error);
        throw error;
    }
}

// GET ALL DOCUMENTS (filtered by uid)
export async function getFirestoreDocs(collectionName, orderByField = null) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');

        const baseQuery = query(
            collection(db, collectionName),
            where('uid', '==', user.uid)
        );

        const querySnapshot = await getDocs(baseQuery);
        console.log(`✓ Fetched ${querySnapshot.size} documents from ${collectionName}`);
        
        const docs = [];
        querySnapshot.forEach((doc) => {
            const data = { id: doc.id, ...doc.data() };
            if (data.deleted !== true) {
                docs.push(data);
            }
        });

        if (orderByField) {
            docs.sort((left, right) => compareFirestoreValues(right[orderByField], left[orderByField]));
        }
        
        return docs;
    } catch (error) {
        console.error(`✗ Error fetching from ${collectionName}:`, error.message);
        throw error;
    }
}

// GET DOCUMENTS WITH CUSTOM FILTER
export async function getFirestoreDocsByFilter(collectionName, filterField, filterValue, orderByField = null) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');
        
        const baseQuery = query(
            collection(db, collectionName),
            where('uid', '==', user.uid),
            where(filterField, '==', filterValue)
        );
        
        const querySnapshot = await getDocs(baseQuery);
        
        const docs = [];
        querySnapshot.forEach((doc) => {
            const data = { id: doc.id, ...doc.data() };
            if (data.deleted !== true) {
                docs.push(data);
            }
        });

        if (orderByField) {
            docs.sort((left, right) => compareFirestoreValues(right[orderByField], left[orderByField]));
        }
        
        return docs;
    } catch (error) {
        console.error(`✗ Error fetching filtered documents from ${collectionName}:`, error.message);
        throw error;
    }
}

// UPDATE DOCUMENT
export async function updateFirestoreDoc(collectionName, docId, data) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');
        
        const docRef = doc(db, collectionName, docId);
        const updateData = {
            ...data,
            updatedAt: serverTimestamp()
        };
        
        await updateDoc(docRef, updateData);
        console.log(`Updated ${collectionName}/${docId}`);
        return { id: docId, ...updateData };
    } catch (error) {
        console.error(`Error updating ${collectionName}/${docId}:`, error);
        throw error;
    }
}

// DELETE DOCUMENT
export async function deleteFirestoreDoc(collectionName, docId) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');

        if (collectionName === 'motorcycles') {
            // Step 1: Soft-delete the motorcycle
            await updateDoc(doc(db, 'motorcycles', docId), {
                deleted: true,
                deletedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                uid: user.uid
            });

            // Step 2: Soft-delete ONLY records linked to this specific motorcycle ID
            const cleanupTargetDocs = async (targetCollectionName) => {
                const targetSnapshot = await getDocs(query(
                    collection(db, targetCollectionName),
                    where('uid', '==', user.uid),
                    where('motorcycleId', '==', docId)
                ));

                for (const targetDoc of targetSnapshot.docs) {
                    await updateDoc(doc(db, targetCollectionName, targetDoc.id), {
                        deleted: true,
                        deletedAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        uid: user.uid
                    });
                }
            };

            await cleanupTargetDocs('repairs');
            await cleanupTargetDocs('maintenance');

            console.log(`Soft-deleted motorcycle/${docId} and removed linked records`);
            return true;
        }
        
        const docRef = doc(db, collectionName, docId);
        await updateDoc(docRef, {
            deleted: true,
            deletedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            uid: user.uid
        });

        console.log(`Soft-deleted ${collectionName}/${docId}`);
        return true;
    } catch (error) {
        console.error(`Error deleting ${collectionName}/${docId}:`, error);
        throw error;
    }
}

export async function cleanupOrphanedMotorcycleRecords(motorcycleDocs = []) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');

        const activeMotorcycleIds = new Set(
            motorcycleDocs
                .map((snapshot) => snapshot.id)
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        );

        const batch = writeBatch(db);
        let deletesQueued = 0;

        const scanAndQueueDeletes = async (targetCollectionName) => {
            const targetSnapshot = await getDocs(query(
                collection(db, targetCollectionName),
                where('uid', '==', user.uid)
            ));

            for (const targetDoc of targetSnapshot.docs) {
                const targetData = { id: targetDoc.id, ...targetDoc.data() };
                const linkedMotorcycleId = String(targetData.motorcycleId || '').trim();
                if (!linkedMotorcycleId) {
                    continue;
                }

                const shouldKeep = activeMotorcycleIds.has(linkedMotorcycleId);

                if (!shouldKeep) {
                    batch.delete(doc(db, targetCollectionName, targetDoc.id));
                    deletesQueued += 1;
                }
            }
        };

        await scanAndQueueDeletes('repairs');
        await scanAndQueueDeletes('maintenance');

        if (deletesQueued > 0) {
            await batch.commit();
            console.log(`Cleaned up ${deletesQueued} orphaned motorcycle-linked records`);
        }

        return deletesQueued;
    } catch (error) {
        console.error('Error cleaning up orphaned motorcycle records:', error);
        throw error;
    }
}

// GET SINGLE DOCUMENT BY ID
export async function getFirestoreDocById(collectionName, docId) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');
        
        const docRef = doc(db, collectionName, docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Verify uid matches current user
            if (data.uid !== user.uid) {
                throw new Error('Unauthorized access to document');
            }
            return { id: docSnap.id, ...data };
        } else {
            return null;
        }
    } catch (error) {
        console.error(`Error fetching ${collectionName}/${docId}:`, error);
        throw error;
    }
}

// COUNT DOCUMENTS (filtered by uid)
export async function countFirestoreDocs(collectionName) {
    try {
        const docs = await getFirestoreDocs(collectionName);
        return docs.length;
    } catch (error) {
        console.error(`Error counting ${collectionName}:`, error);
        throw error;
    }
}

// SUM FIELD VALUES (filtered by uid)
export async function sumFirestoreField(collectionName, fieldName) {
    try {
        const docs = await getFirestoreDocs(collectionName);
        return docs.reduce((sum, doc) => sum + (Number(doc[fieldName]) || 0), 0);
    } catch (error) {
        console.error(`Error summing ${fieldName} in ${collectionName}:`, error);
        throw error;
    }
}

function compareFirestoreValues(left, right) {
    const leftTime = toComparableTime(left);
    const rightTime = toComparableTime(right);

    if (leftTime !== null && rightTime !== null) {
        return leftTime - rightTime;
    }

    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return leftNumber - rightNumber;
    }

    return String(left || '').localeCompare(String(right || ''));
}

function toComparableTime(value) {
    if (value && typeof value.toDate === 'function') {
        const date = value.toDate();
        return Number.isNaN(date.getTime()) ? null : date.getTime();
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
}
