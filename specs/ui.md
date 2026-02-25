# General description
The general layout must be similar to a kanban board. It is a tile based design where eacht todo is a tile that is organized in a table-like design. The columns represent the different team members. The rows represent the different status.
The first column is called unassigned and contains all todos that are not assigned to team members.

# Components

## Tiles
Each tile represents one todo. Each ToDo is shown with the title and the first words of the description.

## Main Menu
The main menu can be opened via a button on top left. It has the following options
- Open Settings; opens the settings dialog

## Settings dialog
The settings dialog has the following options:
- Manage Team Members
    - Allows adding, renaming and deleting team members.
    - Only team members that do not have todos assigned can be deleted.
- Manage Status
    - Allows adding, renaming and deleting status.
    - Only status that do not have todos assigned can be deleted.

# Behaviour
If a tile is moved from on column to another, the assigned team member changes. If a tile is moved from one row to another, the status changes.

