# Intervals

Interval problems almost always start with sorting by start time. Key patterns: merge overlapping, sweep line for counting, and greedy for non-overlapping.

---

## Problem 1: Merge Intervals

```ts
// Sort by start, merge overlapping intervals.
// Time: O(n log n), Space: O(n)

function mergeIntervals(intervals: number[][]): number[][] {
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [intervals[0]];

  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    const cur = intervals[i];

    if (cur[0] <= last[1]) {
      // Overlapping — extend the end
      last[1] = Math.max(last[1], cur[1]);
    } else {
      merged.push(cur);
    }
  }

  return merged;
}

console.log(mergeIntervals([[1,3],[2,6],[8,10],[15,18]]));
// [[1,6],[8,10],[15,18]]
console.log(mergeIntervals([[1,4],[4,5]]));
// [[1,5]]
```

---

## Problem 2: Insert Interval

```ts
// Insert newInterval into sorted non-overlapping intervals, merge if needed.
// Time: O(n), Space: O(n)

function insertInterval(intervals: number[][], newInterval: number[]): number[][] {
  const result: number[][] = [];
  let i = 0;

  // Add all intervals ending before newInterval starts
  while (i < intervals.length && intervals[i][1] < newInterval[0]) {
    result.push(intervals[i]);
    i++;
  }

  // Merge all overlapping intervals with newInterval
  while (i < intervals.length && intervals[i][0] <= newInterval[1]) {
    newInterval[0] = Math.min(newInterval[0], intervals[i][0]);
    newInterval[1] = Math.max(newInterval[1], intervals[i][1]);
    i++;
  }
  result.push(newInterval);

  // Add remaining intervals
  while (i < intervals.length) {
    result.push(intervals[i]);
    i++;
  }

  return result;
}

console.log(insertInterval([[1,3],[6,9]], [2,5]));
// [[1,5],[6,9]]
console.log(insertInterval([[1,2],[3,5],[6,7],[8,10],[12,16]], [4,8]));
// [[1,2],[3,10],[12,16]]
```

---

## Problem 3: Non-Overlapping Intervals

```ts
// Minimum number of intervals to remove so the rest don't overlap.
// Greedy: sort by end time, always keep the interval that ends earliest.
// Time: O(n log n), Space: O(1)

function eraseOverlapIntervals(intervals: number[][]): number {
  intervals.sort((a, b) => a[1] - b[1]); // sort by end time
  let removals = 0;
  let prevEnd = -Infinity;

  for (const [start, end] of intervals) {
    if (start < prevEnd) {
      // Overlap — remove this interval (keep the one ending earlier)
      removals++;
    } else {
      prevEnd = end;
    }
  }

  return removals;
}

console.log(eraseOverlapIntervals([[1,2],[2,3],[3,4],[1,3]])); // 1
console.log(eraseOverlapIntervals([[1,2],[1,2],[1,2]]));       // 2
console.log(eraseOverlapIntervals([[1,2],[2,3]]));             // 0
```

---

## Problem 4: Meeting Rooms (Can Attend All?)

```ts
// Can a person attend all meetings? Check for any overlap.
// Time: O(n log n), Space: O(1)

function canAttendMeetings(intervals: number[][]): boolean {
  intervals.sort((a, b) => a[0] - b[0]);

  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i][0] < intervals[i - 1][1]) {
      return false; // overlap found
    }
  }

  return true;
}

console.log(canAttendMeetings([[0,30],[5,10],[15,20]])); // false
console.log(canAttendMeetings([[7,10],[2,4]]));           // true
```

---

## Problem 5: Meeting Rooms II — Sweep Line

```ts
// How many rooms needed? Sweep line: +1 at start, -1 at end.
// Sort events, track running count.
// Time: O(n log n), Space: O(n)

function minMeetingRooms(intervals: number[][]): number {
  const events: [number, number][] = [];

  for (const [start, end] of intervals) {
    events.push([start, 1]);  // meeting starts
    events.push([end, -1]);   // meeting ends
  }

  // Sort by time; if tie, end (-1) before start (+1)
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let rooms = 0;
  let maxRooms = 0;

  for (const [, delta] of events) {
    rooms += delta;
    maxRooms = Math.max(maxRooms, rooms);
  }

  return maxRooms;
}

console.log(minMeetingRooms([[0,30],[5,10],[15,20]])); // 2
console.log(minMeetingRooms([[7,10],[2,4]]));           // 1
console.log(minMeetingRooms([[1,5],[2,3],[4,6],[7,8]])); // 2
```

