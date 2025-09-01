import * as ical from "./ical.js";

// Manage calendar

async function getCalendar(settings) {
  const response = await fetch(
    `http://localhost:${settings.port}/?url=${settings.calendar}&secret=${settings.secret}&ttl=${settings.ttl}`
  );
  const icalFeed = await response.text();
  calendar = ical.parse(icalFeed);
}

/**
 *
 * @param {ScheduleItemWithDate[]} schedule Day schedule
 * @param {CalendarItem[]} calendar Parsed ical events
 * @returns {ScheduleItemWithDate[]} Merged schedule
 */
function zipCalendarIntoSchedule(schedule, calendar) {
  const today = new Date();
  const todaysEvents = ical
    .todaysEvents(calendar)
    .map((event) => {
      event.start.setFullYear(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      return event;
    })
    .sort((a, b) => a.start - b.start);

  const zippedSchedule = [];
  let i = 0;
  let j = 0;
  while (true) {
    if (i >= todaysEvents.length) {
      while (j < schedule.length) {
        zippedSchedule.push(schedule[j]);
        j++;
      }
      break;
    }

    if (j >= schedule.length) {
      while (i < todaysEvents.length) {
        zippedSchedule.push({
          date: todaysEvents[i].start,
          activity: todaysEvents[i].summary,
          color: randomColour(),
        });
        i++;
      }
      break;
    }

    if (todaysEvents[i].start < schedule[j].date) {
      zippedSchedule.push({
        date: todaysEvents[i].start,
        activity: todaysEvents[i].summary,
        color: randomColour(),
      });
      i++;
    } else {
      zippedSchedule.push(schedule[j]);
      j++;
    }
  }

  return zippedSchedule;
}
