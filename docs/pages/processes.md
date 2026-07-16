# Processes

![Processes and live logs](../screenshots/processes.png)

The process page shows commands that were started from projects or workspaces.

## Process states

| State | Meaning |
|---|---|
| Running | The command is still active |
| Successful | The command exited with code `0` |
| Failed | The command exited with a non-zero code or could not be started |
| Stopped | The command was stopped from Code Deck |

## What each entry shows

A process entry can contain:

- project name
- command label and command text
- start time
- process ID when available
- stdout and stderr output
- exit code
- stop button for active commands

## Stopping a command

Use **Stop** on the active process. Code Deck asks the operating system to terminate the process and updates the state afterwards.

Some commands start child processes of their own. If a development server remains active after stopping, check the terminal output and the operating system's process list.

## History

Finished entries remain available so recent output can be checked. Removing an entry from the history does not remove the saved project command and does not change project files.

## Common uses

- checking why a development server failed
- following test output
- stopping a long-running command
- seeing which workspace services are still active