---

## Problem 6: Interval List Intersections

```ts
// Two lists of disjoint sorted intervals. Find all intersections.
// Two pointers: advance the one that ends first.
// Time: O(m + n), Space: O(m + n) for result

function intervalIntersection(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [];
  let i = 0, j = 0;

  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i][0], B[j][0]);
    const hi = Math.min(A[i][1], B[j][1]);

    if (lo <= hi) {
      result.push([lo, hi]); // they overlap
    }

    // Advance the interval that ends first
    if (A[i][1] < B[j][1]) i++;
    else j++;
  }

  return result;
}

console.log(intervalIntersection(
  [[0,2],[5,10],[13,23],[24,25]],
  [[1,5],[8,12],[15,24],[25,26]]
));
// [[1,2],[5,5],[8,10],[15,23],[24,24],[25,25]]
```

---

## Problem 7: Minimum Number of Arrows to Burst Balloons

```ts
// Each balloon is an interval [start, end].
// An arrow at x bursts all balloons where start <= x <= end.
// Greedy: sort by end, shoot at the earliest end.
// Time: O(n log n), Space: O(1)

function findMinArrowShots(points: number[][]): number {
  if (points.length === 0) return 0;

  points.sort((a, b) => a[1] - b[1]); // sort by end
  let arrows = 1;
  let arrowPos = points[0][1];

  for (let i = 1; i < points.length; i++) {
    if (points[i][0] > arrowPos) {
      // This balloon is not burst by current arrow
      arrows++;
      arrowPos = points[i][1];
    }
  }

  return arrows;
}

console.log(findMinArrowShots([[10,16],[2,8],[1,6],[7,12]])); // 2
console.log(findMinArrowShots([[1,2],[3,4],[5,6],[7,8]]));     // 4
console.log(findMinArrowShots([[1,2],[2,3],[3,4],[4,5]]));     // 2
```

---

## Problem 8: Employee Free Time

```ts
// Given schedules of multiple employees (each is a list of intervals),
// find common free time across all employees.
// Approach: flatten all intervals, merge, gaps between merged = free time.
// Time: O(n log n), Space: O(n)

function employeeFreeTime(schedules: number[][][]): number[][] {
  // Flatten all intervals
  const all: number[][] = [];
  for (const schedule of schedules) {
    for (const interval of schedule) {
      all.push(interval);
    }
  }

  // Sort by start time
  all.sort((a, b) => a[0] - b[0]);

  // Merge intervals
  const merged: number[][] = [all[0]];
  for (let i = 1; i < all.length; i++) {
    const last = merged[merged.length - 1];
    if (all[i][0] <= last[1]) {
      last[1] = Math.max(last[1], all[i][1]);
    } else {
      merged.push(all[i]);
    }
  }

  // Gaps between merged intervals are free time
  const free: number[][] = [];
  for (let i = 1; i < merged.length; i++) {
    free.push([merged[i - 1][1], merged[i][0]]);
  }

  return free;
}

console.log(employeeFreeTime([
  [[1,2],[5,6]],
  [[1,3]],
  [[4,10]]
]));
// [[3,4]]

console.log(employeeFreeTime([
  [[1,3],[6,7]],
  [[2,4]],
  [[2,5],[9,12]]
]));
// [[5,6],[7,9]]
```

---

## Interval Patterns Summary

```
Problem                    Approach                 Sort by
---------------------------------------------------------------
Merge intervals            Merge overlapping        Start time
Insert interval            Three-phase scan         Already sorted
Non-overlapping intervals  Greedy keep earliest end End time
Meeting rooms (bool)       Check adjacent overlap   Start time
Meeting rooms II (count)   Sweep line +1/-1         Event time
Interval intersections     Two pointers             Already sorted
Min arrows / balloons      Greedy shoot at end      End time
Employee free time         Flatten + merge + gaps   Start time
```
