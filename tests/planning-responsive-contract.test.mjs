import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source-level layout guards only: these do not replace browser geometry tests.
const read = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');

test('dashboard shell may shrink and its mobile header may wrap', () => {
  const source = read('app/dashboard/layout.tsx');
  assert.match(source, /<SidebarInset className="[^"]*min-w-0/);
  assert.match(source, /flex-wrap items-center justify-between[^"\n]*sm:flex-nowrap/);
  assert.match(source, /min-h-20 px-4 py-2 sm:h-20 sm:px-8 sm:py-0/);
});

test('mobile planning does not impose the desktop viewport height', () => {
  const source = read('app/dashboard/planning/page.tsx');
  assert.match(source, /min-h-screen lg:h-\[calc\(100vh-theme\(spacing\.16\)\)\] lg:min-h-0/);
  // FullCalendar height="100%" requires a definite height, not just min-height.
  assert.match(read('components/dashboard/planning/PlanningCalendar.tsx'), /h-\[40rem\] shrink-0 lg:h-auto lg:flex-1 lg:min-h-0/);
});

test('publication filters and calendar toolbar can wrap on small screens', () => {
  assert.match(read('components/dashboard/planning/PlanningFilters.tsx'), /flex max-w-full flex-wrap items-center/);
  assert.match(read('components/dashboard/planning/PlanningCalendar.tsx'), /@media \(max-width: 767px\)\s*\{\s*\.excel-grid \.fc-header-toolbar\s*\{\s*flex-wrap: wrap;/);
});
