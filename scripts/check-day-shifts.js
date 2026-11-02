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
