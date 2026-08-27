'use strict';

/* =============================================================
   inDrive Earnings Tracker — app.js
   Stack : Vanilla JS | Chart.js | Supabase | LocalStorage
   Author: Built for Umar (Pakistan)
   ============================================================= */

// ── SUPABASE CONFIGURATION ────────────────────────────────────
// You can paste your Supabase keys directly below, OR enter them in the app UI via the Cloud Sync button!
const SUPABASE_URL      = '';
const SUPABASE_ANON_KEY = '';

const STORAGE_KEY = 'indrive_trips_v1';
const DAYS_SHORT  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Apply Chart.js global dark defaults
Chart.defaults.font.family        = "'Inter', system-ui, sans-serif";
Chart.defaults.animation.duration = 650;
Chart.defaults.color              = '#64748B';

// Registry to hold live chart instances (prevents memory leaks)
const chartInstances = { weekly: null, expense: null, vehicle: null };
let   reportChartInstance = null;

let supabaseClient = null;
let cacheTrips     = [];


/* =============================================================
   SUPABASE CONNECTION MANAGEMENT
   ============================================================= */

function getSupabaseCredentials() {
    const url = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.includes('YOUR_SUPABASE'))
        ? SUPABASE_URL
        : (localStorage.getItem('supabase_url') || '');
    const key = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE'))
        ? SUPABASE_ANON_KEY
        : (localStorage.getItem('supabase_anon_key') || '');
    return { url: url.trim(), key: key.trim() };
}

function initSupabaseClient() {
    const { url, key } = getSupabaseCredentials();
    if (url && key && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(url, key);
            updateCloudStatusUI(true);
            return true;
        } catch (e) {
            console.error('[Supabase] Init error:', e);
            supabaseClient = null;
            updateCloudStatusUI(false);
        }
    } else {
        updateCloudStatusUI(false);
    }
    return false;
}

function updateCloudStatusUI(connected) {
    const icon = document.getElementById('cloud-status-icon');
    const text = document.getElementById('cloud-status-text');
    const btn  = document.getElementById('btn-cloud-status');
    if (!icon || !text || !btn) return;

    if (connected) {
        icon.textContent = '☁️';
        text.textContent = 'Cloud Synced';
        btn.style.borderColor = 'rgba(16,185,129,0.35)';
        btn.style.color       = '#10B981';
        btn.style.background  = 'rgba(16,185,129,0.1)';
    } else {
        icon.textContent = '💾';
        text.textContent = 'Local Storage';
        btn.style.borderColor = 'rgba(99,102,241,0.22)';
        btn.style.color       = '#A5B4FC';
        btn.style.background  = 'rgba(99,102,241,0.1)';
    }
}


/* =============================================================
   DATA LAYER — LocalStorage + Supabase Hybrid Sync
   ============================================================= */
const DB = {

    /** Initialize data layer: loads local cache first, then syncs with Supabase asynchronously */
    async init() {
        // Read local storage cache first
        try {
            cacheTrips = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            cacheTrips = [];
        }

        // Render local cache immediately so screen is fast
        refresh();

        // Try initializing Supabase
        if (initSupabaseClient()) {
            try {
                const { data, error } = await supabaseClient
                    .from('trips')
                    .select('*')
                    .order('date', { ascending: false });

                if (!error && Array.isArray(data)) {
                    if (data.length === 0 && cacheTrips.length > 0) {
                        // Auto-migrate local trips to Supabase if Supabase table is empty
                        const dbTrips = cacheTrips.map(t => ({
                            id         : t.id,
                            date       : t.date,
                            fare       : t.fare || 0,
                            fuel       : t.fuel || 0,
                            maintenance: t.maintenance || 0,
                            other      : t.other || 0,
                            vehicle    : t.vehicle,
                            notes      : t.notes || '',
                            created_at : t.createdAt || new Date().toISOString()
                        }));
                        const { error: insertErr } = await supabaseClient.from('trips').insert(dbTrips);
                        if (!insertErr) {
                            showToast('☁️ Uploaded local trips to Supabase cloud!', 'success');
                        }
                    } else if (data.length > 0) {
                        // Map Supabase rows to app format
                        cacheTrips = data.map(r => ({
                            id         : r.id,
                            date       : r.date,
                            fare       : parseFloat(r.fare) || 0,
                            fuel       : parseFloat(r.fuel) || 0,
                            maintenance: parseFloat(r.maintenance) || 0,
                            other      : parseFloat(r.other) || 0,
                            vehicle    : r.vehicle,
                            notes      : r.notes || '',
                            createdAt  : r.created_at || new Date().toISOString()
                        }));
                        // Update local cache
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheTrips));
                        refresh();
                    }
                } else if (error) {
                    console.error('[Supabase] Fetch error:', error);
                }
            } catch (e) {
                console.error('[Supabase] Sync failed:', e);
            }
        }
    },

    getAll() {
        return cacheTrips;
    },

    saveLocal(trips) {
        cacheTrips = trips;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
        } catch (e) {}
    },

    async add(data) {
        const trip = {
            id          : 'trip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            date        : data.date,
            fare        : parseFloat(data.fare)        || 0,
            fuel        : parseFloat(data.fuel)        || 0,
            maintenance : parseFloat(data.maintenance) || 0,
            other       : parseFloat(data.other)       || 0,
            vehicle     : data.vehicle,
            notes       : (data.notes || '').trim(),
            createdAt   : new Date().toISOString()
        };
        cacheTrips.unshift(trip);
        DB.saveLocal(cacheTrips);

        if (supabaseClient) {
            try {
                const { error } = await supabaseClient.from('trips').insert([{
                    id         : trip.id,
                    date       : trip.date,
                    fare       : trip.fare,
                    fuel       : trip.fuel,
                    maintenance: trip.maintenance,
                    other      : trip.other,
                    vehicle    : trip.vehicle,
                    notes      : trip.notes,
                    created_at : trip.createdAt
                }]);
                if (error) {
                    console.error('[Supabase] Add error full details:', error);
                    let msg = error.message || 'Unknown database error';
                    if (msg.includes('row-level security') || error.code === '42501') {
                        msg = 'RLS policy blocking write. Run "alter table trips disable row level security;" in Supabase SQL Editor!';
                    } else if (msg.includes('relation "trips" does not exist') || error.code === '42P01') {
                        msg = 'Table "trips" missing! Run the SQL setup script in Supabase.';
                    }
                    showToast('⚠️ Saved locally. Supabase error: ' + msg, 'error');
                } else {
                    showToast('☁️ Saved to Supabase Cloud!', 'success');
                }
            } catch (e) {
                console.error('[Supabase] Add exception:', e);
                showToast('⚠️ Saved locally (Supabase exception)', 'error');
            }
        } else {
            showToast('✅ Trip logged successfully (Local)', 'success');
        }

        return trip;
    },

    async remove(id) {
        cacheTrips = cacheTrips.filter(t => t.id !== id);
        DB.saveLocal(cacheTrips);

        if (supabaseClient) {
            try {
                const { error } = await supabaseClient.from('trips').delete().eq('id', id);
                if (error) {
                    console.error('[Supabase] Delete error:', error);
                } else {
                    showToast('☁️ Deleted from Supabase!', 'info');
                }
            } catch (e) {
                console.error('[Supabase] Delete failed:', e);
            }
        } else {
            showToast('Trip deleted.', 'info');
        }
    }
};


/* =============================================================
   DATE UTILITIES
   ============================================================= */

/**
 * Convert a Date object → "YYYY-MM-DD" string (local time)
 * @param {Date} date
 * @returns {string}
 */
function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Parse "YYYY-MM-DD" as a LOCAL Date (avoids UTC shift issues)
 * @param {string} ymd
 * @returns {Date}
 */
