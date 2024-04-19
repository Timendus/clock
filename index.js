if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

// Load schedule

let schedule = JSON.parse(localStorage.getItem("schedule"));
if (!schedule)
  schedule = await fetch("./sample-schedule.json").then((res) => res.json());
schedule = prepareSchedule(schedule);
scheduleToForm(schedule);

// Prepare globals

const clockElm = document.querySelector(".clock h1");
const nowPlayingElm = document.querySelector(".clock p");
const nextUpH1Elm = document.querySelector(".next-up h1");
const nextUpPElm = document.querySelector(".next-up p");
const progressElm = document.querySelector("#progress");
const themeColorElm = document.querySelector("meta[name=theme-color]");
const sound = new Audio("./ping.mp3");
let animating = false;

// Make the clock tick

update();
setInterval(update, 1000);

function update() {
  // Set the time in the clock
  const date = new Date();
  date.setSeconds(0);
  date.setMilliseconds(0);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const time = `${hour}:${minute > 9 ? minute : "0" + minute}`;
  clockElm.textContent = time;

  // Find relevant schedule items
  let currentScheduleItem, nextScheduleItem;
  for (const i in schedule) {
    if (schedule[i].date > date) {
      if (i == 0) {
        currentScheduleItem = schedule[schedule.length - 1];
        nextScheduleItem = schedule[0];
        break;
      }
      currentScheduleItem = schedule[i - 1];
      nextScheduleItem = schedule[i];
      break;
    }
  }

  if (!currentScheduleItem) {
    // We're at the end of the schedule, so the current item is the last item
    currentScheduleItem = schedule[schedule.length - 1];
    nextScheduleItem = schedule[0];
  }

  if (currentScheduleItem.activity)
    nowPlayingElm.textContent = currentScheduleItem.activity;

  // Is the next schedule item soon?
  if (
    nextScheduleItem &&
    minutesBetweenDates(date, nextScheduleItem.date) <= 10
  ) {
    // Then show the title and skew the background colour
    if (nextScheduleItem.activity) {
      nextUpH1Elm.textContent = `— Coming up at ${nextScheduleItem.time} —`;
      nextUpPElm.textContent = nextScheduleItem.activity;
    }
    const color = interpolate(
      nextScheduleItem.color,
      currentScheduleItem.color,
      secondsBetweenDates(new Date(), nextScheduleItem.date) / (10 * 60)
    );
    document.body.style.backgroundColor = color;
    themeColorElm.content = color;
    const textColor = getTextColour(color);
    document.body.style.color = textColor;
    progressElm.style.backgroundColor = textColor;
    document.body.classList.add("coming-up");
  } else {
    // Otherwise just use the colour from the current item
    document.body.style.backgroundColor = currentScheduleItem.color;
    themeColorElm.content = currentScheduleItem.color;
    const textColor = getTextColour(currentScheduleItem.color);
    document.body.style.color = textColor;
    progressElm.style.backgroundColor = textColor;
    document.body.classList.remove("coming-up");
  }

  // Show progress bar to next item, if there is a next item
  if (nextScheduleItem) {
    const progress =
      (secondsBetweenDates(currentScheduleItem.date, new Date()) /
        secondsBetweenDates(currentScheduleItem.date, nextScheduleItem.date)) *
      80;
    progressElm.style.width = `${progress}%`;
  } else {
    progressElm.style.width = "0%";
  }

  // Add triggers for next schedule item animation
  if (
    date.getHours() == currentScheduleItem.date.getHours() &&
    date.getMinutes() == currentScheduleItem.date.getMinutes() &&
    !animating
  ) {
    animating = true;
    document.body.classList.add("animate");
    sound.play();
    setTimeout(() => {
      document.body.classList.remove("animate");
      animating = false;
      sound.pause();
    }, 60 * 1000);
  }
}

/**
 * Find the number of minutes between two times on the day, considering rollover
 * to the next day. Dates should be consecutive. Please don't ask me about
 * daylight saving time.
 * @param {Date} date1 The first date
 * @param {Date} date2 The second date
 * @returns {number} Minutes between the dates
 */
function minutesBetweenDates(date1, date2) {
  return secondsBetweenDates(date1, date2) / 60;
}

/**
 * Find the number of seconds between two times on the day, considering rollover
 * to the next day. Dates should be consecutive. Please don't ask me about
 * daylight saving time.
 * @param {Date} date1 The first date
 * @param {Date} date2 The second date
 * @returns {number} Seconds between the dates
 */
function secondsBetweenDates(date1, date2) {
  // If the second date is earlier than the first, assume it's the next day
  if (date1 > date2) {
    const date2Copy = new Date(date2.getTime());
    date2Copy.setDate(date2Copy.getDate() + 1);
    return (date2Copy - date1) / 1000;
  }
  return (date2 - date1) / 1000;
}

/**
 * @typedef {Object} ScheduleItem
 * @property {string} time
 * @property {string} activity
 * @property {string} color
 */

/**
 * @typedef {Object} ScheduleItemWithDate
 * @property {string} time
 * @property {string} activity
 * @property {string} color
 * @property {Date} date
 */

