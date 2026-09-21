Feature: Google Drive Backup and Data Restoration Service
  As a bot administrator
  I want automated and on-demand compressed backups of the data directory to Google Drive
  So that persistent bot state can be safely archived and restored without data loss

  Background:
    Given a temporary directory containing test files, nested subdirectories, and binary data

  Scenario: Tar archive compression and extraction maintains full directory integrity
    When the directory is packed into a ".tar.gz" archive
    Then the archive file exists on disk and is non-empty
    When the archive is unpacked to a target extraction directory
    Then all files, nested paths, text contents, and binary data match the original directory

  Scenario: Google Drive client creates valid JWT authorization tokens
    Given a Google Drive service account configuration with an RSA key pair
    When an authentication JWT is generated for scope "https://www.googleapis.com/auth/drive"
    Then the JWT has a valid 3-part header, payload, and signature format
    And the payload contains the service account email, target scope, and validity timestamps

  Scenario: Google Drive client file search query formatting
    Given a Google Drive folder ID "test_folder_123"
    When query is built for prefix "komaru_backup_" within the folder
    Then the query string enforces folder parent, prefix matching, and trashed=false conditions

  Scenario: BackupService generates formatted timestamped archive filenames
    When a backup archive filename is generated
    Then the filename follows the format "komaru_backup_YYYY-MM-DD_HH-mm-ss.tar.gz"

  Scenario: Scheduled automatic backups trigger and rotate old archives
    Given an initialized BackupService with Google Drive client and max retention of 5 backups
    When an automated backup cycle executes
    Then the data directory is compressed and uploaded to Google Drive
    And any backups exceeding the retention limit are pruned from the remote folder

  Scenario: Live backup restoration reloads module configurations
    Given a valid backup archive stored in Google Drive
    When the administrator executes a restore operation for the archive
    Then the local data directory is updated from the archive
    And in-memory bot modules and JSON configs are reloaded with the restored state
