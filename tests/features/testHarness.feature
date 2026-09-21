Feature: Test Harness Execution, Skippable Tests, Priority Scheduling, and Dry Run Mode
  As a developer and CI workflow engineer
  I want a robust test harness with skippable tests, priority ordering, and fast dry-run iteration
  So that automated tests run reliably in local development and continuous integration

  Scenario: Standard test case execution and error propagation
    Given a valid test function asserting truthy conditions
    When runTestCase is called with the test function
    Then the test logs "[TEST]" and "[PASS]"
    When a failing test case throwing an assertion error is executed
    Then the error is caught and propagated to the test runner

  Scenario: Skippable test is skipped when --skip flag is active
    Given the environment variable SKIP_SKIPPABLE is set to "true"
    When runTestCase is called with a skippable option "{ skippable: true }"
    Then the test function is not executed
    And a "[SKIP]" message is logged to output

  Scenario: Skippable test runs normally when --skip flag is inactive
    Given the environment variable SKIP_SKIPPABLE is not set and "--skip" is not passed
    When runTestCase is called with a skippable option
    Then the test function is executed and logs "[PASS]"

  Scenario Outline: Parsing suite priority from test file content
    When file content contains "<Declaration>"
    Then parseSuitePriority returns <ExpectedPriority>

    Examples:
      | Declaration                         | ExpectedPriority |
      | export const priority = 10;         | 10               |
      | export const priority: number = -5; | -5               |
      | export const suitePriority = 25;    | 25               |
      | // @priority 15                     | 15               |
      | // @priority: -1                    | -1               |
      | // priority: 50                     | 50               |
      | /* @priority 42 */                  | 42               |
      | ordinary content without priority   | 0                |

  Scenario: Sorting test suites by priority and disabling negative priority suites
    Given test suites with priorities:
      | File                  | Priority |
      | b_normal.test.ts      | 0        |
      | a_normal.test.ts      | 0        |
      | high_prio.test.ts     | 50       |
      | very_high.test.ts     | 100      |
      | disabled_two.test.ts  | -2       |
      | disabled_one.test.ts  | -1       |
      | medium_prio_b.test.ts | 25       |
      | medium_prio_a.test.ts | 25       |
    When sortTestSuites is executed
    Then the enabled suites execute in order:
      | File                  |
      | very_high.test.ts     |
      | high_prio.test.ts     |
      | medium_prio_a.test.ts |
      | medium_prio_b.test.ts |
      | a_normal.test.ts      |
      | b_normal.test.ts      |
    And the disabled list contains ["disabled_one.test.ts", "disabled_two.test.ts"]

  Scenario: Detecting dry run mode from CLI flags and environment variables
    When process.argv includes "--dry-run" or "-d" or process.env.DRY_RUN is "true"
    Then isDryRunEnabled returns true
    And the test runner filters execution to only "testHarness.test.ts"
