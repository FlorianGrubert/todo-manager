# Project Overview

- This project contains a product called "FG To-Do-Manager".
- The system is developed in Node.JS.
- The database backend is flexible to support SQLite or PostgreSQL. You can switch in Runtime from SQLite to PostgreSQL but not the other way around.

# Translations
- The application is provided in german and english. Maintain bouth languages when updating texts.

# Documentation
- Requirements documentation is written in "documentation/overall-requirements.md".
- Read all documentation carefully and follow the architecture given there.
- If your change is against the definition in the documentation, you have to
  change or extend the documentation accordingly.
- "README.md" is meant for an administrator. It must not
  contain information about development internals
  but only about usage, installation and configuration.
- 

# Rules
- Keep changes small and only in the required scope.
- Test your code for linter errors.
- Before you finish: documentation updated, version(s) bumped, build rebuilt
  and committed, German translations added, tests/linter run.
- Never commit your your changes to git automatically. I want to review of changes before being commited.
