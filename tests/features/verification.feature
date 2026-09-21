Feature: Stargate Milestone Progression and Verification System
  As a Star Technology server member and verifier
  I want a modal-based verification workflow with channel gating and automatic milestone role assignment
  So that progression runs (CSG, ASG, DSG) are verified fairly and authenticated by verifiers

  Scenario: Validating verification submission channel and thread permissions
    Given allowed verification channels ["screenshots", "panoramas"]
    When verification is attempted in channel "general"
    Then the channel is rejected as an invalid verification channel
    When verification is attempted in channel "screenshots" or a thread inside "screenshots"
    Then the channel is accepted as a valid verification channel

  Scenario: Verifier permission and role validation
    Given a user with Administrator permissions or the configured Verifier role
    When isVerifier check is executed
    Then the user is recognized as an authorized verifier
    When a regular member without staff roles is checked
    Then the user is rejected as an unauthorized verifier

  Scenario Outline: Resolving Stargate milestone roles from progression codes
    When progression code "<Code>" is resolved
    Then the matched stargate role is "<ExpectedRole>"

    Examples:
      | Code | ExpectedRole |
      | csg  | CSG Gate Run |
      | asg  | ASG Gate Run |
      | dsg  | DSG Gate Run |

  Scenario: Building verification modal form
    When buildVerificationForm is called
    Then custom_id is "verification_modal" and includes fields for character name, gate tier, and run proof links

  Scenario: Completing verification assigns role and logs confirmation
    Given a pending verification submission for user "user_runner" with tier "CSG"
    When an authorized verifier approves the verification
    Then the "CSG Gate Run" role is assigned to "user_runner"
    And a confirmation message is posted with verifier attribution
