Feature: Issue and Suggestion Template Detection
  As a support moderator
  I want automatic detection of required fields in forum posts and support channels
  So that incomplete tickets and bug reports are flagged for missing information

  Scenario: Normalizing template markdown formatting
    Given raw post content with markdown formatting "**Modpack version:** Theta 1\n**Packmode:** hardmode"
    When the text is normalized for template field matching
    Then bold, italic, underline, and code block formatting are stripped
    And normalized field keys like "modpack version" and "packmode" are detected

  Scenario: Detecting complete template coverage
    Given post content containing:
      """
      **Modpack version:** Theta 1 Hotfix 3
      *Packmode:* hardmode
      __Is on server:__ yes
      ***Description:*** Game crashes on launching rocket
      """
    And required fields ["modpack version", "packmode", "is on server", "description"]
    When template coverage is evaluated
    Then coverage status is complete
    And the missing fields list is empty

  Scenario: Detecting incomplete template and identifying missing fields
    Given post content containing:
      """
      **Modpack version:** Theta 1 Hotfix 3
      **Packmode:** hardmode
      **Description:** Issue report
      """
    And required fields ["modpack version", "packmode", "is on server", "description"]
    When template coverage is evaluated
    Then coverage status is incomplete
    And the missing fields list contains ["is on server"]
