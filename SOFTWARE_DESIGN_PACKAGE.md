# SOFTWARE DESIGN PACKAGE
**Draft for MotoCare – Motorcycle Maintenance Management System**

---

## 1. BASIC INFORMATION

| Item | Details |
|------|---------|
| **Course** | CSP312 Software Engineering 1 |
| **Program/Year/Section** | [To be filled by team] |
| **Semester / Academic Year** | [To be filled by team] |
| **Team Name** | [To be filled by team] |

### 1.5 Team Members

| Name | Email | Contact No. | Primary Role(s) | Secondary Role(s) |
|------|-------|-------------|-----------------|-------------------|
| [Name 1] | [Email] | [Contact] | Development Lead | Testing |
| [Name 2] | [Email] | [Contact] | Backend/Database | Documentation |
| [Name 3] | [Email] | [Contact] | Frontend/UI | Testing |
| [Name 4] | [Email] | [Contact] | QA/Testing | Documentation |

---

## 2. PURPOSE

MotoCare is a web-based motorcycle maintenance tracking system that helps riders keep track of their bikes' service schedules, maintenance history, repairs, and expenses. This test plan makes sure everything works as expected before users start relying on it—from logging in with their email to getting email reminders about upcoming maintenance, checking repair history, and tracking costs.

We need to verify the system is solid, catch any problems early, and make sure it runs smoothly when people actually use it.

---

## 3. SCOPE

### What We're Testing:
- **User Authentication** – Sign up with email, login, Google authentication, password toggle visibility
- **Motorcycle Management** – Add, edit, delete motorcycles; track odometer readings
- **Maintenance Schedule** – View due maintenance, mark tasks as complete, auto-generate next due dates
- **Repair & Maintenance History** – Log repairs, track maintenance records, view complete history with filters
- **Email Reminders** – Auto-send email reminders when maintenance is due based on mileage thresholds
- **Dashboard** – View maintenance statistics, expense charts, total service counts
- **Expense Tracking** – Log repair expenses, categorize costs, visualize spending trends
- **Profile & Settings** – User profile management, reminder preferences, auto-send settings
- **Mobile Responsiveness** – UI works on phones, tablets, and desktops
- **Data Persistence** – All data saves to Firebase and loads correctly on refresh

### Not Testing:
- Third-party APIs (Google Sign-In provider itself, EmailJS email delivery infrastructure)
- Firebase backend infrastructure reliability (we assume it works)
- Browser-specific performance optimizations beyond compatibility checks
- Advanced analytics or export features not yet implemented

---

## 4. OBJECTIVES

- Make sure users can sign up, log in, and stay logged in without issues
- Verify that motorcycle data, repairs, and maintenance records save correctly and load when needed
- Test that email reminders actually get sent when maintenance is due
- Check that dashboard counts and charts show accurate numbers
- Ensure the schedule "Mark as Complete" flow works smoothly and updates history automatically
- Catch any bugs that would frustrate users (broken buttons, missing fields, confusing workflows)
- Validate that the app works on different browsers and devices
- Confirm the app doesn't crash or lose data under normal usage

---

## 5. TEST ITEMS

| Module | Key Features |
|--------|--------------|
| **Authentication** | Login, Sign Up, Google Sign-In, Logout, Password visibility toggle |
| **Motorcycles** | Add/edit/delete bikes, view motorcycle list, track initial mileage |
| **Maintenance Schedule** | View due items, mark complete, auto-generate next due, set thresholds |
| **Repair History** | Log repairs, view full history, search/filter by date/category, update service counts |
| **Email Reminders** | Auto-create reminders, send emails, toggle auto-send on/off, avoid duplicates |
| **Dashboard** | Total services count, repair charts, maintenance trends, maintenance by category |
| **Expense Tracking** | Log expenses, categorize costs, visualize spending charts |
| **Profile** | Edit email, update settings, manage reminder preferences |
| **Mobile UI** | Responsive design, touch-friendly buttons, navigation works on small screens |
| **Data Sync** | Firestore data persistence, real-time updates, no data loss on refresh |

---

## 6. TEST STRATEGY

### 6.1 Testing Levels

**Unit Testing** – Developers test individual functions (like calculating next maintenance due date, checking email format) as they write code.

**Integration Testing** – Test how modules work together (e.g., when you mark a repair complete, does it update the dashboard count? Does it create the next due maintenance?).

**System Testing** – Full end-to-end workflows (sign up → add motorcycle → schedule maintenance → mark complete → check history → view dashboard).

**User Acceptance Testing (UAT)** – Real user tests the app and gives feedback on usability and whether it matches what they expected.

### 6.2 Testing Types

**Functional Testing** – Does the app do what it's supposed to? Login works, reminders send, counts are accurate.

**Usability Testing** – Is it easy to use? Can a new user figure out how to add a motorcycle without getting lost?

**Performance Testing** – Does the app feel slow when loading data, or is it responsive?