function parseLocalDate(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Returns start (Monday 00:00) and end (Sunday 23:59:59) of the current ISO week.
 * @returns {{ start: Date, end: Date }}
 */
function getWeekRange() {
    const now  = new Date();
    const dow  = now.getDay();             // 0 = Sunday … 6 = Saturday
    const diff = (dow === 0) ? -6 : 1 - dow;   // steps back to Monday

    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { start: monday, end: sunday };
}

/**
 * Returns an array of 7 Date objects: [Monday, Tuesday, … Sunday]
 * for the current week.
 */
function getWeekDates() {
    const { start } = getWeekRange();
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
    });
}

/**
 * Returns trips that fall within the current Mon–Sun week.
 * @returns {Array}
 */
function getWeekTrips() {
    const { start, end } = getWeekRange();
    return DB.getAll().filter(t => {
        const d = parseLocalDate(t.date);
        return d >= start && d <= end;
    });
}

/**
 * Returns how many days remain in the current week INCLUDING today
 * (Mon = 7, Tue = 6, … Sat = 2, Sun = 1).
 * @returns {number}
 */
function remainingDaysInWeek() {
    const dow = new Date().getDay(); // 0 = Sunday
    return (dow === 0) ? 1 : (8 - dow);
}

/**
 * Format a "YYYY-MM-DD" string as a readable local date.
 * @param {string} ymd
 * @returns {string}
 */
function formatDisplayDate(ymd) {
    return parseLocalDate(ymd).toLocaleDateString('en-PK', {
        day: 'numeric', month: 'short', year: 'numeric'
    });
}

/**
 * Returns the YYYY-MM-DD string of the Monday for the week containing `date`.
 * @param {Date} date
 * @returns {string}
 */
function getWeekKey(date) {
    const dow  = date.getDay();
    const diff = (dow === 0) ? -6 : 1 - dow;
    const mon  = new Date(date);
    mon.setDate(date.getDate() + diff);
    mon.setHours(0, 0, 0, 0);
    return toYMD(mon);
}

/**
 * Returns { start: Date(Mon 00:00), end: Date(Sun 23:59) } from a weekKey string.
 * @param {string} mondayYMD
 * @returns {{ start: Date, end: Date }}
 */
function getWeekRangeFromKey(mondayYMD) {
    const monday = parseLocalDate(mondayYMD);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
}

/**
 * Returns all trips whose date falls within [start, end].
 * @param {Date} start
 * @param {Date} end
 * @returns {Array}
 */
function getTripsInRange(start, end) {
    return DB.getAll().filter(t => {
        const d = parseLocalDate(t.date);
        return d >= start && d <= end;
    });
}


/* =============================================================
   CHRONOLOGICAL LOSS CARRIED-FORWARD ENGINE
   ============================================================= */

/**
 * Calculates rolling chronological summaries for all weeks up to the current week.
 * Automatically carries forward any net loss from week N to week N+1 as `carriedLossIn`.
 * 
 * @returns {Map<string, { key:string, start:Date, end:Date, trips:Array, fares:number, fuel:number, maintenance:number, other:number, rawExpenses:number, carriedLossIn:number, totalExpenses:number, rawNet:number, net:number, carriedLossOut:number }>}
 */
function calcChronologicalWeeks() {
    const allTrips = DB.getAll();
    const currKey  = getWeekKey(new Date());
    const weekMap  = {};

    // Ensure current week is always present in key list
    weekMap[currKey] = [];

    // Group trips by week key
    allTrips.forEach(t => {
        const key = getWeekKey(parseLocalDate(t.date));
        if (!weekMap[key]) weekMap[key] = [];
        weekMap[key].push(t);
    });

    // Sort keys ascending (oldest Monday to newest Monday)
    const sortedKeys = Object.keys(weekMap).sort((a, b) => a.localeCompare(b));

    const result = new Map();
    let prevCarriedLoss = 0;

    sortedKeys.forEach(key => {
        const trips          = weekMap[key];
        const { start, end } = getWeekRangeFromKey(key);
        const fares          = trips.reduce((s, t) => s + (t.fare        || 0), 0);
        const fuel           = trips.reduce((s, t) => s + (t.fuel        || 0), 0);
        const maintenance    = trips.reduce((s, t) => s + (t.maintenance || 0), 0);
        const other          = trips.reduce((s, t) => s + (t.other       || 0), 0);
        const rawExpenses    = fuel + maintenance + other;

        const carriedLossIn  = prevCarriedLoss;
        const totalExpenses  = rawExpenses + carriedLossIn;
        const rawNet         = fares - rawExpenses;
        const net            = fares - totalExpenses;
        const carriedLossOut = net < 0 ? Math.abs(net) : 0;

        prevCarriedLoss = carriedLossOut;

        result.set(key, {
            key, start, end, trips,
            fares, fuel, maintenance, other,
            rawExpenses, carriedLossIn, totalExpenses, expenses: totalExpenses,
            rawNet, net, carriedLossOut
        });
    });

    return result;
}

/**
 * Gets the current week's chronological summary (including any carried-over loss).
 */
function getCurrentWeekSummary() {
    const map     = calcChronologicalWeeks();
    const currKey = getWeekKey(new Date());
    return map.get(currKey) || {
        key: currKey, ...getWeekRangeFromKey(currKey), trips: [],
        fares: 0, fuel: 0, maintenance: 0, other: 0,
        rawExpenses: 0, carriedLossIn: 0, totalExpenses: 0, expenses: 0,
        rawNet: 0, net: 0, carriedLossOut: 0
    };
}


/* =============================================================
   CALCULATIONS
   ============================================================= */

/**
 * Calculates net for a single trip.
 * @param {object} t - Trip record
 * @returns {number}
 */
function calcTripNet(t) {
    return (t.fare || 0)
         - (t.fuel || 0)
         - (t.maintenance || 0)
         - (t.other || 0);
}

/**
 * Aggregates raw totals from an array of trips.
 * @param {Array} trips
 * @returns {{ fares, fuel, maintenance, other, expenses, net }}
 */
function calcWeekSummary(trips) {
    const fares       = trips.reduce((s, t) => s + (t.fare        || 0), 0);
    const fuel        = trips.reduce((s, t) => s + (t.fuel        || 0), 0);
    const maintenance = trips.reduce((s, t) => s + (t.maintenance || 0), 0);
    const other       = trips.reduce((s, t) => s + (t.other       || 0), 0);
    const expenses    = fuel + maintenance + other;
    return { fares, fuel, maintenance, other, expenses, net: fares - expenses, rawExpenses: expenses, carriedLossIn: 0, totalExpenses: expenses };
}


/* =============================================================
   FORMATTING HELPERS
   ============================================================= */

/**
 * Format a number as "PKR X,XXX" (absolute value, always positive display).
 * @param {number} n
 * @returns {string}
 */
function pkr(n) {
    return 'PKR ' + Math.round(Math.abs(n)).toLocaleString('en-PK');
}

/** Escape HTML special chars to prevent XSS in innerHTML */
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}


/* =============================================================
   TOAST NOTIFICATIONS
   ============================================================= */
let _toastTimer = null;

/**
 * Show a toast notification.
 * @param {string} msg   - Message text
 * @param {'success'|'error'|'info'} type
 */
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    if (_toastTimer) clearTimeout(_toastTimer);
    el.textContent = msg;
    el.className   = 'visible ' + type;
    _toastTimer = setTimeout(() => { el.className = ''; }, 3400);
}


/* =============================================================
   UI: HEADER
   ============================================================= */
