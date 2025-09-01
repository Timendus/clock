/**
 * This file contains a pretty retarded ical parser. Just so we don't need to
 * have a dependency for this 🙈. It's probably got a few holes in it, but it
 * seems to work for parsing my Google Calendar for now.
 */

/**
 * @typedef {Object} CalendarItem
 * @property {Date} start
 * @property {Date} end
 * @property {string} summary
 */

/**
 * Parses an ics file
 * @param {string} icsData The ics data to parse
 * @returns {CalendarItem[]} An array of events
 */
export function parse(icsData) {
  const events = [];
  const lines = icsData.split(/\r\n|\n|\r/);
  let event = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    while (i < lines.length - 1 && lines[1 + i].startsWith(" ")) {
      line = line.substring(-1) + lines[1 + i].substring(1);
      i++;
    }
    if (line.startsWith("BEGIN:VEVENT")) {
      event = { raw: {} };
    } else if (line.startsWith("END:VEVENT")) {
      event.start = parseICalendarDate(event.raw["DTSTART"]);
      event.end = parseICalendarDate(event.raw["DTEND"]) || event.start;
      event.summary = event.raw["SUMMARY"];
      if (event.raw["RRULE"]) {
        event.recurringDates = expandRecurringEvents(event, new Date());
      }
      events.push(event);
      event = null;
    } else if (event) {
      const [key, value] = line.split(":");
      const [realKey, _] = key.split(";"); // We can get things like DTSTART;VALUE=DATE or DTSTART;TZID=Europe/Amsterdam
      event.raw[realKey.trim()] = value.trim();
    }
  }
  return events;
}

/**
 * Filters events for today
 * @param {{start: Date, end: Date, summary: string}[]} events An array of events
 * @returns {{start: Date, end: Date, summary: string}[]} The events that occur today
 */
export function todaysEvents(events) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  return events.filter(between(startOfToday, endOfToday));
}

/**
 * Generates a filter function that returns true if an event is relevant between
 * the given timestamps
 * @param {Date} start Starting timestamp
 * @param {Date} end Ending timestamp
 * @returns {(event: CalendarItem) => boolean} A
 * function that returns true if the event is relevant
 */
export function between(start, end) {
  return (event) => {
    if (event.recurringDates) {
      return event.recurringDates.some((d) => d >= start && d < end);
    }
    return (
      (event.start < start && event.end >= end) ||
      (event.start >= start && event.start < end) ||
      (event.end > start && event.end <= end)
    );
  };
}

/* Some internal functions here */

function parseRrule(rruleString) {
  const parts = rruleString.split(";").reduce((acc, part) => {
    const [key, value] = part.split("=");
    acc[key] = value;
    return acc;
  }, {});
  return parts;
}

function expandRecurringEvents(event, untilDate) {
  if (!event.raw["RRULE"]) {
    return [];
  }
  const rrule = parseRrule(event.raw["RRULE"]);
  const startDate = event.start;
  if (!startDate) return [];
  if (rrule.UNTIL) {
    rrule.untilDate = parseICalendarDate(rrule.UNTIL);
  }

  let dates = [];
  switch (rrule.FREQ) {
    case "DAILY":
      for (
        let d = new Date(startDate);
        d <= untilDate && d <= rrule.untilDate;
        d.setDate(d.getDate() + (parseInt(rrule.INTERVAL) || 1))
      ) {
        dates.push(new Date(d));
      }
      break;

    case "WEEKLY":
      const dayOfWeek = startDate.getDay();
      for (
        let d = new Date(startDate);
        d <= untilDate && d <= rrule.untilDate;
        d.setDate(d.getDate() + 7 * (parseInt(rrule.INTERVAL) || 1))
      ) {
        if (d.getDay() === dayOfWeek) {
          dates.push(new Date(d));
        }
      }
      break;

    case "MONTHLY":
      for (
        let d = new Date(startDate);
        d <= untilDate && d <= rrule.untilDate;
        d.setMonth(d.getMonth() + (parseInt(rrule.INTERVAL) || 1))
      ) {
        dates.push(new Date(d));
      }
      break;

    case "YEARLY":
      for (
        let d = new Date(startDate);
        d <= untilDate && d <= rrule.untilDate;
        d.setFullYear(d.getFullYear() + (parseInt(rrule.INTERVAL) || 1))
      ) {
        dates.push(new Date(d));
      }
      break;
  }

  return dates;
}

function parseICalendarDate(dateStr) {
  if (!dateStr) {
    return undefined;
  }

  if (dateStr.includes("T")) {
    // Assumes the format is "YYYYMMDDTHHMMSSZ"
    const year = parseInt(dateStr.substr(0, 4), 10);
    const month = parseInt(dateStr.substr(4, 2), 10) - 1; // JavaScript months are 0-based
    const day = parseInt(dateStr.substr(6, 2), 10);
    const hours = parseInt(dateStr.substr(9, 2), 10);
    const minutes = parseInt(dateStr.substr(11, 2), 10);
    const seconds = parseInt(dateStr.substr(13, 2), 10);

    // The 'Z' indicates that this is a UTC time
    if (dateStr.endsWith("Z")) {
      return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    } else {
      return new Date(year, month, day, hours, minutes, seconds);
    }
  } else {
    // Assumes the format is "YYYYMMDD"
    const year = parseInt(dateStr.substr(0, 4), 10);
    const month = parseInt(dateStr.substr(4, 2), 10) - 1; // JavaScript months are 0-based
    const day = parseInt(dateStr.substr(6, 2), 10);
    return new Date(year, month, day);
  }
}