**Security Testing** (Basic) – Password fields don't show plain text, user data is private to their account, no obvious vulnerabilities.

**Compatibility Testing** – App works on Chrome, Firefox, Safari, Edge, and mobile browsers (iOS/Android).

**Data Validation Testing** – Invalid inputs are caught (bad email format, negative mileage, etc.).

---

## 7. TEST ENVIRONMENT

| Component | Specification |
|-----------|----------------|
| **Hardware** | Laptops (Windows/Mac), mobile phones (iOS/Android), tablets |
| **Operating System** | Windows 11, macOS 12+, iOS 15+, Android 12+ |
| **Browsers** | Chrome 120+, Firefox 121+, Safari 17+, Edge 120+ |
| **Database** | Firebase Firestore (test project) |
| **Backend Services** | Firebase Authentication, EmailJS (client-side), Firestore |
| **Tools Used** | Manual testing, Chrome DevTools, Firebase Console, Postman (API calls if needed) |
| **Network** | Internet connection required (cloud-based app) |

---

## 8. TEST SCHEDULE

| Week | Phase | Activity | Target Completion |
|------|-------|----------|-------------------|
| Week 1 | Planning | Finalize test cases, set up test accounts, prepare test data | [Date] |
| Week 2 | Preparation | Create test motorcycles, set up maintenance schedules, document initial state | [Date] |
| Week 3 | Execution – Core | Test auth flows, motorcycle management, basic schedule features | [Date] |
| Week 4 | Execution – Advanced | Test email reminders, dashboard accuracy, repairs & history, edge cases | [Date] |
| Week 5 | Bug Fixes & Retest | Fix identified issues, retest fixes, verify no regressions | [Date] |
| Week 6 | UAT & Final Review | User feedback, final polish, document final results | [Date] |

---

## 9. TEST CASES

### Sample Test Cases (Full set to be completed):

| TC ID | Feature | Steps | Expected | Status |
|-------|---------|-------|----------|--------|
| **TC-01** | Sign Up | 1. Go to index.html 2. Enter valid email & password 3. Click Sign Up | Account created, redirected to dashboard, can log out & back in | [ ] |
| **TC-02** | Login | 1. Go to index.html 2. Enter registered email & password 3. Click Login | User logged in, dashboard displays | [ ] |
| **TC-03** | Invalid Login | 1. Enter wrong password 2. Click Login | Error message shown, not logged in | [ ] |
| **TC-04** | Add Motorcycle | 1. Dashboard → Motorcycles 2. Add new bike (brand, model, year, initial mileage) 3. Save | Bike appears in list, mileage saved | [ ] |
| **TC-05** | View Schedule | 1. Navigate to Schedule tab 2. View all due maintenance items | Items display with due mileage, current mileage, category | [ ] |
| **TC-06** | Mark Complete | 1. Schedule tab 2. Click "Mark as Complete" on item 3. Redirect form opens 4. Fill odometer reading 5. Save | Repair logged in history, next due generated, dashboard count updated | [ ] |
| **TC-07** | Email Reminder Send | 1. Toggle "Auto-Send Reminders" on 2. System detects due items 3. Check email inbox | Email received for due maintenance, contains bike name & maintenance type | [ ] |
| **TC-08** | Dashboard Accuracy | 1. Log 5 repairs for a bike 2. View dashboard "Total Services" | Count shows 5, not outdated number | [ ] |
| **TC-09** | History Filter | 1. History page 2. Filter by motorcycle or date range 3. Apply filter | Correct records displayed, others hidden | [ ] |
| **TC-10** | Mobile Responsive | 1. Open app on mobile (viewport 375px) 2. Navigate all pages 3. Fill forms on small screen | Layout adjusts, buttons work, no horizontal scroll | [ ] |
| **TC-11** | Data Persist | 1. Add motorcycle 2. Refresh page 3. Check motorcycle list | Data still there, nothing lost | [ ] |
| **TC-12** | Duplicate Reminders | 1. Auto-send enabled 2. Same maintenance item loads twice 3. Check inbox | Only one email received, not two | [ ] |

---

## 10. ENTRY AND EXIT CRITERIA

### Entry Criteria (Before Testing Starts):
- ✓ Code is deployed to a test environment (or running locally with `python -m http.server`)
- ✓ All developers have signed off that "ready to test" (no obvious broken stuff)
- ✓ Test accounts created in Firebase (dummy user for testing)
- ✓ Test data ready (test motorcycles, schedules, etc. in Firestore)
- ✓ Test team has access to Firebase Console and EmailJS logs
- ✓ Testers understand the workflows (read through the app)

### Exit Criteria (Before Release):
- ✓ All critical test cases passed (login, schedule, email reminders)
- ✓ No "show-stopper" bugs remain (bugs that break core features)
- ✓ Medium/High severity bugs are fixed and retested
- ✓ Low severity bugs documented (nice-to-haves for next release)
- ✓ Mobile responsiveness verified
- ✓ No major data loss or corruption
- ✓ UAT feedback incorporated
- ✓ Final sign-off by team lead

