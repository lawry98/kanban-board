import type { Priority } from '@prisma/client';

import { DEFAULT_COLUMNS } from '@/lib/constants';

export const DEMO_BOARD_TITLE = 'Demo — Website Launch';
export const DEMO_BOARD_DESCRIPTION =
  'Sample board created by pnpm db:seed. Drag cards between columns, open one to edit labels, due dates and assignees.';

export interface DemoTaskSpec {
  title: string;
  description?: string;
  priority: Priority;
  labels: readonly string[];
  /** Days from the seed date; negative = overdue. Omitted = no due date. */
  dueInDays?: number;
  /** Assign to the board owner (the only member); otherwise unassigned. */
  assignToOwner: boolean;
}

export interface DemoColumnSpec {
  title: string;
  color: string;
  tasks: readonly DemoTaskSpec[];
}

/** `YYYY-MM-DD` + n calendar days, computed in UTC so no local DST shift can skip or repeat a day. */
export function addCalendarDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

const [TO_DO, IN_PROGRESS, REVIEW, DONE] = DEFAULT_COLUMNS;

export const DEMO_COLUMNS: readonly DemoColumnSpec[] = [
  {
    ...TO_DO,
    tasks: [
      {
        title: 'Write launch announcement post',
        description:
          'Draft the blog post and social copy announcing the new site. Pull the headline features from the pricing page and get a quick review from marketing.',
        priority: 'MEDIUM',
        labels: ['Content', 'Marketing'],
        dueInDays: 10,
        assignToOwner: true,
      },
      {
        title: 'Set up 301 redirects from old URLs',
        description:
          'Map every legacy URL to its new page so existing links and search rankings survive the cutover. Verify the list against the old sitemap.',
        priority: 'HIGH',
        labels: ['SEO', 'Infra'],
        dueInDays: 5,
        assignToOwner: false,
      },
      {
        title: 'Run accessibility audit (WCAG 2.1 AA)',
        description:
          'Check colour contrast, keyboard navigation and screen reader labels on the key pages. Log anything that fails as a follow-up card.',
        priority: 'HIGH',
        labels: ['QA', 'Accessibility'],
        dueInDays: 8,
        assignToOwner: true,
      },
      {
        title: 'Add Open Graph images',
        priority: 'LOW',
        labels: ['Design', 'SEO'],
        assignToOwner: false,
      },
    ],
  },
  {
    ...IN_PROGRESS,
    tasks: [
      {
        title: 'Build pricing page',
        description:
          'Implement the three-tier pricing layout with the monthly and annual toggle. Copy and numbers are final; the FAQ section is still missing.',
        priority: 'URGENT',
        labels: ['Frontend'],
        dueInDays: -1,
        assignToOwner: true,
      },
      {
        title: 'Migrate blog posts to the new CMS',
        description:
          'Import the 40 existing posts, preserving slugs, authors and publish dates. Spot-check formatting on the longest articles.',
        priority: 'MEDIUM',
        labels: ['Content', 'Backend'],
        dueInDays: 3,
        assignToOwner: true,
      },
      {
        title: 'Configure CDN caching rules',
        description:
          'Cache static assets for a year with fingerprinted filenames and keep HTML on a short TTL. Confirm purge works before launch day.',
        priority: 'MEDIUM',
        labels: ['Infra'],
        dueInDays: 4,
        assignToOwner: false,
      },
    ],
  },
  {
    ...REVIEW,
    tasks: [
      {
        title: 'Homepage hero redesign',
        description:
          'New hero with a shorter headline and a single call to action. Ready for design review at desktop and mobile widths.',
        priority: 'HIGH',
        labels: ['Design', 'Frontend'],
        dueInDays: 1,
        assignToOwner: true,
      },
      {
        title: 'Contact form spam protection',
        description:
          'Add a honeypot field and server-side rate limiting to the contact form. Needs a review of the false-positive handling.',
        priority: 'MEDIUM',
        labels: ['Backend', 'Security'],
        dueInDays: 2,
        assignToOwner: false,
      },
    ],
  },
  {
    ...DONE,
    tasks: [
      {
        title: 'Choose an analytics provider',
        description:
          'Compared three privacy-friendly options on cost, cookie-free tracking and data export. Decision recorded in the team wiki.',
        priority: 'LOW',
        labels: ['Research'],
        dueInDays: -7,
        assignToOwner: true,
      },
      {
        title: 'Finalize sitemap and navigation',
        description:
          'Agreed the final page hierarchy and top-level navigation labels with stakeholders. Signed off after one round of changes.',
        priority: 'MEDIUM',
        labels: ['UX', 'SEO'],
        dueInDays: -5,
        assignToOwner: true,
      },
      {
        title: 'Set up staging environment',
        description:
          'Staging deploys automatically from the main branch and mirrors production settings.',
        priority: 'NONE',
        labels: ['Infra'],
        assignToOwner: false,
      },
    ],
  },
];
