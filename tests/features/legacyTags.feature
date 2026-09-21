Feature: Read-Only Legacy Tag Navigation System
  As a community member
  I want to browse legacy tags with alphabetical sorting, pagination, and alias resolution
  So that legacy documentation and modpack shortcuts remain accessible

  Background:
    Given a legacy tag navigation dataset containing tags and alias mappings

  Scenario: Alphabetical sorting of all legacy tags
    When all legacy tag names are requested
    Then the tag list is sorted in case-insensitive alphabetical order

  Scenario: Tag page pagination and alias resolution
    Given a dataset with 5 tags and page size 2
    When page 1 is requested
    Then currentPage is 1, totalPages is 3, totalTags is 5, and 2 tags are returned
    And tag "alpha" includes its alias "a_alias"
    And tag "Beta" includes its alias "b_alias"

  Scenario: Tag name normalization ignores prefixes and punctuation
    When tag name "%t gt_ore" is normalized
    Then the resulting tag name is "gt_ore"

  Scenario: Handling tag messages via messageCreate listener
    Given a legacy tag message with prefix "%t"
    When the message handler processes the command
    Then the legacy tag definition is retrieved and rendered as an embed or markdown reply
