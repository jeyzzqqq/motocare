import { auth, db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    orderBy,
    updateDoc,
    deleteDoc,
    doc,
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
        
        let q;
        if (orderByField) {
            q = query(
                collection(db, collectionName),
                where('uid', '==', user.uid),
                orderBy(orderByField, 'desc')
            );
        } else {
            q = query(
                collection(db, collectionName),
                where('uid', '==', user.uid)
            );
        }
        
        const querySnapshot = await getDocs(q);
        const docs = [];
        querySnapshot.forEach((doc) => {
            docs.push({ id: doc.id, ...doc.data() });
        });
        
        console.log(`Fetched ${docs.length} documents from ${collectionName}`);
        return docs;
    } catch (error) {
        console.error(`Error fetching from ${collectionName}:`, error);
        throw error;
    }
}

// GET DOCUMENTS WITH CUSTOM FILTER
export async function getFirestoreDocsByFilter(collectionName, filterField, filterValue, orderByField = null) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');
        
        let q;
        if (orderByField) {
            q = query(
                collection(db, collectionName),
                where('uid', '==', user.uid),
                where(filterField, '==', filterValue),
                orderBy(orderByField, 'desc')
            );
        } else {
            q = query(
                collection(db, collectionName),
                where('uid', '==', user.uid),
                where(filterField, '==', filterValue)
            );
        }
        
        const querySnapshot = await getDocs(q);
        const docs = [];
        querySnapshot.forEach((doc) => {
            docs.push({ id: doc.id, ...doc.data() });
        });
        
        return docs;
    } catch (error) {
        console.error(`Error fetching filtered documents from ${collectionName}:`, error);
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
        
        const docRef = doc(db, collectionName, docId);
        await deleteDoc(docRef);
        console.log(`Deleted ${collectionName}/${docId}`);
        return true;
    } catch (error) {
        console.error(`Error deleting ${collectionName}/${docId}:`, error);
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
