# MotoCare PowerPoint Presentation Outline
**For CSP312 Software Engineering 1 Course Presentation**

---

## SLIDE 1: TITLE SLIDE
- **Project Title**: MotoCare – Motorcycle Maintenance Management System
- **Team Name**: [Your Team Name]
- **Team Members**: 
  - [Name 1] – Development Lead
  - [Name 2] – Backend/Database
  - [Name 3] – Frontend/UI
  - [Name 4] – QA/Testing
- **Course**: CSP312 Software Engineering 1
- **Date**: [Presentation Date]
- **Background**: Use the motorcycle logo (logo.png) or a clean gradient

---

## SECTION 1: PROJECT OVERVIEW (Slides 2-5)

### SLIDE 2: WHAT IS MOTOCARE?
- **One-liner**: A web app that helps motorcycle owners manage maintenance schedules, track repairs, and stay on top of their bike's upkeep.
- **Key Points**:
  - Automated maintenance reminders based on mileage
  - Real-time repair and maintenance history tracking
  - Email notifications when service is due
  - Expense tracking and analytics
  - Works on desktop and mobile browsers

### SLIDE 3: TARGET USERS
- **Primary Users**:
  - Individual motorcycle owners (casual to serious riders)
  - People who want to avoid missed maintenance
  - Users who prefer automated reminders over manual tracking
- **Use Cases**:
  - Busy rider tracking multiple bikes
  - New rider learning maintenance requirements
  - Rider wanting to monitor maintenance costs
- **Visual**: Include a persona or user avatar

### SLIDE 4: PROBLEM STATEMENT
**Problem**: Motorcycle owners struggle with:
- Forgetting when maintenance is due
- Losing track of repair history (paper receipts get lost)
- Not knowing how much they've spent on maintenance
- Missing optional but recommended services (oil changes, tire rotations)
- Manually calculating next maintenance dates

**Impact**: 
- Damage to motorcycle from missed maintenance
- Wasted money on emergency repairs
- Lack of resale documentation

### SLIDE 5: OBJECTIVES
**What MotoCare Solves**:
1. ✓ **Automated Reminders** – Email alerts when maintenance is due (based on mileage thresholds)
2. ✓ **Complete History** – Digital record of all repairs and maintenance with dates, costs, notes
3. ✓ **Easy Tracking** – Simple dashboard showing bike status, upcoming maintenance, expense trends
4. ✓ **Next-Due Automation** – System automatically calculates when next maintenance is needed
5. ✓ **Multi-Bike Support** – Track multiple motorcycles under one account
6. ✓ **Accessible Anywhere** – Works on phone, tablet, desktop browsers

---

## SECTION 2: SYSTEM ANALYSIS (Slides 6-9)

### SLIDE 6: EXISTING PROCESS / PROBLEMS
**How Riders Currently Track Maintenance:**
- **Manual Methods**: Paper notebooks, calendar reminders, photos of receipts
- **Problems**:
  - ❌ Easy to forget or miss reminders
  - ❌ No central location for all records
  - ❌ Hard to calculate next due date (especially if mileage varies)
  - ❌ No spending insights or trends
  - ❌ Time-consuming to track multiple bikes
  - ❌ No accountability or history for resale

**Visual**: Show a messy photo of scattered maintenance receipts or a handwritten notebook

### SLIDE 7: WHY EXISTING SOLUTIONS DON'T WORK
- **Manual Calendar Apps**: No mileage-based triggers, generic reminders
- **Generic Maintenance Trackers**: Not motorcycle-specific, wrong assumptions
- **Spreadsheets**: No automation, error-prone, hard to access on mobile
- **Dealer Services**: Expensive, doesn't track personal DIY maintenance
- **Existing Apps**: [Research any current competitors and list their gaps]

**MotoCare fills the gap with**: Motorcycle-specific automation, free/accessible, mobile-friendly, integrates email reminders

### SLIDE 8: PROPOSED SOLUTION
**How MotoCare Works**:

