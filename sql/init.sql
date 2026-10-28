-- Local development and integration-test databases only.
CREATE DATABASE IF NOT EXISTS atdrive_test;
GRANT ALL PRIVILEGES ON atdrive_test.* TO 'atdrive'@'%';
