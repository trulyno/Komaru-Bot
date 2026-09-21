Feature: Math Calculator and Expression Evaluator
  As a Discord user
  I want safe, cat-themed math calculation with variables, functions, and memory slots
  So that I can evaluate mathematical expressions without risk of injection or errors

  Scenario Outline: Evaluating standard mathematical expressions
    When math expression "<Expression>" is evaluated
    Then the calculated result should equal <Result>

    Examples:
      | Expression     | Result |
      | 2 + 3 * 4      | 14     |
      | (2 + 3) * 4    | 20     |
      | 2^3            | 8      |
      | -5 + 3         | -2     |
      | 10 / 2         | 5      |

  Scenario: Evaluating expressions with named variables and functions
    Given variable "x" equals 5 and variable "y" equals 10
    When expression "x + y * 2" is evaluated
    Then the calculated result should equal 25
    Given variable "val" equals 16
    When expression "sqrt(val)" is evaluated
    Then the calculated result should equal 4

  Scenario: Evaluating expressions with memory slots and bracket aliases
    Given memory array slot 0 contains 10
    When expression "remember [0] + 5" is evaluated
    Then the calculated result should equal 15
    Given memory array contains [3, 4]
    When expression "[0] * [1]" is evaluated
    Then the calculated result should equal 12
    Given memory array contains [0, 6] with alias "test" mapping to index 1
    When expression "[test] * 2" is evaluated
    Then the calculated result should equal 12

  Scenario: Handling malformed syntax and malicious input safely
    When expression "2 + (3 - 1" is evaluated
    Then a syntax error "Unexpected end" is thrown
    When expression "2 + process.exit(1)" is evaluated
    Then a security error "Unknown identifier" is thrown

  Scenario: Extracting math expressions from chat messages
    When message "!calc 4 + 5" is inspected for calculator commands
    Then the extracted expression is "4 + 5"
    When message "hello there" is inspected for calculator commands
    Then no math expression is found

  Scenario: Formatting calculated results with cat-themed responses
    When expression "2 + 2" is evaluated to result 4
    And the result is formatted using catified styling
    Then the response contains "4" and cat-themed embellishments
