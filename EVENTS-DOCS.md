# Clash of Clans Events Manager

A powerful JavaScript module for dynamically managing Clash of Clans in-game events with support for repeating (monthly/weekly) and one-time events.

## 📋 Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [JSON Configuration](#json-configuration)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Edge Cases](#edge-cases)
- [Testing](#testing)

## ✨ Features

- ✅ **Repeating Events**: Automatically calculates monthly and weekly recurring events
- ✅ **One-Time Events**: Fixed start/end date events
- ✅ **Real-Time Countdowns**: Calculates remaining days, hours, minutes, seconds
- ✅ **Active Event Detection**: Automatically filters currently active events
- ✅ **Calendar Integration**: Generate calendar views with event markers
- ✅ **Event Toggling**: Enable/disable events via `active` flag
- ✅ **Edge Case Handling**: Month boundaries, leap years, week transitions
- ✅ **Caching**: Performance optimization for frequent updates
- ✅ **No Dependencies**: Pure JavaScript, works in browser and Node.js

## 🚀 Quick Start

### 1. Include the Module

```html
<script src="events-manager.js"></script>
```

### 2. Load Events Configuration

```javascript
// Load from external JSON file
await eventsManager.loadEvents('events-config.json');

// Or load from object
await eventsManager.loadEvents({
    repeating_events: [...],
    one_time_events: [...]
});
```

### 3. Get Active Events

```javascript
const activeEvents = eventsManager.getActiveEvents();

activeEvents.forEach(event => {
    console.log(`${event.title} - ${event.countdownText} remaining`);
});
```

## 📝 JSON Configuration

### Structure

```json
{
  "repeating_events": [...],
  "one_time_events": [...]
}
```

### Repeating Events

Events that occur on a fixed day every month or week.

```json
{
  "title": "Event Name",
  "icon": "font-awesome-icon-name",
  "baseDate": "01" or "Monday",
  "modifier": "monthly" or "weekly",
  "durationDays": 7,
  "description": "Optional description",
  "active": true
}
```

**Fields:**

- `title` **(required)**: Event name
- `icon` **(required)**: Font Awesome icon name (e.g., "star", "trophy", "gem")
- `baseDate` **(required)**: 
  - For monthly: Day of month as string ("01" to "31")
  - For weekly: Day name ("Sunday", "Monday", ..., "Saturday")
- `modifier` **(required)**: Either "monthly" or "weekly"
- `durationDays` **(required)**: How many days the event lasts
- `description` *(optional)*: Event description
- `active` *(optional)*: Set to `false` to hide event (default: `true`)

**Examples:**

```json
{
  "title": "Gold Pass",
  "icon": "star",
  "baseDate": "01",
  "modifier": "monthly",
  "durationDays": 31,
  "description": "Season challenges and rewards",
  "active": true
}
```

```json
{
  "title": "Raid Weekend",
  "icon": "trophy",
  "baseDate": "Friday",
  "modifier": "weekly",
  "durationDays": 3,
  "description": "Capital Raid Weekend",
  "active": true
}
```

### One-Time Events

Events with fixed start and end dates.

```json
{
  "title": "Event Name",
  "icon": "icon-name",
  "start": "2026-01-15T08:00:00Z",
  "end": "2026-01-20T08:00:00Z",
  "description": "Optional description",
  "active": true
}
```

**Fields:**

- `title` **(required)**: Event name
- `icon` **(required)**: Font Awesome icon name
- `start` **(required)**: ISO 8601 start date/time
- `end` **(required)**: ISO 8601 end date/time
- `description` *(optional)*: Event description
- `active` *(optional)*: Set to `false` to hide event

**Example:**

```json
{
  "title": "1 Gem Boosts",
  "icon": "gem",
  "start": "2026-01-15T08:00:00Z",
  "end": "2026-01-20T08:00:00Z",
  "description": "All boosts cost just 1 gem",
  "active": true
}
```

## 📚 API Reference

### Class: `EventsManager`

#### Methods

##### `loadEvents(source)`

Load events configuration from a JSON file or object.

```javascript
await eventsManager.loadEvents('events-config.json');
// or
await eventsManager.loadEvents(configObject);
```

**Parameters:**
- `source` (string | object): URL to JSON file or config object

**Returns:** Promise<void>

---

##### `getActiveEvents(currentDate, forceRefresh)`

Get all currently active events.

```javascript
const activeEvents = eventsManager.getActiveEvents();
```

**Parameters:**
- `currentDate` (Date, optional): Reference date for testing (default: now)
- `forceRefresh` (boolean, optional): Force cache refresh (default: false)

**Returns:** Array of active event objects

**Event Object Structure:**
```javascript
{
  title: "Event Name",
  icon: "icon-name",
  description: "Event description",
  type: "repeating" | "one-time",
  modifier: "monthly" | "weekly" | undefined,
  start: Date,
  end: Date,
  countdown: {
    days: 5,
    hours: 12,
    minutes: 30,
    seconds: 45,
    totalMs: 123456789
  },
  countdownText: "5d 12h"
}
```

---

##### `getUpcomingEvents(currentDate, daysAhead)`

Get all upcoming events within a specified timeframe.

```javascript
const upcoming = eventsManager.getUpcomingEvents(new Date(), 30);
```

**Parameters:**
- `currentDate` (Date, optional): Reference date (default: now)
- `daysAhead` (number, optional): How many days to look ahead (default: 30)

**Returns:** Array of upcoming event objects

---

##### `getCalendarForMonth(year, month)`

Get calendar entries for a specific month.

```javascript
const calendarEvents = eventsManager.getCalendarForMonth(2026, 0); // January 2026
```

**Parameters:**
- `year` (number): Year
- `month` (number): Month (0-11, where 0 = January)

**Returns:** Array of calendar day objects

**Calendar Object Structure:**
```javascript
{
  date: 15,                    // Day of month
  fullDate: Date,              // Full date object
  title: "Event Name",
  icon: "icon-name",
  type: "repeating" | "one-time"
}
```

---

##### `isEventActive(eventTitle, currentDate)`

Check if a specific event is currently active.

```javascript
const isActive = eventsManager.isEventActive("Gold Pass");
```

**Parameters:**
- `eventTitle` (string): Title of the event
- `currentDate` (Date, optional): Reference date (default: now)

**Returns:** boolean

---

##### `formatCountdown(countdown)`

Format countdown object as human-readable string.

```javascript
const text = eventsManager.formatCountdown({
  days: 2,
  hours: 4,
  minutes: 30,
  seconds: 15
}); // "2d 4h"
```

**Parameters:**
- `countdown` (object): Countdown object

**Returns:** string

## 💡 Usage Examples

### Example 1: Display Active Events

```javascript
async function displayActiveEvents() {
    await eventsManager.loadEvents('events-config.json');
    
    const activeEvents = eventsManager.getActiveEvents();
    
    activeEvents.forEach(event => {
        console.log(`
            Event: ${event.title}
            Type: ${event.type}
            Ends: ${event.end.toLocaleString()}
            Time Left: ${event.countdownText}
        `);
    });
}

displayActiveEvents();
```

### Example 2: Update UI Every Second

```javascript
async function startEventMonitor() {
    await eventsManager.loadEvents('events-config.json');
    
    function updateUI() {
        const activeEvents = eventsManager.getActiveEvents();
        
        // Update your DOM here
        document.getElementById('events').innerHTML = activeEvents.map(event => `
            <div class="event">
                <i class="fas fa-${event.icon}"></i>
                <h3>${event.title}</h3>
                <p>${event.countdownText} remaining</p>
            </div>
        `).join('');
    }
    
    updateUI();
    setInterval(updateUI, 1000); // Update every second
}

startEventMonitor();
```

### Example 3: Generate Calendar

```javascript
async function generateCalendar() {
    await eventsManager.loadEvents('events-config.json');
    
    const now = new Date();
    const calendarData = eventsManager.getCalendarForMonth(
        now.getFullYear(),
        now.getMonth()
    );
    
    // Group by date
    const eventsByDate = {};
    calendarData.forEach(item => {
        if (!eventsByDate[item.date]) {
            eventsByDate[item.date] = [];
        }
        eventsByDate[item.date].push(item);
    });
    
    // Render calendar
    for (let day = 1; day <= 31; day++) {
        const events = eventsByDate[day] || [];
        console.log(`Day ${day}:`, events.map(e => e.title).join(', '));
    }
}

generateCalendar();
```

### Example 4: Testing Events

```javascript
// Test what events were active on a specific date
const testDate = new Date('2026-01-15T12:00:00Z');
const events = eventsManager.getActiveEvents(testDate);

console.log(`Events active on ${testDate.toDateString()}:`, events);
```

### Example 5: Toggle Event Visibility

```javascript
// In your events-config.json, set active to false
{
  "title": "Old Event",
  "icon": "star",
  "baseDate": "01",
  "modifier": "monthly",
  "durationDays": 7,
  "active": false  // This event will be hidden
}
```

## ⚠️ Edge Cases Handled

### Monthly Events

✅ **Month End Dates**: Events on day 31 work correctly even in months with fewer days
✅ **Leap Years**: February 29 handled automatically
✅ **Multi-Month Events**: Events longer than one month calculate correctly
✅ **Month Boundaries**: Events spanning multiple months work seamlessly

### Weekly Events

✅ **Week Transitions**: Events spanning week boundaries work correctly
✅ **Current Day Events**: If today is the start day, event is active
✅ **Multi-Week Events**: Events longer than 7 days handled properly

### One-Time Events

✅ **Past Events**: Automatically excluded from active events
✅ **Future Events**: Shown in upcoming but not active
✅ **Timezone Handling**: Uses ISO 8601 format with timezone awareness

## 🧪 Testing

### Test Monthly Event

```javascript
// Test Gold Pass (starts day 1, lasts 31 days)
const testDates = [
    new Date('2026-01-01T07:00:00Z'),  // Before start
    new Date('2026-01-01T09:00:00Z'),  // After start
    new Date('2026-01-15T12:00:00Z'),  // Middle
    new Date('2026-01-31T23:00:00Z'),  // Near end
    new Date('2026-02-01T09:00:00Z'),  // After end (next month)
];

testDates.forEach(date => {
    const events = eventsManager.getActiveEvents(date);
    const goldPass = events.find(e => e.title === 'Gold Pass');
    console.log(`${date.toISOString()}: ${goldPass ? 'ACTIVE' : 'INACTIVE'}`);
});
```

### Test Weekly Event

```javascript
// Test Raid Weekend (starts Friday, lasts 3 days until Sunday)
const testDates = [
    new Date('2026-01-15T12:00:00Z'),  // Thursday (before)
    new Date('2026-01-16T12:00:00Z'),  // Friday (start)
    new Date('2026-01-17T12:00:00Z'),  // Saturday (active)
    new Date('2026-01-18T12:00:00Z'),  // Sunday (active)
    new Date('2026-01-19T12:00:00Z'),  // Monday (after)
];

testDates.forEach(date => {
    const events = eventsManager.getActiveEvents(date);
    const raid = events.find(e => e.title === 'Raid Weekend');
    console.log(`${date.toDateString()} (${date.toLocaleString('en-US', { weekday: 'long' })}): ${raid ? 'ACTIVE' : 'INACTIVE'}`);
});
```

## 📖 Complete Example

See `events-demo.html` for a fully working example with:
- Real-time event display
- Countdown timers
- Statistics dashboard
- Test functions
- Responsive UI

## 🔄 Updating Events

To update events for a new season:

1. Edit `events-config.json`
2. Update `one_time_events` with new dates
3. Toggle `active: false` for expired events
4. Add new one-time events as needed
5. Repeating events update automatically!

## 🐛 Troubleshooting

**Events not appearing?**
- Check that `active` is not set to `false`
- Verify date format (ISO 8601 for one-time events)
- Ensure `baseDate` is valid ("01"-"31" or day name)

**Wrong dates calculated?**
- Verify `modifier` is "monthly" or "weekly"
- Check `durationDays` is correct
- Test with specific dates using `getActiveEvents(testDate)`

**Performance issues?**
- Module uses caching (refreshes every second)
- Use `forceRefresh: false` for frequent calls
- Consider debouncing UI updates

## 📄 Files

- `events-manager.js` - Main module
- `events-config.json` - Events configuration
- `events-demo.html` - Interactive demo
- `EVENTS-DOCS.md` - This documentation

---

**Created for Clash of Clans fans** | Not affiliated with Supercell