function renderHeader() {
    const { start, end } = getWeekRange();
    const fmt = { day: 'numeric', month: 'short' };

    document.getElementById('header-week').textContent =
        `Week: ${start.toLocaleDateString('en-PK', fmt)} \u2013 ${end.toLocaleDateString('en-PK', fmt)}`;

    document.getElementById('header-date').textContent =
        new Date().toLocaleDateString('en-PK', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
}


/* =============================================================
   UI: STAT CARDS + WEEK STATUS CARD
   ============================================================= */

/**
 * Update all 4 stat cards, the expense breakdown mini-list,
 * the week status card, and the week progress bar.
 *
 * @param {{ fares, fuel, maintenance, other, rawExpenses, carriedLossIn, totalExpenses, expenses, net }} summary
 * @param {Array} weekTrips
 */
function renderStats(summary, weekTrips) {

    // ── Basic stat values ──────────────────────────────────────
    document.getElementById('stat-fares').textContent    = pkr(summary.fares);
    document.getElementById('stat-expenses').textContent = pkr(summary.totalExpenses);
    
    // Subtext for total expenses
    const expSub = document.getElementById('stat-expenses-sub');
    if (expSub) {
        expSub.textContent = summary.carriedLossIn > 0
            ? `Includes ${pkr(summary.carriedLossIn)} loss from last week`
            : 'Fuel + Maintenance + Other';
    }

    document.getElementById('bd-fuel').textContent        = pkr(summary.fuel);
    document.getElementById('bd-maintenance').textContent = pkr(summary.maintenance);
    document.getElementById('bd-other').textContent       = pkr(summary.other);

    // Carried loss row in Expense Split
    const carriedRow = document.getElementById('bd-carried-row');
    const carriedEl  = document.getElementById('bd-carried');
    if (carriedRow && carriedEl) {
        if (summary.carriedLossIn > 0) {
            carriedRow.style.display = 'flex';
            carriedEl.textContent    = pkr(summary.carriedLossIn);
        } else {
            carriedRow.style.display = 'none';
        }
    }

    // ── Week progress bar ──────────────────────────────────────
    const { start } = getWeekRange();
    const todayNorm  = new Date();
    todayNorm.setHours(0, 0, 0, 0);
    const daysPassed = Math.min(Math.floor((todayNorm - start) / 86400000) + 1, 7);
    const weekPct    = Math.min((daysPassed / 7) * 100, 100);

    document.getElementById('week-prog-text').textContent =
        `Day ${daysPassed} of 7 \u00B7 ${weekTrips.length} trip${weekTrips.length !== 1 ? 's' : ''} logged this week`;

    // ── Net card + status card ─────────────────────────────────
    const netEl   = document.getElementById('stat-net');
    const netCard = document.getElementById('card-net');
    const wsc     = document.getElementById('week-status-card');

    if (summary.net < 0) {
        /* ══ DEFICIT MODE ══════════════════════════════════════ */
        const deficit   = Math.abs(summary.net);
        const daysLeft  = remainingDaysInWeek();
        const breakEven = deficit / daysLeft;

        // Net stat card
        netEl.textContent         = '\u2212' + pkr(summary.net);
        netEl.style.color         = '#EF4444';
        netCard.style.borderColor = 'rgba(239,68,68,0.35)';

        // 4th stat card → Break-Even Target
        document.getElementById('card-target-label').textContent = 'Break-Even / Day';
        document.getElementById('card-target-icon').textContent  = '🎯';
        document.getElementById('stat-target').textContent       = pkr(breakEven) + '/day';
        document.getElementById('stat-target').style.color       = '#EF4444';
        document.getElementById('card-target').style.borderColor = 'rgba(239,68,68,0.3)';
        document.getElementById('stat-target-sub').textContent   =
            `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left — earn this daily to recover`;

        // Week status card
        wsc.style.background  = 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(239,68,68,0.04) 100%)';
        wsc.style.borderColor = 'rgba(239,68,68,0.42)';
        wsc.classList.add('pulse-danger');

        document.getElementById('wsc-label').style.color  = '#EF4444';
        document.getElementById('wsc-label').textContent  = summary.carriedLossIn > 0 ? '⚠️ Deficit (Loss Carried Over)' : '⚠️ Weekly Deficit';
        document.getElementById('wsc-amount').style.color = '#EF4444';
        document.getElementById('wsc-amount').textContent = '\u2212' + pkr(summary.net);

        const carriedNote = summary.carriedLossIn > 0 ? ` (Includes ${pkr(summary.carriedLossIn)} loss from last week)` : '';
        document.getElementById('wsc-message').textContent =
            `You need ${pkr(breakEven)}/day over the next ${daysLeft} day${daysLeft !== 1 ? 's' : ''} to break even this week${carriedNote}.`;

        // Progress bar → red
        document.getElementById('week-prog-fill').style.background =
            'linear-gradient(90deg, #EF4444, #F87171)';

    } else {
        /* ══ PROFIT / BREAK-EVEN MODE ══════════════════════════ */

        // Net stat card
        const prefix          = summary.net === 0 ? '' : '+';
        netEl.textContent     = prefix + pkr(summary.net);
        netEl.style.color     = summary.net === 0 ? '#F59E0B' : '#10B981';
        netCard.style.borderColor = summary.net === 0
            ? 'rgba(245,158,11,0.3)'
            : 'rgba(16,185,129,0.3)';

        // 4th stat card → Average Daily Fare
        const avgDaily = summary.fares / Math.max(daysPassed, 1);
        document.getElementById('card-target-label').textContent = 'Avg. Daily Fare';
        document.getElementById('card-target-icon').textContent  = '📅';
        document.getElementById('stat-target').textContent       =
            weekTrips.length > 0 ? pkr(avgDaily) + '/day' : '—';
        document.getElementById('stat-target').style.color       = '#F59E0B';
        document.getElementById('card-target').style.borderColor = 'rgba(245,158,11,0.25)';
        document.getElementById('stat-target-sub').textContent   =
            weekTrips.length > 0
                ? `Average over ${daysPassed} active day${daysPassed !== 1 ? 's' : ''}`
                : 'No trips yet';

        // Week status card
        wsc.style.background  = 'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0.03) 100%)';
        wsc.style.borderColor = 'rgba(16,185,129,0.35)';
        wsc.classList.remove('pulse-danger');

        document.getElementById('wsc-label').style.color  = '#10B981';
        document.getElementById('wsc-label').textContent  =
            summary.net === 0 ? '\u2696\uFE0F Break-Even' : '\u2705 Weekly Profit';
        document.getElementById('wsc-amount').style.color = summary.net === 0 ? '#F59E0B' : '#10B981';
        document.getElementById('wsc-amount').textContent =
            summary.net === 0 ? pkr(0) : '+' + pkr(summary.net);

        if (summary.fares === 0 && summary.totalExpenses === 0) {
            document.getElementById('wsc-message').textContent = 'Add your first trip to see your weekly profit status.';
        } else if (summary.carriedLossIn > 0 && summary.net > 0) {
            document.getElementById('wsc-message').textContent =
                `Great work! You cleared ${pkr(summary.carriedLossIn)} carried loss from last week and are ${pkr(summary.net)} ahead!`;
        } else if (summary.net === 0) {
            document.getElementById('wsc-message').textContent =
                'Exactly at break-even — every PKR from here is pure profit!';
        } else {
            document.getElementById('wsc-message').textContent =
                `Great work! You are ${pkr(summary.net)} ahead this week. Keep it up!`;
        }

        // Progress bar → green
        document.getElementById('week-prog-fill').style.background =
            'linear-gradient(90deg, #10B981, #6EE7B7)';
    }

    // Apply progress bar width (shared between both branches)
    document.getElementById('week-prog-fill').style.width = weekPct + '%';
}


/* =============================================================
   CHART HELPERS
   ============================================================= */

/** Destroy a chart instance safely and clear its registry slot */
function destroyChart(key) {
    if (chartInstances[key]) {
        chartInstances[key].destroy();
        chartInstances[key] = null;
    }
}

/**
 * Returns a shared Chart.js `scales` config for the dark theme.
 * @param {Function} [yTickCb] - Optional Y-axis tick formatter
 */
