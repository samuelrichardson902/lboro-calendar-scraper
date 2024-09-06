/*
Script modified by Sam Richardson
** This script is a modification of Dawid Wraga's version (export to CSV) (https://github.com/DawidWraga/lboro-calendar-scraper).
** The original script (export to VCF) was created by James Middleton (https://github.com/james2mid/timetable-vcs).

Instructions:
- This script exports timetable data to CSV in a basic format.
*/
// ================= IGNORE EVERYTHING PAST HERE ===========
// * unless you know what you're doing ;)

// -- CONSTANTS

/** The number of milliseconds in one half-hour. */
const HALF_HOUR = 30 * 60 * 1000;
/** The number of milliseconds in one hour. */
const HOUR = HALF_HOUR * 2;
/** The number of milliseconds in one day. */
const DAY = HOUR * 24;

/** Zero-based days of week array. */
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// -- UTILITY FUNCTIONS

/** Flattens an array by one level. Included for older browser compatibility (and Edge ;) ). */
function flat(arr) {
  return [].concat.apply([], arr);
}

/** Pads a digit with zeroes to return a two-digit string. */
function padZeroes(s) {
  return String(s).length === 1 ? `0${s}` : s;
}

/** Converts milliseconds to the VCS date format. */
function msToVeventDate(ms) {
  const date = new Date(ms);
  return `${date.getFullYear()}${padZeroes(date.getUTCMonth() + 1)}${padZeroes(
    date.getUTCDate()
  )}T${padZeroes(date.getUTCHours())}${padZeroes(
    date.getUTCMinutes()
  )}${padZeroes(date.getUTCSeconds())}Z`;
}

// -- FUNCTIONS USED IN MAIN

/** Gets the day of week (zero-based) of the given row. */
function getRowDay(row) {
  let dayText = null;

  // sessions whose durations overlap, are placed on adjacent rows
  // these rows do not contain data about the weekday
  // so retrace rows until the current weekday is determined

  while (!dayText && $(row).prev()[0] !== row) {
    dayText = $(row).find(".weekday").text();
    row = $(row).prev();
  }

  return DAYS.indexOf(dayText);
}