---

## 11. DEFECT MANAGEMENT

### Bug Tracking Log Format:

| Bug ID | Title | Description | Severity | Status | Notes |
|--------|-------|-------------|----------|--------|-------|
| BUG-01 | Login fails with spaces in email | User enters " user@email.com" (leading space), gets auth error | Medium | Fixed | Trimmed input in auth.js |
| BUG-02 | Dashboard chart crashes on reload | Canvas error when navigating back to dashboard | High | Fixed | Added chart instance cleanup |
| BUG-03 | Email reminder not received | Auto-send enabled but no emails sent | High | [TBD] | Check EmailJS config |
| BUG-04 | Schedule count wrong | "Total Services" shows 3 but history shows 5 repairs | High | Fixed | Updated dashboard listener |

**Severity Levels:**
- **Critical**: App crashes, data lost, security issue → fix immediately
- **High**: Core feature broken (can't log in, reminders don't work, counts wrong) → fix before release
- **Medium**: Feature partially broken or confusing UI (error message unclear) → fix soon
- **Low**: Minor cosmetic issue or typo → can wait for next update

---

## 12. ROLES AND RESPONSIBILITIES

| Role | Responsibility |
|------|-----------------|
| **Test Lead / QA Owner** | Oversees all testing, prioritizes bugs, decides go/no-go for release |
| **Developers** | Write code, fix identified bugs, retest fixes, ensure no regressions |
| **Testers** | Execute test cases, document bugs, verify fixes |
| **User Representative** | Try out the app from a real user's perspective, give feedback on usability |
| **DevOps / Tech Lead** | Manage test environment, Firebase configs, email service setup |

---

## 13. RISKS AND MITIGATION

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|-----------|
| **EmailJS not working** | Reminders won't send; core feature broken | Medium | Test EmailJS config early (Week 1), have fallback logs to verify attempts |
| **Bugs found very late** | Not enough time to fix before presentation | Medium | Test continuously, don't wait until Week 6 |
| **Firebase quota exceeded** | App stops working during testing | Low | Monitor Firestore usage, use test project sparingly |
| **Team member unavailable** | Testing delayed, coverage incomplete | Low | Cross-train team members on test procedures |
| **Performance issues under load** | App slow when many users, but can't test realistic load | Low | Note as limitation in documentation, focus on functional correctness |
| **Browser compatibility issues** | Works in Chrome but breaks in Firefox/Safari | Medium | Test on multiple browsers from Week 3 onward |

---

## 14. DELIVERABLES

By the end of testing, we'll have:

1. **Test Plan Document** (this document) ✓
2. **Test Cases Spreadsheet** – All TC-01 through TC-XX with results
3. **Bug Report / Defect Log** – All bugs found, severity, status, fix notes
4. **Test Summary Report** – What we tested, what passed, what we learned, recommendations
5. **Screenshots/Evidence** – Key test results documented with browser/device info
6. **User Feedback Notes** – UAT findings and incorporation plan

---

## 15. APPROVAL

We, the undersigned, confirm that we contributed to and agree with this Software Test Plan (subject to refinements as testing progresses and we learn more).

| Name | Role | Signature | Date |
|------|------|-----------|------|
| [Team Member 1] | [Role] | _________________ | ____/____/______ |
| [Team Member 2] | [Role] | _________________ | ____/____/______ |
| [Team Member 3] | [Role] | _________________ | ____/____/______ |
| [Team Member 4] | [Role] | _________________ | ____/____/______ |

---

## APPENDIX: Quick Reference

### MotoCare Workflow (What We're Testing)

1. **User Signs Up** → Firebase creates account
2. **User Adds Motorcycle** → Stored in Firestore, initial mileage recorded
3. **System Creates Maintenance Schedule** → Based on bike type & maintenance rules
4. **Reminders Auto-Generate** → When mileage threshold reached
5. **Email Sent** → EmailJS sends reminder to user's email
6. **User Marks Complete** → Records repair in history, calculates next due maintenance
7. **Dashboard Updates** → Charts and counts refresh with new data
8. **User Views History** → All repairs & maintenance visible with filters

### Key Test Accounts / Data

| Email | Password | Bikes | Purpose |
|-------|----------|-------|---------|
| test.user1@motocare.local | TestPass123! | 2 motorcycles | Main workflow testing |
| test.user2@motocare.local | TestPass456! | 1 motorcycle | Edge case testing |

### Tools & Links

- **App URL**: `file:///c:/Users/Admin/OneDrive/Documents/Motocare/index.html` (local) or deployed URL
- **Firebase Console**: https://console.firebase.google.com
- **Test Data**: Manually created in Firestore or seeded via script
- **Email Testing**: Check test inbox or EmailJS dashboard

---

**Document Version**: 1.0  
**Last Updated**: [Date]  
**Next Review**: After Week 1 testing
