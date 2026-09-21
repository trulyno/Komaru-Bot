Feature: Support Ticket System
  As a Discord server member and support staff
  I want a private modal-based ticket system with automatic category discovery and inactivity reminders
  So that user inquiries and technical support are handled securely and efficiently

  Scenario: Catifying system ticket notification text
    When plain message "System notification for ticket update." is catified
    Then the output contains cat-themed phrases like "Meow!" and "Purr!"
    When message already contains cat text "Meow! 🐾 Ticket created purr!"
    Then the message is returned unchanged

  Scenario: Building ticket modal and action rows
    When the ticket submission modal is constructed
    Then custom_id is "ticket_modal" and contains subject and description input fields
    When action row for an open ticket is built
    Then it includes archive and delete action buttons

  Scenario: Calculating private channel permissions for ticket creator and staff
    Given a ticket created by user "u1" in guild "g1" with staff role "role_mod"
    When channel permission overwrites are calculated
    Then @everyone is denied VIEW_CHANNEL permission
    And creator "u1" is granted VIEW_CHANNEL, SEND_MESSAGES, and ATTACH_FILES
    And staff role "role_mod" is granted channel management permissions

  Scenario: Full ticket lifecycle (creation, archiving, activity update, and deletion)
    Given an open ticket "#0001"
    When user sends a message in the ticket channel
    Then the ticket lastActivityAt timestamp is updated
    When staff archives ticket "#0001"
    Then the ticket status changes to "archived"
    When staff deletes ticket "#0001"
    Then the ticket is permanently removed from persistent storage

  Scenario: Inactivity reminder triggers on old unresolved tickets
    Given an open ticket with no activity for 48 hours
    And ticket inactivity reminder threshold is set to 24 hours
    When checkInactivityReminders executes
    Then an inactivity reminder notification is posted in the ticket channel

  Scenario: Auto-discovery and creation of dedicated ticket category
    Given a guild without a pre-configured ticket category
    When getOrCreateTicketCategory is called
    Then the bot auto-creates a private "Tickets" category channel and caches its ID