/**
 * Modifies schedule array in place to add date properties to the schedule items
 * and sort by them
 * @param {ScheduleItem[]} schedule
 * @returns {ScheduleItemWithDate[]}
 */
function prepareSchedule(schedule) {
  schedule = schedule.filter((item) => item);
  for (const item of schedule) {
    const [h, m] = item.time.split(":");
    const d = new Date();
    d.setHours(parseInt(h));
    d.setMinutes(parseInt(m));
    d.setSeconds(0);
    d.setMilliseconds(0);
    item.date = d;
  }
  return schedule.sort((a, b) => a.date - b.date);
}

/**
 * Interpolates between two hex colors
 * @param {string} color1
 * @param {string} color2
 * @param {number} percent
 * @returns {string} The blended colour as a hex string
 */
function interpolate(color1, color2, percent) {
  // Convert the hex colors to RGB values
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);

  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);

  // Interpolate the RGB values
  const r = Math.round(r1 + (r2 - r1) * percent);
  const g = Math.round(g1 + (g2 - g1) * percent);
  const b = Math.round(b1 + (b2 - b1) * percent);

  // Convert the interpolated RGB values back to a hex color
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * Calculate a colour to use as the foreground colour given a background colour
 * @param {string} color The background colour
 * @returns {string} The foreground colour
 */
function getTextColour(color) {
  let r = parseInt(color.substring(1, 3), 16);
  let g = parseInt(color.substring(3, 5), 16);
  let b = parseInt(color.substring(5, 7), 16);
  const yiq = Math.round((r * 299 + g * 587 + b * 114) / 1000);

  const factor = 1.3;
  if (yiq >= 128) {
    r = Math.round(r / factor);
    g = Math.round(g / factor);
    b = Math.round(b / factor);
  } else {
    r = Math.round(Math.min(r * factor, 255));
    g = Math.round(Math.min(g * factor, 255));
    b = Math.round(Math.min(b * factor, 255));
  }

  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function randomColour() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `#${r.toString(16)}${g.toString(16)}${b.toString(16)}`;
}

// Manage settings

const settings = document.getElementById("settings");
const settingsForm = settings.querySelector("form");

document.addEventListener("click", (event) => {
  // Add row if add button is clicked
  if (event.target.matches("button.add")) {
    addRow(event.target);
    return;
  }
  // Remove row if remove button is clicked
  if (event.target.matches("button.remove")) {
    removeRow(event.target);
    return;
  }
  // Ignore click if modal is clicked
  if (settings.contains(event.target)) {
    return;
  }
  // Show the modal otherwise
  settings.showModal();
});

settingsForm.addEventListener("submit", () => {
  schedule = prepareSchedule(formToSchedule());
  localStorage.setItem("schedule", JSON.stringify(schedule));
});

function formToSchedule() {
  const formData = new FormData(settingsForm);
  const newSchedule = [];
  formData.forEach((value, key) => {
    // Extract the index and property name from the key
    const match = key.match(/schedule\[(\d+)\]\[(\w+)\]/);
    if (match) {
      const index = parseInt(match[1]);
      const property = match[2];
      newSchedule[index] = newSchedule[index] || {};
      newSchedule[index][property] = value;
    }
  });
  return newSchedule;
}

function scheduleToForm(schedule) {
  document.querySelector("#settings form ul").innerHTML =
    schedule
      .map((item, i) => {
        return `
        <li>
          <input type="color" name="schedule[${i}][color]" value="${item.color}" />
          <input type="time" name="schedule[${i}][time]" value="${item.time}" />
          <input type="text" name="schedule[${i}][activity]" value="${item.activity}" />
          <button type="button" class="remove">🗑</button>
        </li>
        `;
      })
      .join("") +
    `<li><button type="button" class="add">Add another item</button></li>`;
}

function addRow(buttonElm) {
  const li = document.createElement("li");
  const nextItem = document.querySelectorAll("#settings form ul li").length - 1;
  li.innerHTML = `
    <input type="color" name="schedule[${nextItem}][color]" value="${randomColour()}" />
    <input type="time" name="schedule[${nextItem}][time]" value="00:00" />
    <input type="text" name="schedule[${nextItem}][activity]" value="" />
    <button type="button" class="remove">🗑</button>
  `;
  buttonElm.parentNode.parentNode.insertBefore(li, buttonElm.parentNode);
}

function removeRow(buttonElm) {
  buttonElm.parentNode.remove();
}

// Hide the mouse cursor and some information after a second of inactivity

const mouseHideDelay = 3000;
let timer;
document.addEventListener("mousemove", () => {
  document.body.classList.add("mousefocus");
  clearTimeout(timer);
  timer = setTimeout(
    () => document.body.classList.remove("mousefocus"),
    mouseHideDelay
  );
});

// Shift the whole display a couple of pixels to prevent burn in

setInterval(burnInShift, 30 * 1000);
burnInShift();

function burnInShift() {
  const xOffset = (Math.floor(Math.random() * 10) - 5) / 10;
  const yOffset = (Math.floor(Math.random() * 10) - 5) / 10;
  document.body.style.transform = `translate(${xOffset}em, ${yOffset}em)`;
}