1. **User Signs Up** → Creates account with email
2. **Add Motorcycle** → Record brand, model, year, current mileage
3. **Maintenance Triggers** → System loads recommended maintenance schedule based on bike type
4. **Mileage Tracking** → User logs odometer readings as they ride
5. **Auto-Reminders** → When mileage approaches due threshold, system sends email reminder
6. **Mark Complete** → User marks maintenance done, logs repair details & cost
7. **Auto-Calculate Next** → System schedules next due maintenance automatically
8. **Dashboard & History** → View all repairs, expenses, trends in one place

**Visual**: Flow diagram showing user journey (sign up → add bike → get reminder → mark complete → view history)

### SLIDE 9: SCOPE & LIMITATIONS
**In Scope** ✓:
- Email reminders based on mileage thresholds
- Repair & maintenance history tracking
- Expense tracking and charts
- Multi-bike support
- Dashboard with stats
- Mobile-responsive design
- Firebase authentication (email/Google login)

**Out of Scope** ✗:
- GPS tracking or real-time mileage sync (manual entry only)
- Integration with dealer systems
- SMS reminders (email only, but can be added later)
- Hardware sensors or OBD devices
- Social features or community reviews
- Scheduling with service shops

**Limitations**:
- Manual mileage entry required (not automatic)
- Email delivery depends on EmailJS service
- Single-user per account (no family sharing)

---

## SECTION 3: SYSTEM DESIGN (Slides 10-16)

### SLIDE 10: SYSTEM ARCHITECTURE DIAGRAM
**Show**: High-level architecture with three layers:

```
┌─────────────────────────────────────────────┐
│  FRONTEND (Web Browser)                     │
│  HTML, CSS, JavaScript (ES Modules)         │
│  ├─ Login / Auth Pages                      │
│  ├─ Dashboard, Schedule, History            │
│  └─ Mobile Responsive UI (Tailwind CSS)     │
└────────────┬────────────────────────────────┘
             │ HTTPS Calls
┌────────────▼────────────────────────────────┐
│  SERVICES LAYER (Third-party)               │
│  ├─ Firebase Auth (Email, Google SignIn)    │
│  ├─ Firebase Firestore (Database)           │
│  └─ EmailJS (Send Reminders)                │
└─────────────────────────────────────────────┘
```

**Key Components**:
- Client-side logic in JavaScript
- Real-time listeners via Firestore
- Stateless email sends via EmailJS
- No backend server (JAMstack + Cloud Services)

### SLIDE 11: USE CASE DIAGRAM
**Main Actors**: Motorcycle Owner, System

**Use Cases**:
- UC-01: Sign Up / Login (with Google)
- UC-02: Add/Edit/Delete Motorcycle
- UC-03: View Maintenance Schedule
- UC-04: Mark Maintenance Complete
- UC-05: View Repair History
- UC-06: Receive Email Reminder
- UC-07: View Dashboard & Analytics
- UC-08: Track Expenses
- UC-09: Manage Settings (reminder thresholds, auto-send on/off)

**Visual**: Draw a simple stick figure (Motorcycle Owner) with boxes for each use case connected by arrows

### SLIDE 12: CONTEXT DIAGRAM
**System Context**:
- **External Entities**: User, Firebase Cloud, Email Service (EmailJS), Google Services
- **System Boundary**: MotoCare Application
- **Data Flows**: 
  - User enters data → System stores → System sends email → User receives reminder

### SLIDE 13: CLASS DIAGRAM (Data Model)
**Main Classes/Objects**:

```
┌──────────────────────┐
│       User           │
├──────────────────────┤
│ - email              │
│ - uid (Firebase)     │
│ - createdAt          │
│ - reminderThreshold  │
├──────────────────────┤
│ + login()            │
│ + signUp()           │
│ + logout()           │
└──────────────────────┘
          │ owns many
          │
┌──────────────────────┐
│    Motorcycle        │
├──────────────────────┤
│ - id                 │
│ - brand, model, year │
│ - currentOdo         │
│ - initialOdo         │
│ - userId             │
├──────────────────────┤
│ + addMotorcycle()    │
│ + updateOdo()        │
└──────────────────────┘
          │ has many
          │
┌──────────────────────┐
│   Maintenance        │
├──────────────────────┤
│ - id                 │
│ - type (oil, tires)  │
│ - dueEvery (km)      │
│ - lastDue            │
│ - nextDue            │
├──────────────────────┤
│ + getNextDue()       │
└──────────────────────┘
          │ generates
          │
┌──────────────────────┐
│     Repair Record    │
├──────────────────────┤
│ - id                 │
│ - type               │
│ - date               │
│ - cost               │
│ - mileage            │
│ - notes              │
├──────────────────────┤
│ + logRepair()        │
└──────────────────────┘
```

