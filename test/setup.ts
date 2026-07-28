import '@testing-library/jest-dom/vitest';

import { configure } from '@testing-library/react';

/**
 * Testing Library's default `asyncUtilTimeout` is 1000 ms, which is how long
 * `waitFor`/`findBy*` poll before failing. The component suites here render a real
 * jsdom tree and drive it with `userEvent`, and their slowest assertions land in
 * the 400-700 ms range on an idle machine — comfortably inside the default, but
 * close enough that CPU contention (a loaded CI runner, a cold Vite transform, a
 * parallel test process) can push them past it and produce a failure that has
 * nothing to do with the code under test.
 *
 * Raising the ceiling costs nothing when a test passes — `waitFor` returns as soon
 * as its condition holds, so this only changes how long a genuinely failing
 * assertion waits before reporting. It buys headroom against timing flakes without
 * weakening a single assertion.
 */
configure({ asyncUtilTimeout: 5000 });
