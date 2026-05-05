import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let isEditing = false;
let userId = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        userId = user.uid;
        await loadProfile(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

async function loadProfile(uid) {
    try {
        const docRef = doc(db, 'profiles', uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.uid && data.uid !== uid) {
                loadEmptyProfile();
                return;
            }
            populateProfile(data);
        } else {
            loadEmptyProfile();
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        loadEmptyProfile();
    }
}

function loadEmptyProfile() {
    populateProfile({
        make: '',
        model: '',
        year: '',
        vin: '',
        plateNumber: '',
        mileage: '',
        fuelType: '',
        purchaseDate: '',
        color: ''
    });
}

function populateProfile(data) {
    document.getElementById('makeModel').value = `${data.make} ${data.model}`;
    document.getElementById('year').value = data.year;
    document.getElementById('mileage').value = data.mileage;
    document.getElementById('fuelType').value = data.fuelType;
    document.getElementById('vin').value = data.vin;
    document.getElementById('plateNumber').value = data.plateNumber;
    document.getElementById('purchaseDate').value = data.purchaseDate;
    document.getElementById('color').value = data.color;

    // Update display
    document.getElementById('displayMakeModel').textContent = `${data.make} ${data.model}`;
    document.getElementById('displayYear').textContent = data.year;
    document.getElementById('displayMileage').textContent = data.mileage;
    document.getElementById('displayColor').textContent = data.color;
}

window.toggleEdit = function() {
    isEditing = !isEditing;
    const inputs = document.querySelectorAll('input[type="text"]');
    const editBtn = document.getElementById('editToggleBtn');
    const editIcon = document.getElementById('editIcon');
    const actionButtons = document.getElementById('actionButtons');

    if (isEditing) {
        inputs.forEach(input => input.disabled = false);
        editBtn.className = 'p-2.5 rounded-full shadow-md transition-all hover:scale-110 active:scale-95 bg-green-700 text-white hover:bg-green-800';
        editIcon.className = 'lucide lucide-save text-xl';
        actionButtons.classList.remove('hidden');
    } else {
        saveProfile();
    }
}

window.cancelEdit = function() {
    isEditing = false;
    const inputs = document.querySelectorAll('input[type="text"]');
    const editBtn = document.getElementById('editToggleBtn');
    const editIcon = document.getElementById('editIcon');
    const actionButtons = document.getElementById('actionButtons');

    inputs.forEach(input => input.disabled = true);
    editBtn.className = 'p-2.5 rounded-full shadow-md transition-all hover:scale-110 active:scale-95 bg-white text-gray-600 hover:bg-gray-50';
    editIcon.className = 'lucide lucide-edit-2 text-xl';
    actionButtons.classList.add('hidden');

    // Reload profile data
    loadProfile(userId);
}

window.saveProfile = async function() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast('Please sign in again to save your profile.', 'error');
        window.location.href = 'index.html';
        return;
    }

    if (!userId) return;

    const makeModel = document.getElementById('makeModel').value.split(' ');
    const make = makeModel[0];
    const model = makeModel.slice(1).join(' ');

    const profileData = {
        uid: currentUser.uid,
        make: make,
        model: model,
        year: document.getElementById('year').value,
        mileage: document.getElementById('mileage').value,
        fuelType: document.getElementById('fuelType').value,
        vin: document.getElementById('vin').value,
        plateNumber: document.getElementById('plateNumber').value,
        purchaseDate: document.getElementById('purchaseDate').value,
        color: document.getElementById('color').value,
        updatedAt: new Date().toISOString()
    };

    try {
        await setDoc(doc(db, 'profiles', userId), profileData);
        showToast('Profile saved successfully!', 'success');
        
        // Update display
        populateProfile(profileData);

        // Exit edit mode
        isEditing = false;
        const inputs = document.querySelectorAll('input[type="text"]');
        const editBtn = document.getElementById('editToggleBtn');
        const editIcon = document.getElementById('editIcon');
        const actionButtons = document.getElementById('actionButtons');

        inputs.forEach(input => input.disabled = true);
        editBtn.className = 'p-2.5 rounded-full shadow-md transition-all hover:scale-110 active:scale-95 bg-white text-gray-600 hover:bg-gray-50';
        editIcon.className = 'lucide lucide-edit-2 text-xl';
        actionButtons.classList.add('hidden');
    } catch (error) {
        console.error('Error saving profile:', error);
        showToast('Error saving profile', 'error');
    }
}