function darkScales(yTickCb) {
    return {
        x: {
            grid  : { color: 'rgba(255,255,255,0.04)' },
            ticks : { color: '#64748B', font: { size: 11 } },
            border: { color: 'rgba(255,255,255,0.07)' }
        },
        y: {
            beginAtZero: true,
            grid  : { color: 'rgba(255,255,255,0.04)' },
            ticks : {
                color   : '#64748B',
                font    : { size: 10 },
                callback: yTickCb || (v => 'PKR ' + v.toLocaleString())
            },
            border: { color: 'rgba(255,255,255,0.07)' }
        }
    };
}

/**
 * Returns a shared Chart.js `tooltip` config for the dark theme.
 * @param {Function} labelCallback - The `label` callback for the tooltip
 */
function darkTooltip(labelCallback) {
    return {
        backgroundColor: 'rgba(8,12,24,0.95)',
        borderColor    : 'rgba(99,102,241,0.3)',
        borderWidth    : 1,
        titleColor     : '#F1F5F9',
        bodyColor      : '#94A3B8',
        padding        : 10,
        cornerRadius   : 9,
        callbacks      : { label: labelCallback }
    };
}


/* =============================================================
   CHART 1: Weekly Trend — Grouped Bar (Fares vs Expenses per day)
   ============================================================= */
function buildWeeklyChart(weekTrips) {
    destroyChart('weekly');

    const weekDates = getWeekDates();
    const todayYMD  = toYMD(new Date());
    const faresArr  = Array(7).fill(0);
    const expArr    = Array(7).fill(0);

    weekTrips.forEach(t => {
        const idx = weekDates.findIndex(d => toYMD(d) === t.date);
        if (idx < 0) return;
        faresArr[idx] += (t.fare || 0);
        expArr[idx]   += (t.fuel || 0) + (t.maintenance || 0) + (t.other || 0);
    });

    const labels = weekDates.map((d, i) => {
        const ymd = toYMD(d);
        return ymd === todayYMD ? DAYS_SHORT[i] + ' \u2605' : DAYS_SHORT[i];
    });

    const ctx = document.getElementById('chart-weekly').getContext('2d');

    chartInstances.weekly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label          : 'Fares',
                    data           : faresArr,
                    backgroundColor: 'rgba(16,185,129,0.65)',
                    borderColor    : '#10B981',
                    borderWidth    : 1.5,
                    borderRadius   : 5,
                    borderSkipped  : false
                },
                {
                    label          : 'Expenses',
                    data           : expArr,
                    backgroundColor: 'rgba(239,68,68,0.55)',
                    borderColor    : '#EF4444',
                    borderWidth    : 1.5,
                    borderRadius   : 5,
                    borderSkipped  : false
                }
            ]
        },
        options: {
            responsive         : true,
            maintainAspectRatio: false,
            plugins: {
                legend : {
                    labels: {
                        color    : '#94A3B8',
                        font     : { size: 11 },
                        padding  : 14,
                        boxWidth : 12,
                        boxHeight: 12
                    }
                },
                tooltip: darkTooltip(item => ` ${item.dataset.label}: PKR ${item.raw.toLocaleString()}`)
            },
            scales: darkScales()
        }
    });
}


/* =============================================================
   CHART 2: Expense Breakdown — Doughnut
   ============================================================= */
function buildExpenseChart(summary) {
    destroyChart('expense');

    const rawTotal = summary.fuel + summary.maintenance + summary.other;
    const hasData  = rawTotal > 0;
    const ctx      = document.getElementById('chart-expense').getContext('2d');

    chartInstances.expense = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels  : ['⛽ Fuel', '🔧 Maintenance', '🛣️ Other'],
            datasets: [{
                data           : hasData
                    ? [summary.fuel, summary.maintenance, summary.other]
                    : [1, 1, 1],
                backgroundColor: hasData
                    ? ['rgba(245,158,11,0.82)', 'rgba(239,68,68,0.82)', 'rgba(139,92,246,0.82)']
                    : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.06)'],
                borderColor    : hasData
                    ? ['#F59E0B', '#EF4444', '#8B5CF6']
                    : ['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.09)', 'rgba(255,255,255,0.09)'],
                borderWidth    : 2,
                hoverOffset    : 8
            }]
        },
        options: {
            responsive         : true,
            maintainAspectRatio: false,
            cutout             : '62%',
            plugins: {
                legend : {
                    position: 'bottom',
                    labels  : {
                        color    : '#94A3B8',
                        font     : { size: 11 },
                        padding  : 10,
                        boxWidth : 10,
                        boxHeight: 10
                    }
                },
                tooltip: darkTooltip(item => {
                    if (!hasData) return ' No expense data yet';
                    const total = item.dataset.data.reduce((a, b) => a + b, 0);
                    const pct   = total > 0 ? ((item.raw / total) * 100).toFixed(1) : 0;
                    return ` PKR ${item.raw.toLocaleString()} (${pct}%)`;
                })
            }
        }
    });
}


/* =============================================================
   CHART 3: Vehicle Comparison — Bar (Fares + Net per vehicle)
   ============================================================= */
function buildVehicleChart(weekTrips) {
    destroyChart('vehicle');

    const miraTrips  = weekTrips.filter(t => t.vehicle === 'Daihatsu Mira');
    const civicTrips = weekTrips.filter(t => t.vehicle === 'Honda Civic');

    const miraFares  = miraTrips.reduce( (s, t) => s + (t.fare || 0), 0);
    const civicFares = civicTrips.reduce((s, t) => s + (t.fare || 0), 0);
    const miraExp    = miraTrips.reduce( (s, t) => s + (t.fuel || 0) + (t.maintenance || 0) + (t.other || 0), 0);
    const civicExp   = civicTrips.reduce((s, t) => s + (t.fuel || 0) + (t.maintenance || 0) + (t.other || 0), 0);
    const miraNet    = miraFares  - miraExp;
    const civicNet   = civicFares - civicExp;

    const ctx = document.getElementById('chart-vehicle').getContext('2d');

    chartInstances.vehicle = new Chart(ctx, {
        type: 'bar',
        data: {
            labels  : ['\uD83D\uDE97 Mira', '\uD83D\uDE98 Civic'],
            datasets: [
                {
                    label          : 'Fares Earned',
                    data           : [miraFares, civicFares],
                    backgroundColor: ['rgba(59,130,246,0.70)', 'rgba(139,92,246,0.70)'],
                    borderColor    : ['#3B82F6', '#8B5CF6'],
                    borderWidth    : 1.5,
                    borderRadius   : 6,
                    borderSkipped  : false
                },
                {
                    label          : 'Net Profit',
                    data           : [miraNet, civicNet],
                    backgroundColor: [
                        miraNet  >= 0 ? 'rgba(16,185,129,0.55)' : 'rgba(239,68,68,0.55)',
                        civicNet >= 0 ? 'rgba(16,185,129,0.55)' : 'rgba(239,68,68,0.55)'
                    ],
                    borderColor    : [
                        miraNet  >= 0 ? '#10B981' : '#EF4444',
                        civicNet >= 0 ? '#10B981' : '#EF4444'
                    ],
                    borderWidth  : 1.5,
                    borderRadius : 6,
                    borderSkipped: false
                }
            ]
        },
        options: {
            responsive         : true,
            maintainAspectRatio: false,
            plugins: {
                legend : {
                    labels: {
                        color    : '#94A3B8',
                        font     : { size: 11 },
                        padding  : 12,
                        boxWidth : 12,
                        boxHeight: 12
                    }
                },
                tooltip: darkTooltip(item => ` ${item.dataset.label}: PKR ${item.raw.toLocaleString()}`)
            },
            scales: darkScales()
        }
    });
}


/**
 * Re-renders all three main charts from fresh data.
 * @param {Array}  weekTrips - Trips in the current week
 * @param {object} summary   - Aggregated week summary
 */
