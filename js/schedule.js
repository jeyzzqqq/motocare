import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs, orderBy, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let completedTasks = [];

onAuthStateChanged(auth, async (user) => {
    if (user) {
        await loadSchedule(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

async function loadSchedule(userId) {
    try {
        const q = query(
            collection(db, 'maintenance'),
            where('userId', '==', userId),
            orderBy('dueDate')
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            loadMockSchedule();
        } else {
            displaySchedule(querySnapshot.docs);
        }
    } catch (error) {
        console.error('Error loading schedule:', error);
        loadMockSchedule();
    }
}

function loadMockSchedule() {
    const scheduleItems = [
        {
            id: 1,
            task: 'Oil Change',
            dueDate: 'Apr 22, 2026',
            dueMileage: '13,000 miles',
            status: 'due',
            priority: 'high',
            category: 'Engine'
        },
        {
            id: 2,
            task: 'Tire Pressure Check',
            dueDate: 'Apr 25, 2026',
            dueMileage: '12,500 miles',
            status: 'upcoming',
            priority: 'medium',
            category: 'Tires'
        },
        {
            id: 3,
            task: 'Brake Fluid Replacement',
            dueDate: 'May 5, 2026',
            dueMileage: '14,000 miles',
            status: 'upcoming',
            priority: 'medium',
            category: 'Brakes'
        },
        {
            id: 4,
            task: 'Chain Lubrication',
            dueDate: 'Apr 15, 2026',
            dueMileage: '12,450 miles',
            status: 'completed',
            priority: 'low',
            category: 'Drivetrain'
        },
        {
            id: 5,
            task: 'Air Filter Cleaning',
            dueDate: 'Apr 10, 2026',
            dueMileage: '12,000 miles',
            status: 'completed',
            priority: 'low',
            category: 'Engine'
        },
        {
            id: 6,
            task: 'Coolant Level Check',
            dueDate: 'May 15, 2026',
            dueMileage: '15,000 miles',
            status: 'upcoming',
            priority: 'low',
            category: 'Engine'
        }
    ];

    displayScheduleMock(scheduleItems);
    updateCounts(scheduleItems);
}

function displayScheduleMock(items) {
    const container = document.getElementById('scheduleList');
    
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
                                    ${item.task}
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
                            <span class="text-xs text-gray-600">${item.dueDate}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <i class="lucide lucide-wrench text-gray-400"></i>
                            <span class="text-xs text-gray-600">${item.dueMileage}</span>
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

window.markComplete = function(id, task) {
    completedTasks.push(id);
    showToast(`"${task}" marked as complete!`, 'success');
    loadMockSchedule(); // Reload to update UI
}