# Node-RED Contrib Ntfy

A Node-RED node to send notifications to an [Ntfy](https://ntfy.sh/) server. Requires Node.js >= 18.x.

## What's new in this fork?

Forked from [youzer-name/node-red-contrib-ntfy](https://github.com/youzer-name/node-red-contrib-ntfy), which forked from the original [fetuffani-lab/node-red-contrib-ntfy](https://github.com/fetuffani-lab/node-red-contrib-ntfy).

### Changes
* Enhanced Message Properties
   - `markdown` (boolean): Enables Markdown formatting.
   - `sequenceId`: Set sequence ID for notification.  Enables update/delete/clear commands.
       - Send another message with the same sequenceId to update an existing notification
       - Use the clear/delete node with the same sequenceId to clear or delete a notification
* Added ntfy update node
    - Use this node to clear or delete an existing notification
* Change to property override logic
    - Values set in the node editor now take precedence over values in the incoming message
        - This means an incoming message with a msg.topic set will not override the configured ntfy topic
* Support non-ASCII title characters
    - Umlauts or other Unicode characters were not sent correctly via the title header
* Use global `fetch`
    - Drop dependency on `node-fetch` in favor of using Node's built-in `fetch`-compatible HTTP client

## Installation

You can install this fork directly from GitHub:

```bash
npm install muety/node-red-contrib-ntfy
```

Or, if you want to use the original version, use the Node-RED Palette Manager or:

```bash
npm install node-red-contrib-ntfy
```
