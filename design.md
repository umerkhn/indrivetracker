# inDrive Earnings Tracker - Static Website Design
**Project:** Personal Finance Dashboard for Ride-Sharing Income Tracking
**Target User:** Umar (Pakistan-based inDrive Driver)
**Architecture:** Standalone Static Website (HTML5, Vanilla JavaScript, Tailwind CSS via CDN, LocalStorage)

## 1. PROJECT OVERVIEW
### Problem Statement
Frameworks like React, Next.js, and Python require complex build steps and local servers. The app needs to be a simple, standalone website that can be opened directly in any browser (via `file://`), works offline, and saves data locally without any installation.

### Solution
A lightning-fast, static web dashboard that:
✅ Captures trip data in <30 seconds per entry
✅ Automatically calculates weekly profit/deficit
✅ Identifies "break-even" targets when in deficit
✅ Tracks two vehicles independently (Daihatsu Mira vs. Honda Civic)
✅ Uses LocalStorage for instant saving (zero server or database required)

## 2. CORE FEATURES & USER STORIES
### Feature A: Trip Logger (Data Input)
**Fields:**
- Date (Defaults to today)
- Fare Earned (PKR, > 0)
- Fuel Expense (PKR, default 0)
- Vehicle (Dropdown: Daihatsu Mira / Honda Civic)
- Maintenance Cost (PKR, default 0)
- Other Expenses (Tolls, parking, etc.)
- Notes (Optional text)

### Feature B: Weekly Summary Dashboard
**Current Week Status Card:**
- Total Fares, Total Expenses, Net Profit
- Dynamic Styling: Green (`text-green-600` / `#10B981`) if Net ≥ 0, Red (`text-red-600` / `#EF4444`) if Net < 0.

### Feature C: Trip History Table
- Sortable/viewable columns: Date, Fare, Vehicle, Net Trip.
- Delete trip capability.

### Feature D: Weekly Rollups & Deficit Tracking
**Deficit Logic (Client-Side):**
```javascript
const weeklyNet = totalFares - totalExpenses;
if (weeklyNet < 0) {
    const deficitAmount = Math.abs(weeklyNet);
    const breakEvenTarget = deficitAmount / remainingDaysInWeek;
    // Trigger Red UI Warning
}
```