function updateCharts(weekTrips, summary) {
    buildWeeklyChart(weekTrips);
    buildExpenseChart(summary);
    buildVehicleChart(weekTrips);
}


/* =============================================================
   TRIP HISTORY TABLE
   ============================================================= */
function renderTable() {
    const trips = DB.getAll();
    const tbody = document.getElementById('trips-tbody');

    // Update badge count
    document.getElementById('trip-count-badge').textContent =
        `${trips.length} trip${trips.length !== 1 ? 's' : ''}`;

    // Empty state
    if (trips.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9"
                    style="text-align:center; padding:52px 24px; color:#334155;">
                    <div style="font-size:38px; margin-bottom:12px;">&#128663;</div>
                    <div style="font-size:15px; color:#475569; font-weight:500;">No trips logged yet</div>
                    <div style="font-size:13px; color:#334155; margin-top:6px;">
                        Use the form above to record your first trip.
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = trips.map(t => {
        const net        = calcTripNet(t);
        const netDisplay = (net >= 0 ? '+' : '\u2212') + 'PKR ' + Math.round(Math.abs(net)).toLocaleString();
        const netColor   = net >= 0 ? '#10B981' : '#EF4444';
        const badgeCls   = t.vehicle === 'Daihatsu Mira' ? 'badge-mira' : 'badge-civic';
        const vIcon      = t.vehicle === 'Daihatsu Mira' ? '&#128663;' : '&#128664;';

        // Helper: format optional PKR field; show dash if 0
        const optPKR = (val, color) => val
            ? `<span style="color:${color};">PKR ${val.toLocaleString()}</span>`
            : `<span style="color:#2d3f56;">—</span>`;

        const notesHtml = t.notes
            ? `<span title="${escHtml(t.notes)}"
                    style="max-width:130px; display:inline-block; overflow:hidden;
                           text-overflow:ellipsis; white-space:nowrap; vertical-align:middle; color:#64748B;">
                ${escHtml(t.notes)}</span>`
            : `<span style="color:#2d3f56;">—</span>`;

        return `
        <tr>
            <td style="color:#94A3B8; white-space:nowrap;">${formatDisplayDate(t.date)}</td>
            <td>
                <span class="badge ${badgeCls}">
                    ${vIcon} ${escHtml(t.vehicle)}
                </span>
            </td>
            <td style="font-weight:700; color:#10B981; white-space:nowrap;">
                PKR ${(t.fare || 0).toLocaleString()}
            </td>
            <td>${optPKR(t.fuel,        '#F59E0B')}</td>
            <td>${optPKR(t.maintenance, '#EF4444')}</td>
            <td>${optPKR(t.other,       '#A78BFA')}</td>
            <td style="font-weight:700; color:${netColor}; white-space:nowrap;">${netDisplay}</td>
            <td>${notesHtml}</td>
            <td>
                <button class="btn-delete"
                        onclick="handleDelete('${escHtml(t.id)}')"
                        aria-label="Delete trip on ${escHtml(t.date)}">
                    &#128465; Delete
                </button>
            </td>
        </tr>`;
    }).join('');
}


/* =============================================================
   PAST WEEKS — Collapsible History Bars
   ============================================================= */

/**
 * Builds the inner expanded HTML for a past week:
 * summary stat grid + full trip table.
 * @param {object} week - Chronological week summary object
 * @returns {string} HTML string
 */
function buildWeekDetailHTML(week) {
    const summary     = week;
    const netColor    = summary.net >= 0 ? '#10B981' : '#EF4444';
    const netSign     = summary.net >= 0 ? '+' : '−';
    const sortedTrips = [...summary.trips].sort((a, b) => a.date.localeCompare(b.date));

    const optPKR = (val, color) => val
        ? `<span style="color:${color};">PKR ${val.toLocaleString()}</span>`
        : `<span style="color:#2d3f56;">—</span>`;

    return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;">
        <div class="report-stat">
            <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">💰 Total Earned</div>
            <div style="font-size:18px;font-weight:800;color:#10B981;">${pkr(summary.fares)}</div>
        </div>
        <div class="report-stat">
            <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">📤 Direct Expenses</div>
            <div style="font-size:18px;font-weight:800;color:#EF4444;">${pkr(summary.rawExpenses)}</div>
        </div>
        ${summary.carriedLossIn > 0 ? `
        <div class="report-stat" style="border-color:rgba(239,68,68,0.3);">
            <div style="font-size:10px;color:#F87171;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">🔻 Carried Loss In</div>
            <div style="font-size:18px;font-weight:800;color:#EF4444;">${pkr(summary.carriedLossIn)}</div>
        </div>` : ''}
        <div class="report-stat">
            <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">⛽ Fuel</div>
            <div style="font-size:18px;font-weight:800;color:#F59E0B;">${pkr(summary.fuel)}</div>
        </div>
        <div class="report-stat">
            <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">🔧 Maintenance</div>
            <div style="font-size:18px;font-weight:800;color:#EF4444;">${pkr(summary.maintenance)}</div>
        </div>
        <div class="report-stat" style="border-color:${summary.net >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'};">
            <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">📈 Final Net</div>
            <div style="font-size:18px;font-weight:800;color:${netColor};">${netSign}${pkr(summary.net)}</div>
        </div>
    </div>
    <div style="overflow-x:auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date</th><th>Vehicle</th><th>Fare</th>
                    <th>Fuel</th><th>Maint.</th><th>Other</th>
                    <th>Net Trip</th><th>Notes</th>
                </tr>
            </thead>
            <tbody>
                ${sortedTrips.map(t => {
                    const net    = calcTripNet(t);
                    const nCol   = net >= 0 ? '#10B981' : '#EF4444';
                    const bdgCls = t.vehicle === 'Daihatsu Mira' ? 'badge-mira' : 'badge-civic';
                    const vIcon  = t.vehicle === 'Daihatsu Mira' ? '🚗' : '🚘';
                    return `<tr>
                        <td style="color:#94A3B8;white-space:nowrap;">${formatDisplayDate(t.date)}</td>
                        <td><span class="badge ${bdgCls}">${vIcon} ${escHtml(t.vehicle)}</span></td>
                        <td style="font-weight:700;color:#10B981;">PKR ${(t.fare || 0).toLocaleString()}</td>
                        <td>${optPKR(t.fuel,        '#F59E0B')}</td>
                        <td>${optPKR(t.maintenance, '#EF4444')}</td>
                        <td>${optPKR(t.other,       '#A78BFA')}</td>
                        <td style="font-weight:700;color:${nCol};">${net >= 0 ? '+' : '−'}PKR ${Math.round(Math.abs(net)).toLocaleString()}</td>
                        <td style="color:#64748B;max-width:120px;">${t.notes ? escHtml(t.notes) : '—'}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    </div>`;
}

/** Render all past-week collapsible bars into #past-weeks-list */
function renderPastWeeks() {
    const chronologicalMap = calcChronologicalWeeks();
    const currKey          = getWeekKey(new Date());
    const pastWeeks        = [...chronologicalMap.values()]
        .filter(w => w.key !== currKey && w.trips.length > 0)
        .sort((a, b) => b.key.localeCompare(a.key));

    const section   = document.getElementById('past-weeks-section');
    const list      = document.getElementById('past-weeks-list');

    if (pastWeeks.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

    const fmt = { day: 'numeric', month: 'short' };

    list.innerHTML = pastWeeks.map(week => {
        const summary  = week;
        const netColor = summary.net > 0 ? '#10B981' : summary.net < 0 ? '#EF4444' : '#F59E0B';
        const netSign  = summary.net > 0 ? '+' : summary.net < 0 ? '−' : '';
        const netLabel = summary.net > 0 ? '✅ Profit' : summary.net < 0 ? '⚠️ Net Loss' : '⚖️ Break-Even';
        const label    = `${week.start.toLocaleDateString('en-PK', fmt)} – ${week.end.toLocaleDateString('en-PK', fmt)}`;

        const lossTransferBadge = summary.carriedLossOut > 0
            ? `<div style="font-size:10px;color:#EF4444;background:rgba(239,68,68,0.12);padding:2px 8px;border-radius:10px;border:1px solid rgba(239,68,68,0.25);margin-top:2px;">Transferred ${pkr(summary.carriedLossOut)} Loss to Next Week</div>`
            : summary.carriedLossIn > 0 && summary.net >= 0
                ? `<div style="font-size:10px;color:#10B981;background:rgba(16,185,129,0.12);padding:2px 8px;border-radius:10px;border:1px solid rgba(16,185,129,0.25);margin-top:2px;">Cleared ${pkr(summary.carriedLossIn)} Past Loss</div>`
                : '';

        return `
        <div class="week-bar" id="wb-${week.key}">
            <div class="week-bar-header" onclick="toggleWeekDetails('${week.key}')">
                <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="font-size:13px;font-weight:700;color:#A5B4FC;white-space:nowrap;">📅 ${label}</div>
                        <div style="font-size:11px;color:#475569;white-space:nowrap;">${week.trips.length} trip${week.trips.length !== 1 ? 's' : ''}</div>
                    </div>
                    ${lossTransferBadge}
                </div>
                <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
                    <div style="text-align:center;">
                        <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:2px;">Earned</div>
                        <div style="font-size:14px;font-weight:700;color:#10B981;">${pkr(summary.fares)}</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:2px;">Total Expenses</div>
                        <div style="font-size:14px;font-weight:700;color:#EF4444;">${pkr(summary.totalExpenses)}</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:2px;">${netLabel}</div>
                        <div style="font-size:14px;font-weight:700;color:${netColor};">${netSign}${pkr(summary.net)}</div>
                    </div>
                    <div id="wb-chevron-${week.key}"
                         style="color:#475569;transition:transform 0.3s ease;font-size:14px;flex-shrink:0;">▼</div>
                </div>
            </div>
            <div class="week-bar-details" id="wbd-${week.key}">
                <div style="padding:0 20px 20px;">
                    <div style="height:1px;background:rgba(99,102,241,0.1);margin-bottom:20px;"></div>
                    ${buildWeekDetailHTML(week)}
                </div>
            </div>
        </div>`;
    }).join('');
}

/** Toggle open/closed state of a past-week detail panel */
function toggleWeekDetails(weekKey) {
    const details = document.getElementById(`wbd-${weekKey}`);
    const chevron = document.getElementById(`wb-chevron-${weekKey}`);
    if (!details) return;
    const isOpen = details.classList.contains('open');
    details.classList.toggle('open', !isOpen);
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}


/* =============================================================
   WEEK-END BANNER  (auto-shows on Sundays)
   ============================================================= */

/**
 * Renders the Sunday summary banner. Only visible when today is Sunday.
 * @param {{ fares, fuel, maintenance, other, rawExpenses, carriedLossIn, totalExpenses, net, carriedLossOut }} summary
 */
function renderWeekEndBanner(summary) {
    const banner = document.getElementById('week-end-banner');
    if (new Date().getDay() !== 0) {   // 0 = Sunday
        banner.style.display = 'none';
        return;
    }
    banner.style.display = '';

    const { start, end } = getWeekRange();
    const fmt         = { day: 'numeric', month: 'short' };
    const weekLabel   = `${start.toLocaleDateString('en-PK', fmt)} – ${end.toLocaleDateString('en-PK', fmt)}`;
    const netColor    = summary.net > 0 ? '#10B981' : summary.net < 0 ? '#EF4444' : '#F59E0B';
    const bannerBg    = summary.net > 0
        ? 'linear-gradient(135deg,rgba(16,185,129,0.13) 0%,rgba(16,185,129,0.04) 100%)'
        : summary.net < 0
            ? 'linear-gradient(135deg,rgba(239,68,68,0.13) 0%,rgba(239,68,68,0.04) 100%)'
            : 'linear-gradient(135deg,rgba(245,158,11,0.13) 0%,rgba(245,158,11,0.04) 100%)';
    const bannerBorder = summary.net > 0
        ? 'rgba(16,185,129,0.38)' : summary.net < 0
        ? 'rgba(239,68,68,0.38)' : 'rgba(245,158,11,0.38)';
    const emoji      = summary.net > 0 ? '🎉' : summary.net < 0 ? '⚠️' : '⚖️';
    
    let statusText = 'Week Complete — Great Work!';
    let subNote    = '';
    if (summary.net < 0) {
        statusText = 'Week Complete — Loss Auto-Transferred to Next Week';
        subNote    = `<div style="font-size:12px;color:#EF4444;margin-top:4px;font-weight:600;">⚠️ Loss of ${pkr(summary.carriedLossOut)} will carry forward into next week's budget.</div>`;
    } else if (summary.carriedLossIn > 0) {
        statusText = 'Week Complete — Previous Loss Cleared!';
        subNote    = `<div style="font-size:12px;color:#10B981;margin-top:4px;font-weight:600;">🎉 You successfully paid off ${pkr(summary.carriedLossIn)} loss from last week!</div>`;
    }

    const netSign = summary.net > 0 ? '+' : summary.net < 0 ? '−' : '';

    banner.innerHTML = `
        <div id="week-end-banner-inner" style="background:${bannerBg};border-color:${bannerBorder};">
            <div>
                <div style="font-size:11px;color:${netColor};font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:5px;">
                    ${emoji} ${statusText}
                </div>
                <div style="font-size:15px;font-weight:800;color:#F1F5F9;margin-bottom:3px;">Sunday Wrap-Up</div>
                <div style="font-size:12px;color:#64748B;">Week of ${weekLabel}</div>
                ${subNote}
            </div>
            <div style="display:flex;align-items:center;gap:28px;flex-wrap:wrap;">
                <div style="text-align:center;">
                    <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:4px;">💰 Earnings</div>
                    <div style="font-size:22px;font-weight:900;color:#10B981;letter-spacing:-0.02em;">${pkr(summary.fares)}</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:4px;">📤 Total Burden</div>
                    <div style="font-size:22px;font-weight:900;color:#EF4444;letter-spacing:-0.02em;">${pkr(summary.totalExpenses)}</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:4px;">📈 Net ${summary.net >= 0 ? 'Profit' : 'Loss'}</div>
                    <div style="font-size:22px;font-weight:900;color:${netColor};letter-spacing:-0.02em;">${netSign}${pkr(summary.net)}</div>
                </div>
            </div>
        </div>`;
}


/* =============================================================
   REPORTS — Tab UI + Generation
   ============================================================= */

/** Populate the week dropdown with all known weeks + current week */
function populateWeekSelect() {
    const sel        = document.getElementById('rp-week-select');
    if (!sel) return;
    const chronologicalMap = calcChronologicalWeeks();
    const sortedKeys       = [...chronologicalMap.keys()].sort((a, b) => b.localeCompare(a));
    const fmt              = { day: 'numeric', month: 'short', year: 'numeric' };
    const currKey          = getWeekKey(new Date());

    sel.innerHTML = sortedKeys.map(key => {
        const w     = chronologicalMap.get(key);
        const label = `${w.start.toLocaleDateString('en-PK', fmt)} – ${w.end.toLocaleDateString('en-PK', fmt)}${key === currKey ? ' (Current)' : ''}`;
        return `<option value="${key}">${label}</option>`;
    }).join('');
}

/** Populate month names and year list */
function populateMonthYearSelects() {
    const monthSel = document.getElementById('rp-month');
    const yearSel  = document.getElementById('rp-year');
    const now      = new Date();
    const months   = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

    monthSel.innerHTML = months.map((m, i) =>
        `<option value="${i + 1}"${i === now.getMonth() ? ' selected' : ''}>${m}</option>`
    ).join('');

    const curYear = now.getFullYear();
    yearSel.innerHTML = [curYear, curYear - 1, curYear - 2]
        .map(y => `<option value="${y}">${y}</option>`).join('');
}

/** Wire up tab switching + button handlers for the report panel */
function initReportUI() {
    // Tab switching
    document.querySelectorAll('.report-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.report-panel').forEach(p => p.style.display = 'none');
            tab.classList.add('active');
            document.getElementById('rp-' + tab.dataset.tab).style.display = '';
            document.getElementById('report-output').style.display = 'none';
        });
    });

    // Populate selects
    populateWeekSelect();
    populateMonthYearSelects();

    // Default custom range = last 7 days
    document.getElementById('rp-from').value = toYMD(new Date(Date.now() - 6 * 86400000));
    document.getElementById('rp-to').value   = toYMD(new Date());

    // Button handlers
    document.getElementById('btn-gen-report').addEventListener('click', generateWeeklyReport);
    document.getElementById('btn-gen-report-monthly').addEventListener('click', generateMonthlyReport);
    document.getElementById('btn-gen-report-custom').addEventListener('click', generateCustomReport);
}

function generateWeeklyReport() {
    const weekKey          = document.getElementById('rp-week-select').value;
    const chronologicalMap = calcChronologicalWeeks();
    const week             = chronologicalMap.get(weekKey) || { ...getWeekRangeFromKey(weekKey), trips: [], fares: 0, rawExpenses: 0, carriedLossIn: 0, totalExpenses: 0, net: 0 };
    const fmt              = { day: 'numeric', month: 'short', year: 'numeric' };
    renderReportOutput(week.trips,
        `Week: ${week.start.toLocaleDateString('en-PK', fmt)} – ${week.end.toLocaleDateString('en-PK', fmt)}`, week);
}

function generateMonthlyReport() {
    const month = parseInt(document.getElementById('rp-month').value);
    const year  = parseInt(document.getElementById('rp-year').value);
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end   = new Date(year, month, 0, 23, 59, 59, 999);
    const trips = getTripsInRange(start, end);
    const names = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];
    renderReportOutput(trips, `${names[month - 1]} ${year}`);
}