(function main() {
  // -- Establish that the correct data is included in the table – prompt to change if not.
  const semester =
    $("#P2_MY_PERIOD").val() === "sem1"
      ? 1
      : $("#P2_MY_PERIOD").val() === "sem2"
      ? 2
      : null;

  if (!semester) {
    alert(
      'Ensure that the "Period" dropdown box is set as "Semester 1" or "Semester 2"'
    );
    return;
  }

  // -- Parse the table HTML to get the session data – each containing one or multiple events.

  const rows = $(".tt_info_row").get();

  const sessions = rows.reduce((sessions, row) => {
    const day = getRowDay(row);

    const cells = $(row).children("td").not(".weekday_col").get();
    const rowSessions = cells.reduce(
      (acc, cell) => {
        if (
          cell.classList.contains("new_row_tt_info_cell") ||
          cell.classList.contains("tt_info_cell")
        ) {
          // session
          acc.sessions.push({
            link: $(cell).find(".online_link").attr("href"),
            moduleId: $(cell).find(".tt_module_id_row").text(),
            moduleName: $(cell).find(".tt_module_name_row").text(),
            type: $(cell).find(".tt_modtype_row").text(),
            lecturerName: $(cell).find(".tt_lect_row").text(),
            room: $(cell)
              .find(".tt_room_row")
              .first()
              .text()
              .replace("...", ""),
            buildingName: $($(cell).find(".tt_room_row")[1])
              .text()
              .replace(/\.\.\.|\(|\)/g, ""),
            day,
            timeOffset: (() => {
              const prevSession = acc.sessions[acc.sessions.length - 1];
              return (
                (prevSession
                  ? prevSession.timeOffset + prevSession.duration
                  : 0) + acc.gap
              );
            })(),
            duration: $(cell).attr("colspan") * HALF_HOUR,
            weeks: flat(
              /Sem\s+\d:\s+(.*)$/
                .exec($(cell).find(".tt_weeks_row").text())[1]
                .split(",")
                .map((x) => {
                  const r = /(\d{1,2})\s+-\s+(\d{1,2})/.exec(x);
                  return r
                    ? // a range, e.g '9 - 11' meaning weeks 9, 10 and 11
                      Array.from(Array(r[2] - r[1])).map((_, i) => +r[1] + i) // expand range
                    : // not a range, e.g. '6' meaning only week 6
                      [+x];
                })
            ),
          });
          acc.gap = 0;
        } else {
          // gap
          acc.gap += HALF_HOUR; // each gap is half an hour
        }

        return acc;
      },
      { sessions: [], gap: 0 }
    ).sessions;
    sessions.push(...rowSessions);
    return sessions;
  }, []);

  // -- Remove the potentially trashy parts of the sessions.

  sessions.forEach((session) => {
    Object.keys(session).forEach((key) => {
      if (session[key] && typeof session[key] === "string") {
        session[key] = session[key].trim().replace(/\s+/g, " ");
      }
    });
  });

  // -- Convert sessions into individual events.

  /** The beginning of the each week as a `Date` in the current semester. Array index equal to week number. */
  const weekStartDates = [
    null,
    ...$("#P2_MY_PERIOD > option")
      .get()
      .map((x) => x.innerText)
      .filter((x) => x.includes(`Sem ${semester} - Wk`))
      .map((x) =>
        /^Sem \d - Wk \d{1,2} \(starting (\d{1,2}-[A-Z]{3}-\d{4})\)$/.exec(x)
      )
      .map((x) => new Date(x[1]).getTime()),
  ];

  /** The start of the days as a `Date` as displayed in the timetable (generally 9AM). */
  const timetableStart =
    +$(".first_time_slot_col").first().text().split(":")[0] * HOUR;

  let events = sessions.reduce((events, session) => {
    events.push(
      ...session.weeks.map((weekNumber, _, arr) => {
        const startTime =
          weekStartDates[weekNumber] +
          DAY * session.day +
          timetableStart +
          session.timeOffset;

        const description = `Week ${weekNumber} ${session.type.toLowerCase()} for ${
          session.moduleName
        } (${session.moduleId}) with ${session.lecturerName} ${
          session.room ? `in ${session.room} ` : ""
        } ${session.buildingName ? `(${session.buildingName}) ` : ""}`;

        return {
          task_name: `${session.moduleName} ${session.type} (${
            session.room || "online"
          })`,
          description,
          start_date: msToVeventDate(startTime),
          due_date: msToVeventDate(startTime + session.duration),
          location: session.room || "online",
          website_link: session.link || "",
        };
      })
    );

    return events;
  }, []);

  events.sort(
    (a, b) => +a.start_date.split("T")[0] - +b.start_date.split("T")[0]
  );

  function jsonToCsv(items) {
    const replacer = (key, value) => (value === null ? "" : value); // specify how you want to handle null values here
    const header = Object.keys(items[0]);
    const csv = [
      header.join(","), // header row first
      ...items.map((row) =>
        header
          .map((fieldName) => JSON.stringify(row[fieldName], replacer))
          .join(",")
      ),
    ].join("\r\n");
    return csv;
  }

  function downloadBlob(content, filename, contentType) {
    // Create a blob
    var blob = new Blob([content], { type: contentType });
    var url = URL.createObjectURL(blob);

    // Create a link to download it
    var pom = document.createElement("a");
    pom.href = url;
    pom.setAttribute("download", filename);
    pom.click();
  }

  downloadBlob(
    jsonToCsv(events),
    `lboro-timetable-${new Date()
      .toISOString()
      .slice(0, 4)}-semester-${semester}.csv`,
    "text/csv;charset=utf-8;"
  );
})();