### SLIDE 14: ENTITY RELATIONSHIP DIAGRAM (ERD)
**Firestore Collections**:

```
USER Collection:
  ├─ email (string, PK)
  ├─ uid (string)
  ├─ createdAt (timestamp)
  └─ reminderThreshold (object)

MOTORCYCLES Collection:
  ├─ id (string, PK)
  ├─ userId (string, FK)
  ├─ brand, model, year (string)
  ├─ currentOdo (number)
  └─ initialOdo (number)

MAINTENANCE Collection:
  ├─ id (string, PK)
  ├─ motorcycleId (string, FK)
  ├─ type (string)
  ├─ dueEvery (number)
  ├─ interval (string: 'month' or 'km')
  └─ category (string)

REPAIRS Collection:
  ├─ id (string, PK)
  ├─ motorcycleId (string, FK)
  ├─ type (string)
  ├─ date (timestamp)
  ├─ cost (number)
  ├─ mileage (number)
  └─ notes (string)

EMAIL_REMINDERS Collection:
  ├─ id (string, PK)
  ├─ userId (string, FK)
  ├─ motorcycleId (string, FK)
  ├─ maintenanceType (string)
  ├─ sent (boolean)
  ├─ dueMileage (number)
  └─ timestamp (timestamp)
```

### SLIDE 15: USER INTERFACE DESIGN
**Key Screens** (Show wireframes or screenshots):

1. **Login / Sign Up Page**
   - Email/password fields
   - Google Sign-In button
   - Toggle between Login and Sign Up modes
   - MotoCare logo in circular badge

2. **Dashboard Page**
   - Welcome message with user's name
   - Total services count card
   - Upcoming maintenance alerts
   - Expense chart (pie or bar chart)
   - Maintenance trends chart
   - Quick links to key pages

3. **Schedule Page**
   - List of all due/upcoming maintenance
   - For each item: bike name, type, due mileage, current mileage
   - "Mark as Complete" button
   - Auto-send reminders toggle
   - Email reminders card showing queued messages

4. **Add Record / Mark Complete Page**
   - Prefilled motorcycle and maintenance type (when coming from schedule)
   - Input field for current odometer reading
   - Date picker for service date
   - Cost input
   - Notes textarea
   - Save button

5. **History Page**
   - Table/list of all repairs and maintenance
   - Filter by motorcycle, date range, or type
   - Search bar
   - Shows date, type, mileage, cost, notes

6. **Mobile View**
   - Hamburger menu navigation
   - Responsive cards/buttons
   - Touch-friendly input fields
   - Vertical layout