function generateCustomReport() {
    const fromVal = document.getElementById('rp-from').value;
    const toVal   = document.getElementById('rp-to').value;
    if (!fromVal || !toVal) { showToast('Please select both dates.', 'error'); return; }
    if (fromVal > toVal)    { showToast('From date must be before to date.', 'error'); return; }
    const start = parseLocalDate(fromVal); start.setHours(0, 0, 0, 0);
    const end   = parseLocalDate(toVal);   end.setHours(23, 59, 59, 999);
    const trips = getTripsInRange(start, end);
    const fmt   = { day: 'numeric', month: 'short', year: 'numeric' };
    renderReportOutput(trips,
        `${start.toLocaleDateString('en-PK', fmt)} – ${end.toLocaleDateString('en-PK', fmt)}`);
}

/**
 * Build and display the full report card for `trips` with the given `label`.
 * @param {Array}  trips
 * @param {string} label
 * @param {object} [weekContext] - Optional week chronological summary
 */
function renderReportOutput(trips, label, weekContext = null) {
    const out = document.getElementById('report-output');

    if (trips.length === 0 && (!weekContext || weekContext.carriedLossIn === 0)) {
        out.style.display = '';
        out.innerHTML = `
            <div class="report-card" style="text-align:center;padding:44px 24px;">
                <div style="font-size:38px;margin-bottom:12px;">📭</div>
                <div style="font-size:16px;color:#475569;font-weight:600;">No trips found</div>
                <div style="font-size:13px;color:#334155;margin-top:6px;">No trips were logged during this period.</div>
            </div>`;
        return;
    }

    const summary  = weekContext || calcWeekSummary(trips);
    const netColor = summary.net > 0 ? '#10B981' : summary.net < 0 ? '#EF4444' : '#F59E0B';
    const netSign  = summary.net > 0 ? '+' : summary.net < 0 ? '−' : '';

    // Group by date for per-day breakdown
    const dayMap      = {};
    trips.forEach(t => {
        if (!dayMap[t.date]) dayMap[t.date] = [];
        dayMap[t.date].push(t);
    });
    const sortedDates = Object.keys(dayMap).sort();

    const optPKR = (val, color) => val > 0
        ? `<span style="color:${color};">PKR ${val.toLocaleString()}</span>`
        : `<span style="color:#2d3f56;">—</span>`;

    out.style.display = '';
    out.innerHTML = `
        <div class="report-card fade-in">

            <!-- Report Header -->
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
                <div>
                    <div style="font-size:19px;font-weight:800;color:#F1F5F9;letter-spacing:-0.02em;">📊 ${escHtml(label)}</div>
                    <div style="font-size:12px;color:#475569;margin-top:4px;">
                        ${trips.length} trip${trips.length !== 1 ? 's' : ''} &middot;
                        ${sortedDates.length} active day${sortedDates.length !== 1 ? 's' : ''}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:3px;">
                        Net ${summary.net >= 0 ? 'Profit' : 'Loss'}
                    </div>
                    <div style="font-size:28px;font-weight:900;color:${netColor};letter-spacing:-0.03em;">
                        ${netSign}${pkr(summary.net)}
                    </div>
                </div>
            </div>

            <!-- Summary Stats Grid -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:24px;">
                <div class="report-stat">
                    <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">💰 Total Earned</div>
                    <div style="font-size:20px;font-weight:800;color:#10B981;">${pkr(summary.fares)}</div>
                </div>
                <div class="report-stat">
                    <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">📤 Direct Expenses</div>
                    <div style="font-size:20px;font-weight:800;color:#EF4444;">${pkr(summary.rawExpenses || summary.expenses)}</div>
                </div>
                ${summary.carriedLossIn > 0 ? `
                <div class="report-stat" style="border-color:rgba(239,68,68,0.3);">
                    <div style="font-size:10px;color:#F87171;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">🔻 Carried Loss In</div>
                    <div style="font-size:20px;font-weight:800;color:#EF4444;">${pkr(summary.carriedLossIn)}</div>
                </div>` : ''}
                <div class="report-stat">
                    <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">⛽ Fuel</div>
                    <div style="font-size:20px;font-weight:800;color:#F59E0B;">${pkr(summary.fuel)}</div>
                </div>
                <div class="report-stat">
                    <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">🔧 Maintenance</div>
                    <div style="font-size:20px;font-weight:800;color:#EF4444;">${pkr(summary.maintenance)}</div>
                </div>
                <div class="report-stat" style="border-color:${summary.net >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'};">
                    <div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">📈 Net Final</div>
                    <div style="font-size:20px;font-weight:800;color:${netColor};">${netSign}${pkr(summary.net)}</div>
                </div>
            </div>

            <!-- Bar Chart -->
            <div style="margin-bottom:24px;">
                <div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:12px;">
                    Daily Fares vs Expenses
                </div>
                <div style="position:relative;height:215px;">
                    <canvas id="chart-report" aria-label="Report period chart"></canvas>
                </div>
            </div>

            <!-- Per-Day Table -->
            <div>
                <div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:12px;">
                    Per-Day Breakdown
                </div>
                <div style="overflow-x:auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Date</th><th>Trips</th><th>Fares</th>
                                <th>Fuel</th><th>Maint.</th><th>Other</th>
                                <th>Expenses</th><th>Net</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedDates.map(date => {
                                const d     = calcWeekSummary(dayMap[date]);
                                const dCol  = d.net >= 0 ? '#10B981' : '#EF4444';
                                const dSign = d.net >= 0 ? '+' : '−';
                                return `<tr>
                                    <td style="color:#94A3B8;white-space:nowrap;font-weight:600;">${formatDisplayDate(date)}</td>
                                    <td style="color:#64748B;">${dayMap[date].length}</td>
                                    <td style="color:#10B981;font-weight:700;">PKR ${d.fares.toLocaleString()}</td>
                                    <td>${optPKR(d.fuel,        '#F59E0B')}</td>
                                    <td>${optPKR(d.maintenance, '#EF4444')}</td>
                                    <td>${optPKR(d.other,       '#A78BFA')}</td>
                                    <td style="color:#EF4444;">${d.expenses > 0 ? 'PKR ' + d.expenses.toLocaleString() : '—'}</td>
                                    <td style="font-weight:700;color:${dCol};">${dSign}PKR ${Math.round(Math.abs(d.net)).toLocaleString()}</td>
                                </tr>`;
                            }).join('')}
                            <!-- Totals row -->
                            <tr style="border-top:2px solid rgba(99,102,241,0.22);">
                                <td style="font-weight:700;color:#A5B4FC;">TOTAL</td>
                                <td style="font-weight:700;color:#A5B4FC;">${trips.length}</td>
                                <td style="font-weight:800;color:#10B981;">PKR ${summary.fares.toLocaleString()}</td>
                                <td style="font-weight:700;">${optPKR(summary.fuel,        '#F59E0B')}</td>
                                <td style="font-weight:700;">${optPKR(summary.maintenance, '#EF4444')}</td>
                                <td style="font-weight:700;">${optPKR(summary.other,       '#A78BFA')}</td>
                                <td style="font-weight:700;color:#EF4444;">PKR ${(summary.rawExpenses || summary.expenses).toLocaleString()}</td>
                                <td style="font-weight:800;color:${netColor};">${netSign}PKR ${Math.round(Math.abs(summary.net)).toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

    // Build the chart after DOM settles
    setTimeout(() => buildReportChart(sortedDates, dayMap), 60);
    setTimeout(() => out.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
}

/** Builds the bar chart inside the report output card */
function buildReportChart(sortedDates, dayMap) {
    if (reportChartInstance) { reportChartInstance.destroy(); reportChartInstance = null; }
    const canvas = document.getElementById('chart-report');
    if (!canvas) return;

    const faresArr = sortedDates.map(d => dayMap[d].reduce((s, t) => s + (t.fare || 0), 0));
    const expArr   = sortedDates.map(d => dayMap[d].reduce((s, t) => s + (t.fuel || 0) + (t.maintenance || 0) + (t.other || 0), 0));
    const labels   = sortedDates.map(d => {
        const dt = parseLocalDate(d);
        return dt.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
    });

    reportChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label          : 'Fares',
                    data           : faresArr,
                    backgroundColor: 'rgba(16,185,129,0.65)',
                    borderColor    : '#10B981',
                    borderWidth    : 1.5,
                    borderRadius   : 5,
                    borderSkipped  : false
                },
                {
                    label          : 'Expenses',
                    data           : expArr,
                    backgroundColor: 'rgba(239,68,68,0.55)',
                    borderColor    : '#EF4444',
                    borderWidth    : 1.5,
                    borderRadius   : 5,
                    borderSkipped  : false
                }
            ]
        },
        options: {
            responsive         : true,
            maintainAspectRatio: false,
            plugins: {
                legend : {
                    labels: {
                        color    : '#94A3B8',
                        font     : { size: 11 },
                        padding  : 14,
                        boxWidth : 12,
                        boxHeight: 12
                    }
                },
                tooltip: darkTooltip(item => ` ${item.dataset.label}: PKR ${item.raw.toLocaleString()}`)
            },
            scales: darkScales()
        }
    });
}


/* =============================================================
   MASTER REFRESH
   Recalculates everything chronologically and re-renders all UI sections.
   ============================================================= */
function refresh() {
    const summary   = getCurrentWeekSummary();
    const weekTrips = summary.trips;

    renderStats(summary, weekTrips);
    updateCharts(weekTrips, summary);
    renderTable();
    renderPastWeeks();
    renderWeekEndBanner(summary);

    // Keep week select updated whenever data changes
    populateWeekSelect();
}


/* =============================================================
   FORM SUBMIT HANDLER
   ============================================================= */
async function handleSubmit(e) {
    e.preventDefault();

    const dateVal = document.getElementById('inp-date').value;
    const fareVal = parseFloat(document.getElementById('inp-fare').value);

    // Validation
    if (!dateVal) {
        showToast('Please select a date.', 'error');
        document.getElementById('inp-date').focus();
        return;
    }
    if (!fareVal || fareVal <= 0) {
        showToast('Fare must be greater than 0 PKR.', 'error');
        document.getElementById('inp-fare').focus();
        return;
    }

    // Save to LocalStorage & Supabase
    await DB.add({
        date        : dateVal,
        fare        : fareVal,
        fuel        : parseFloat(document.getElementById('inp-fuel').value)        || 0,
        maintenance : parseFloat(document.getElementById('inp-maintenance').value) || 0,
        other       : parseFloat(document.getElementById('inp-other').value)       || 0,
        vehicle     : document.getElementById('inp-vehicle').value,
        notes       : document.getElementById('inp-notes').value
    });

    // Reset form, but preserve date and vehicle selection for fast repeat entry
    const savedDate    = dateVal;
    const savedVehicle = document.getElementById('inp-vehicle').value;
    e.target.reset();
    document.getElementById('inp-date').value    = savedDate;
    document.getElementById('inp-vehicle').value = savedVehicle;
    // Reset numeric fields to 0 (not empty)
    ['inp-fuel', 'inp-maintenance', 'inp-other'].forEach(id => {
        document.getElementById(id).value = '0';
    });

    refresh();

    // Gently scroll to show the table was updated
    setTimeout(() => {
        const table = document.getElementById('trips-table');
        if (table) table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 350);
}


/* =============================================================
   DELETE HANDLER
   (exposed on window so it's callable from inline onclick)
   ============================================================= */
async function handleDelete(id) {
    if (!confirm('Delete this trip? This action cannot be undone.')) return;
    await DB.remove(id);
    refresh();
}


/* =============================================================
   CLOUD SETUP MODAL ACTIONS
   ============================================================= */
function openCloudModal() {
    const { url, key } = getSupabaseCredentials();
    document.getElementById('cfg-sb-url').value = url;
    document.getElementById('cfg-sb-key').value = key;
    document.getElementById('cloud-modal').style.display = 'flex';
}

function closeCloudModal() {
    document.getElementById('cloud-modal').style.display = 'none';
}

async function saveCloudSettings() {
    const url = document.getElementById('cfg-sb-url').value.trim();
    const key = document.getElementById('cfg-sb-key').value.trim();

    if (!url || !key) {
        showToast('Please enter both Supabase URL and Anon Key.', 'error');
        return;
    }

    localStorage.setItem('supabase_url', url);
    localStorage.setItem('supabase_anon_key', key);

    closeCloudModal();
    showToast('Connecting to Supabase Cloud...', 'info');

    await DB.init();
}


// Expose handlers called from inline HTML attributes
window.handleDelete      = handleDelete;
window.toggleWeekDetails = toggleWeekDetails;
window.openCloudModal    = openCloudModal;
window.closeCloudModal   = closeCloudModal;
window.saveCloudSettings = saveCloudSettings;


/* =============================================================
   INITIALISATION
   ============================================================= */
async function init() {
    // Set date input to today by default
    document.getElementById('inp-date').value = toYMD(new Date());

    // Wire up the form
    document.getElementById('trip-form').addEventListener('submit', handleSubmit);

    // Render the header (week label + date)
    renderHeader();

    // Initial data load + Supabase cloud sync
    await DB.init();

    // Set up the report panel
    initReportUI();
}

// Boot when DOM is ready
document.addEventListener('DOMContentLoaded', init);
