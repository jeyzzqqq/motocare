import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs, orderBy, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let completedTasks = [];
let currentUserId = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        await loadSchedule(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

async function loadSchedule(userId) {
    try {
        const q = query(
            collection(db, 'maintenance'),
            where('uid', '==', userId),
            orderBy('dueDate')
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            renderEmptySchedule();
        } else {
            const items = querySnapshot.docs
                .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
                .filter(item => item.uid === userId);
            displaySchedule(items);
            updateCounts(items);
        }
    } catch (error) {
        console.error('Error loading schedule:', error);
        renderEmptySchedule();
    }
}

function renderEmptySchedule() {
    const container = document.getElementById('scheduleList');
    if (container) {
        container.innerHTML = '<div class="text-gray-500 text-sm py-3">No records yet</div>';
    }
    document.getElementById('dueCount').textContent = '0';
    document.getElementById('upcomingCount').textContent = '0';
    document.getElementById('completedCount').textContent = '0';
}

function displaySchedule(items) {
    const container = document.getElementById('scheduleList');
    if (!items.length) {
        renderEmptySchedule();
        return;
    }
    
    container.innerHTML = items.map(item => {
        const isCompleted = completedTasks.includes(item.id) || item.status === 'completed';
        const statusIcon = getStatusIcon(isCompleted ? 'completed' : item.status);
        const statusColor = getStatusColor(isCompleted ? 'completed' : item.status);
        const priorityColor = getPriorityColor(item.priority);
        const dotColor = getDotColor(isCompleted ? 'completed' : item.status);

        return `
            <div class="relative">
                <!-- Timeline Dot -->
                <div class="absolute left-3.5 top-6 w-3 h-3 rounded-full ${dotColor} border-4 border-gray-50 z-10"></div>
                
                <!-- Card -->
                <div class="ml-12 bg-white rounded-xl p-4 shadow-md border border-gray-100 hover:shadow-lg transition-shadow">
                    <div class="flex items-start justify-between mb-2">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <h3 class="text-gray-800 font-medium ${isCompleted ? 'line-through text-gray-400' : ''}">
                                    ${item.task || item.title || 'Maintenance item'}
                                </h3>
                                <div class="w-2 h-2 rounded-full ${priorityColor}"></div>
                            </div>
                            <p class="text-xs text-gray-500">${item.category}</p>
                        </div>
                        <div class="p-2 rounded-lg ${statusColor}">
                            <i class="lucide lucide-${statusIcon} text-lg"></i>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-4 mt-3">
                        <div class="flex items-center gap-1.5">
                            <i class="lucide lucide-clock text-gray-400"></i>
                            <span class="text-xs text-gray-600">${item.dueDate || item.date || ''}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <i class="lucide lucide-wrench text-gray-400"></i>
                            <span class="text-xs text-gray-600">${item.dueMileage || ''}</span>
                        </div>
                    </div>
                    
                    ${!isCompleted && item.status !== 'completed' ? `
                        <button onclick="markComplete(${item.id}, '${item.task}')" 
                            class="mt-3 w-full py-2 bg-green-700 text-white rounded-lg text-sm hover:bg-green-800 transition-colors active:scale-95">
                            Mark as Complete
                        </button>
                    ` : ''}
                    
                    ${isCompleted ? `
                        <div class="mt-3 w-full py-2 bg-green-100 text-green-700 rounded-lg text-sm text-center flex items-center justify-center gap-2">
                            <i class="lucide lucide-check-circle-2"></i>
                            Completed
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function getStatusIcon(status) {
    switch(status) {
        case 'due': return 'alert-circle';
        case 'upcoming': return 'clock';
        case 'completed': return 'check-circle-2';
        default: return 'circle';
    }
}

function getStatusColor(status) {
    switch(status) {
        case 'due': return 'bg-red-100 text-red-600';
        case 'upcoming': return 'bg-gray-100 text-gray-600';
        case 'completed': return 'bg-green-100 text-green-700';
        default: return 'bg-gray-100 text-gray-600';
    }
}

function getPriorityColor(priority) {
    switch(priority) {
        case 'high': return 'bg-red-500';
        case 'medium': return 'bg-yellow-500';
        case 'low': return 'bg-green-500';
        default: return 'bg-gray-500';
    }
}

function getDotColor(status) {
    switch(status) {
        case 'completed': return 'bg-green-700';
        case 'due': return 'bg-red-500';
        default: return 'bg-gray-400';
    }
}

function updateCounts(items) {
    const due = items.filter(i => i.status === 'due' && !completedTasks.includes(i.id)).length;
    const upcoming = items.filter(i => i.status === 'upcoming' && !completedTasks.includes(i.id)).length;
    const completed = items.filter(i => i.status === 'completed' || completedTasks.includes(i.id)).length;

    document.getElementById('dueCount').textContent = due;
    document.getElementById('upcomingCount').textContent = upcoming;
    document.getElementById('completedCount').textContent = completed;
}

window.markComplete = async function(id, task) {
    if (!currentUserId) {
        console.error('No user ID available');
        return;
    }

    try {
        await updateDoc(doc(db, 'maintenance', String(id)), {
            status: 'completed',
            updatedAt: new Date().toISOString()
        });
        alert(`"${task}" marked as complete!`);
        await loadSchedule(currentUserId);
    } catch (error) {
        console.error('Error marking maintenance complete:', error);
        alert('Could not update task. Please try again.');
    }
}