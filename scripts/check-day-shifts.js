// Quick logic check for src/utils/dayShifts.ts (no test runner in the repo).
// Run: node scripts/check-day-shifts.js
const ts = require("typescript");
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/../src/utils/dayShifts.ts", "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2019" } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", js)(m, m.exports, require);
const u = m.exports;
const assert = require("assert");
const day = (o) => ({ id: 1, date: "2026-11-20", day_type: "full_day", start_time: "09:00:00", end_time: "17:00:00", end_next_day: false, ...o });

assert.strictEqual(u.dayDurationMinutes(day({})), 480);
assert.strictEqual(u.canSplitDay(day({})), false); // exactly 8h
assert.strictEqual(u.canSplitDay(day({ end_time: "17:30:00" })), true);
assert.strictEqual(u.dayDurationMinutes(day({ start_time: "17:00:00", end_time: "02:00:00", end_next_day: true })), 540);
assert.strictEqual(u.canSplitDay(day({ start_time: "17:00:00", end_time: "02:00:00", end_next_day: true })), true);
assert.strictEqual(u.canSplitDay(day({ day_type: "half_day", end_time: "20:00:00" })), false);
assert.strictEqual(u.canSplitDay(day({ start_time: null })), false);
assert.strictEqual(u.defaultSplitTime(day({ end_time: "18:00:00" })), "13:30");
assert.strictEqual(u.defaultSplitTime(day({ end_time: "17:30:00" })), "13:30");
assert.strictEqual(u.defaultSplitTime(day({ start_time: "20:00:00", end_time: "06:00:00", end_next_day: true })), "01:00");
const ds = [day({ id: 2, start_time: "17:30:00", end_time: "02:00:00", end_next_day: true }), day({ id: 1, end_time: "17:30:00" }), day({ id: 3, date: "2026-11-21" })];
const idx = u.shiftIndexByDayId(ds);
assert.deepStrictEqual([idx.get(1), idx.get(2), idx.get(3)], [0, 1, 0]);
assert.strictEqual(u.splitPartner(ds[0], ds).id, 1);
assert.strictEqual(u.splitPartner(ds[1], ds), null);
assert.deepStrictEqual(u.mergeBackPatch(ds[1], ds[0]), { end_time: "02:00:00", end_next_day: true });
assert.deepStrictEqual(u.mergeBackPatch(day({}), day({ id: 9, date: "2026-11-21", end_time: "02:00:00" })), { end_time: "02:00:00", end_next_day: true });
const b = { driver: { id: 5, full_name: "Main" }, days: [day({ id: 1 }), day({ id: 2, driver: 7, driver_name: "Two" }), day({ id: 3, effective_driver: { id: 5, full_name: "Main" } })] };
assert.deepStrictEqual(u.distinctDrivers(b).map((d) => d.id), [5, 7]);
assert.strictEqual(u.driverDays(b, 7).length, 1);
console.log("dayShifts OK");

// Edit round-trip: a split date must come back as the same rows; other dates
// keep their driver.
{
  const full = (o) => ({ notes: null, client_rate: "6500.00", driver_rate: "1500.00", driver_payment_status: "unpaid", ...day(o) });
  const orig = [
    full({ id: 2, start_time: "17:30:00", end_time: "02:00:00", end_next_day: true, client_rate: "0.00", driver: 14 }),
    full({ id: 1, end_time: "17:30:00", driver: 12 }),
    full({ id: 3, date: "2026-11-21", driver: null }),
  ];
  const out = u.buildEditDays(orig, ["2026-11-20", "2026-11-20", "2026-11-21"], (date) => ({
    date, day_type: "full_day", start_time: "10:00:00", end_time: "18:00:00", end_next_day: false, notes: null, client_rate: "1.00", driver_rate: "2.00",
  }));
  assert.strictEqual(out.length, 3);
  assert.deepStrictEqual(out.slice(0, 2).map((r) => [r.start_time, r.end_time, r.end_next_day, r.driver, r.client_rate]),
    [["09:00:00", "17:30:00", false, 12, "6500.00"], ["17:30:00", "02:00:00", true, 14, "0.00"]]);
  assert.strictEqual(out[2].start_time, "10:00:00");
  assert.strictEqual(out[2].driver, null);
  assert.deepStrictEqual([...u.splitDateSet(orig)], ["2026-11-20"]);
  assert.deepStrictEqual(u.uniqueSortedDates(orig), ["2026-11-20", "2026-11-21"]);
  const old = u.buildEditDays([full({ id: 9 })], ["2026-11-20"], (date) => ({ date, day_type: "full_day", client_rate: "1", driver_rate: "1" }));
  assert.ok(!("driver" in old[0]));
  console.log("edit round-trip OK");
}

// Merged cards: one per booking (or same car + group) per date.
{
  const car = (id) => ({ id, title: "Car " + id });
  const bk = (o) => ({ id: 1, group_id: null, car: car(1), days: [], ...o });
  const d = (o) => day(o);
  // split same date
  const split = bk({ id: 1, days: [d({ id: 1, end_time: "13:00:00" }), d({ id: 2, start_time: "13:00:00", end_time: "21:00:00" })] });
  let cards = u.dayCardsForDate([split], "2026-11-20");
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].entries.length, 2);
  assert.deepStrictEqual(u.cardWindow(cards[0].entries), { start: "09:00:00", end: "21:00:00", endNextDay: false });
  // overnight split: one card on day 1, one tail card on day 2
  const over = bk({ id: 2, days: [d({ id: 3, end_time: "17:30:00" }), d({ id: 4, start_time: "17:30:00", end_time: "02:00:00", end_next_day: true })] });
  cards = u.dayCardsForDate([over], "2026-11-20");
  assert.strictEqual(cards.length, 1);
  assert.deepStrictEqual(u.cardWindow(cards[0].entries), { start: "09:00:00", end: "02:00:00", endNextDay: true });
  cards = u.dayCardsForDate([over], "2026-11-21");
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].entries.length, 0);
  assert.strictEqual(u.dayCardsForDate([over], "2026-11-22").length, 0);
  // separate bookings, same car + group: one card, taps to group
  const a = bk({ id: 10, group_id: 5, days: [d({ id: 5, end_time: "13:00:00" })] });
  const b2 = bk({ id: 11, group_id: 5, days: [d({ id: 6, start_time: "13:00:00", end_time: "21:00:00" })] });
  cards = u.dayCardsForDate([b2, a], "2026-11-20");
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].groupId, 5);
  assert.strictEqual(cards[0].firstBooking.id, 10);
  assert.deepStrictEqual(cards[0].entries.map((e) => e.booking.id), [10, 11]);
  // different cars in the same group stay separate
  const c2 = bk({ id: 12, group_id: 5, car: car(2), days: [d({ id: 7 })] });
  assert.strictEqual(u.dayCardsForDate([a, c2], "2026-11-20").length, 2);
  // same car, no group: separate
  const n1 = bk({ id: 20, days: [d({ id: 8 })] }), n2 = bk({ id: 21, days: [d({ id: 9 })] });
  assert.strictEqual(u.dayCardsForDate([n1, n2], "2026-11-20").length, 2);
  // single shift driver view
  assert.strictEqual(u.dayCardsForDate([n1], "2026-11-20")[0].entries.length, 1);
  assert.strictEqual(u.mergeByKey([1, 2, 3], (n) => String(n % 2)).length, 2);
  console.log("dayCards OK");
}