### SLIDE 16: DESIGN DECISIONS
**Color Scheme**: Green theme (motorcycle/eco-friendly vibes)
- Primary: Green-700 (#15803d)
- Secondary: White backgrounds
- Accents: Gray for secondary elements

**Typography**: Clean, modern
- Sans-serif font (via Tailwind)
- Clear hierarchy (headings, body, labels)

**UX Decisions**:
- Cards for content chunks (visual clarity)
- Toggle buttons for modes (login/signup)
- Real-time data updates (Firestore listeners)
- Toast notifications for feedback
- Pre-filled forms (when coming from schedule)

---

## SECTION 4: DEVELOPMENT PROCESS (Slides 17-21)

### SLIDE 17: DEVELOPMENT METHODOLOGY
**Approach**: Agile (Iterative & Incremental)
- **Sprint Planning**: 1-week sprints
- **User Stories**: Broken into tasks (auth, motorcycles, schedule, reminders, dashboard, history)
- **Daily Standups**: Team syncs on progress and blockers
- **Sprint Review**: Demo completed features
- **Retrospective**: Lessons learned each week

**Why Agile?**
- ✓ Allows feedback early and often
- ✓ Can prioritize high-value features first (auth, schedule)
- ✓ Flexible to changes or new requirements
- ✓ Team stays aligned

### SLIDE 18: TOOLS & TECHNOLOGIES USED
**Frontend**:
- HTML5, CSS3, JavaScript (ES6+ Modules)
- Tailwind CSS (utility-first styling)
- Lucide Icons (UI icons)
- Chart.js (dashboard charts)

**Backend/Cloud**:
- Firebase Authentication (email, Google SignIn)
- Firebase Firestore (real-time NoSQL database)
- Firestore Real-time Listeners (auto-sync data)

**Email Service**:
- EmailJS (client-side email sending)
- No backend server needed

**Version Control & Deployment**:
- GitHub (code repo, version control)
- Git branches (feature branches, main)
- Firebase Hosting (for deployment)

**Development Tools**:
- VS Code (code editor)
- Chrome DevTools (debugging)
- Firebase Console (database management)
- Postman (testing APIs if needed)

**Tech Stack Summary**:
```
Frontend: HTML/CSS/JS (Tailwind) → Firebase Auth + Firestore ← EmailJS
│
└─ No backend server needed (JAMstack + BaaS)
```

### SLIDE 19: KEY FEATURES IMPLEMENTED
**Completed Features** ✓:

1. **User Authentication**
   - Email/password signup & login
   - Google Sign-In integration
   - Session persistence with Firebase auth
   - Password visibility toggle

2. **Motorcycle Management**
   - Add/edit/delete motorcycles
   - Track initial and current odometer readings
   - List view with bike details

3. **Maintenance Schedule**
   - Displays all due maintenance for user's bikes
   - Shows due mileage, current mileage, category
   - Real-time updates (Firestore listeners)
   - Mark as Complete button

4. **Auto Reminders**
   - Automatic email reminders when mileage threshold approached
   - Toggle auto-send on/off
   - Signature-based deduplication (prevents duplicate emails)
   - Stores reminder status in Firestore

5. **Repair History**
   - Log repairs with date, cost, notes, mileage
   - Filter by motorcycle, date range, type
   - Search functionality
   - Real-time count updates

6. **Dashboard**
   - Total services count (accurate, real-time)
   - Expense pie chart (spending by category)
   - Maintenance trends chart (by type)
   - Maintenance by category breakdown
   - Responsive charts (Chart.js)

7. **Responsive Design**
   - Mobile-first approach (works on 375px width)
   - Tablet and desktop layouts
   - Touch-friendly buttons and forms
   - No horizontal scrolling

### SLIDE 20: CHALLENGES & SOLUTIONS
| Challenge | Solution |
|-----------|----------|
| **Chart.js canvas reuse error** | Track chart instances globally, destroy before recreating |
| **Duplicate email reminders** | Implement signature-based deduplication (use bike ID + maintenance type + due mileage as unique key) |
| **Accurate dashboard counts** | Use real-time Firestore listeners on repairs collection, not cached counts |
| **Email delivery (EmailJS)** | Client-side sends, provided public key & template setup; documented troubleshooting steps |
| **Schedule → Mark Complete workflow complexity** | Redirect with prefill params, handler auto-creates next due maintenance |
| **Real-time data sync** | Firestore listeners (onSnapshot) for schedule and repairs, auto-update UI |
| **Mobile responsiveness** | Tailwind responsive utilities, tested on multiple breakpoints |
| **Form prefilling (editing vs creating)** | Query params from redirect, conditional logic to populate fields |

### SLIDE 21: DEV TEAM WORKFLOW
**Development Phases**:
1. **Week 1**: Core setup (Firebase config, basic auth, UI layout)
2. **Week 2**: Motorcycles & Schedule modules
3. **Week 3**: Email reminders & History module
4. **Week 4**: Dashboard & Charts, mobile optimization
5. **Week 5**: Bug fixes, chart reuse fix, reminder deduplication
6. **Week 6**: Testing, documentation, final polishing

**Git Workflow**:
- `main` branch (production-ready)
- `emailjs-auto-send-demo` feature branch
- Pull requests for code review
- Commits with descriptive messages

---

## SECTION 5: TESTING & EVALUATION (Slides 22-25)

### SLIDE 22: TESTING METHODS
**Testing Approach** (from Software Design Package):

**Testing Levels**:
1. **Unit Testing** – Test individual functions (auth logic, date calculations)
2. **Integration Testing** – Modules work together (mark complete → history update → dashboard count)
3. **System Testing** – End-to-end workflows (sign up → add bike → schedule → reminder → history)
4. **User Acceptance Testing** – Real user tries app, gives feedback

**Testing Types**:
- **Functional**: Does it work? (login, reminders send, counts correct)
- **Usability**: Is it easy to use? (new user can figure it out)
- **Performance**: Does it feel responsive? (no lag when loading data)
- **Security**: Basic checks (passwords hidden, user data private)
- **Compatibility**: Works on Chrome, Firefox, Safari, Edge, mobile browsers
- **Data Validation**: Invalid inputs caught (bad email, negative mileage)

### SLIDE 23: SAMPLE TEST CASES & RESULTS
**Key Test Cases** (from Software Design Package):

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| **TC-01: Sign Up** | Enter email & password → Click Sign Up | Account created, redirected to dashboard | ✓ PASS |
| **TC-02: Login** | Enter email & password → Click Login | User logged in, dashboard displays | ✓ PASS |
| **TC-04: Add Motorcycle** | Go to Motorcycles → Add bike → Save | Bike appears in list, mileage saved | ✓ PASS |
| **TC-05: View Schedule** | Go to Schedule → See due items | Items show bike, type, due/current mileage | ✓ PASS |
| **TC-06: Mark Complete** | Schedule → Mark Complete → Fill form → Save | Repair logged in history, next due generated, dashboard updated | ✓ PASS |
| **TC-07: Email Reminder** | Enable auto-send → Check inbox | Email received for due maintenance | ✓ PASS (with caveat*) |
| **TC-08: Dashboard Accuracy** | Log 5 repairs → Check "Total Services" count | Count shows 5 (accurate) | ✓ PASS |
| **TC-10: Mobile Responsive** | Open on mobile (375px) → Test all pages | Layout adjusts, no scroll, buttons work | ✓ PASS |
| **TC-11: Data Persist** | Add motorcycle → Refresh → Check list | Data still there | ✓ PASS |
| **TC-12: Duplicate Reminders** | Auto-send on → Same item loads twice → Check inbox | Only one email (not two) | ✓ PASS |

*Caveat: Email delivery depends on EmailJS service and user's email provider (spam filters, etc.)

### SLIDE 24: BUG FIXES APPLIED
**Bugs Found & Fixed**:

| Bug | Severity | Status |
|-----|----------|--------|
| Chart.js canvas reuse error on dashboard reload | High | ✓ FIXED – Added instance tracking & destroy logic |
| Dashboard "Total Services" showed stale count | High | ✓ FIXED – Switched to real-time Firestore listeners |
| Duplicate email reminders sent | High | ✓ FIXED – Implemented signature-based deduplication |
| Chart memory leak when switching pages | Medium | ✓ FIXED – Properly cleanup chart instances |
| Form validation missing on Add Record | Medium | ✓ FIXED – Added required field checks |

### SLIDE 25: USER FEEDBACK (if applicable)
**Feedback Received**:
- ✓ "Easy to understand, no confusing terms"
- ✓ "Dashboard looks clean and informative"
- ✓ "Adding a bike is straightforward"
- [Optional] Suggestions for improvement:
  - SMS reminders in the future
  - Photo upload for receipts
  - Integration with service shops

---

## SECTION 6: SYSTEM DEMONSTRATION (Slides 26-27)

### SLIDE 26: LIVE DEMO WALKTHROUGH
**Demo Script** (Show live or recorded video):

**Step 1: Login / Sign Up** (30 sec)
- Show login page with logo
- Click "Sign Up"
- Enter email & password
- Click Sign Up button
- Redirected to dashboard

**Step 2: Add Motorcycle** (30 sec)
- Click "Motorcycles" in nav
- Click "Add New Motorcycle"
- Fill form: Brand (Honda), Model (CB500), Year (2022), Initial Mileage (5000)
- Click Save
- Bike appears in list

**Step 3: View Schedule** (30 sec)
- Click "Schedule" in nav
- Show list of due maintenance (Oil Change at 6500 km, Tire Rotation at 7000 km)
- Point out the "Due Mileage", "Current Mileage", category labels
- Show "Auto-Send Reminders" toggle

**Step 4: Mark as Complete** (45 sec)
- Click "Mark as Complete" on Oil Change
- Form opens with prefilled bike name and maintenance type
- Enter current mileage (6200)
- Enter date (today)
- Enter cost ($50)
- Add note ("Professional service at Honda dealer")
- Click Save
- Show confirmation toast
- Back to schedule – next Oil Change is now scheduled for 8000 km

**Step 5: Check History** (30 sec)
- Click "History" in nav
- Show repair record we just added
- Apply filter (show only Oil Changes for past 30 days)
- Show total count updated in card header

**Step 6: View Dashboard** (45 sec)
- Click "Dashboard" in nav
- Point out "Total Services" count (accurate, real-time)
- Show Expense Chart (pie chart by category)
- Show Maintenance Trends (bar chart by type)
- Mention charts update automatically when new repairs are logged

**Step 7: Mobile Responsive** (15 sec)
- Open browser DevTools
- Switch to mobile view (375px)
- Navigate pages – show layout adapts
- Show touch-friendly buttons

**Total Demo Time**: ~4 minutes (keeps presentation flowing)

### SLIDE 27: BACKUP VIDEO / SCREENSHOTS
**For Technical Issues**:
- **Backup Plan**: Have a recorded video of the demo (in case live demo has issues)
- **Fallback**: Show high-quality screenshots of key screens
- Include captions explaining what's happening

**Key Screenshots to Include**:
1. Login page with logo
2. Dashboard with charts
3. Schedule page with due items
4. Add Record form (prefilled)
5. History page with repairs list
6. Mobile responsive view

---

## SECTION 7: CONCLUSION & RECOMMENDATIONS (Slides 28-31)

### SLIDE 28: SUMMARY OF FINDINGS
**What We Accomplished**:
- ✓ Built a fully functional motorcycle maintenance tracking system
- ✓ Implemented real-time data synchronization with Firebase
- ✓ Created automated email reminders based on mileage thresholds
- ✓ Designed responsive UI for desktop and mobile
- ✓ Tested core features thoroughly (12 test cases, all passing)
- ✓ Fixed critical bugs (chart reuse, duplicate reminders, accuracy)
- ✓ Documented system design and testing approach

**Key Metrics**:
- **Features Implemented**: 10 major features (auth, motorcycles, schedule, reminders, repairs, history, dashboard, expenses, profile, settings)
- **Bugs Fixed**: 5 high/medium severity issues
- **Test Coverage**: 12 test cases covering functional, usability, compatibility, and data persistence
- **Code Quality**: Clean, modular ES6 modules, no critical errors
- **Performance**: Fast real-time updates, charts render smoothly

### SLIDE 29: LESSONS LEARNED
**Technical Lessons**:
1. **Real-time Listeners > One-shot Reads** – Using Firestore onSnapshot keeps UI always in sync without manual refreshes
2. **Deduplication is Critical** – Signature-based keys prevent duplicate reminders when data loads multiple times
3. **Chart Lifecycle Management** – Must destroy Chart.js instances before creating new ones to avoid memory leaks
4. **Form Prefilling Complexity** – Query params + conditional logic needed to handle create vs. edit workflows
5. **Mobile-First Design** – Building responsive from the start is easier than retrofitting

**Team Lessons**:
1. **Communication is Key** – Daily standups kept everyone aligned on progress/blockers
2. **Incremental Testing** – Testing each feature as it's built catches bugs early
3. **Clear Scope Definition** – Knowing what's in/out of scope prevented scope creep
4. **Documentation Matters** – This design package makes handoff/maintenance easier

### SLIDE 30: FUTURE IMPROVEMENTS & RECOMMENDATIONS
**Short-term (Next Release)**:
- [ ] SMS reminders (in addition to email)
- [ ] Receipt photo upload and storage
- [ ] Maintenance checklist templates for different bike types
- [ ] Export history to PDF
- [ ] Recurring reminders for time-based maintenance (e.g., every 6 months)

**Medium-term (Scaling)**:
- [ ] Mobile app (iOS/Android) for better offline support
- [ ] Service shop directory and booking integration
- [ ] Parts replacement tracking (tire life, battery, brakes)
- [ ] Motorcycle resale documentation package (full service history)
- [ ] Multi-user sharing (family members on same bike)

**Long-term (Growth)**:
- [ ] IoT integration (automatic mileage sync from bike sensors)
- [ ] Community features (share maintenance tips, reviews)
- [ ] Predictive maintenance (ML to predict failures)
- [ ] Insurance integration (discounts for well-maintained bikes)
- [ ] Server-side deployment (move EmailJS to backend for scalability)

**Technical Debt to Address**:
- [ ] Move EmailJS to backend (more secure, better error handling)
- [ ] Add unit tests (Jest/Vitest for JavaScript functions)
- [ ] Implement offline mode (service workers, IndexedDB)
- [ ] Add end-to-end tests (Cypress or Playwright)
- [ ] Set up CI/CD pipeline (GitHub Actions for automated testing/deployment)

### SLIDE 31: FINAL THOUGHTS / CALL TO ACTION
**Key Takeaways**:
> "MotoCare transforms motorcycle maintenance from a hassle into an automated, worry-free process. By combining real-time reminders, centralized record-keeping, and expense tracking, we've created a tool that riders actually want to use."

**Team Reflection**:
- This project taught us the importance of user-centric design
- Real-world constraints (email delivery, real-time sync) are complex but solvable
- Testing early and often saves time and headaches

**Next Steps**:
- [ ] Deploy to production (Firebase Hosting)
- [ ] Gather user feedback from real motorcycle owners
- [ ] Plan Phase 2 features (SMS, mobile app, etc.)
- [ ] Consider monetization (freemium model, premium features)

**Final Slide Message**:
_"MotoCare: Keep Your Bike Running, Not Your Worries"_ 🏍️

---

## PRESENTATION TIPS

### Design & Aesthetics:
- Use consistent green color scheme (MotoCare brand)
- Include motorcycle logo on key slides
- Keep text minimal (bullets, not paragraphs)
- Use icons and images to break up text
- Ensure good contrast (readable on projector)

### Delivery:
- Practice demo beforehand (have backup video ready)
- Speak clearly, make eye contact
- Tell the story: Problem → Solution → Results
- Leave time for questions
- Have printed one-pager for handout

### Timing (for ~20 minute presentation):
- Slide 1-5: Project Overview (4 min)
- Slide 6-9: System Analysis (3 min)
- Slide 10-16: System Design (4 min)
- Slide 17-21: Development Process (3 min)
- Slide 22-25: Testing (2 min)
- Slide 26-27: Live Demo (4 min)
- Slide 28-31: Conclusion (2 min)
- **Total: ~22 minutes** (leaves 3-5 min for questions)

### Making It Stand Out:
- Show actual screenshots from running app (not just wireframes)
- Demo features live (impressive, but have backup plan)
- Tell user stories (how a real rider would use this)
- Highlight the "aha!" moments (email reminders auto-calculating next due date)
- Be genuine about challenges faced and how you solved them

---

## HANDOUT / REFERENCE DOCUMENT
**One-page summary** (for audience to take home):

```
MOTOCARE – Motorcycle Maintenance Management System
CSP312 Software Engineering 1 Project

PROBLEM: Motorcycle owners forget maintenance, lose repair receipts, can't track costs.

SOLUTION: Automated email reminders, centralized repair history, expense tracking.

KEY FEATURES:
✓ Email reminders based on mileage thresholds
✓ Complete repair & maintenance history
✓ Real-time dashboard with analytics
✓ Multi-bike support
✓ Mobile responsive design

TECH STACK:
Frontend: HTML, CSS, JavaScript (Tailwind CSS)
Backend: Firebase (Auth + Firestore)
Email: EmailJS
Deployment: Firebase Hosting

TEAM:
[Name 1] – Development Lead
[Name 2] – Backend/Database  
[Name 3] – Frontend/UI
[Name 4] – QA/Testing

STATUS: Fully functional, tested, ready for use.

DEMO: [Link to running app or video]
CODE: [GitHub link]

QUESTIONS? [Contact info]
```

---

**End of Presentation Outline**
