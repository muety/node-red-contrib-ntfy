module.exports = function(RED) {
    "use strict";

    function NtfyUpdateNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.serverConfigNode = RED.nodes.getNode(config.serverConfig);
        this.command = config.command;
        this.topic = config.topic;
        this.sequenceId = config.sequenceId;
        this.insecure = config.insecure || false;

        let node = this;

        if (!node.serverConfigNode || !node.serverConfigNode.server) {
            node.error("Ntfy server configuration is missing or incomplete.");
            node.status({fill:"red", shape:"ring", text:"config error"});
            return;
        }

        const ntfyServerBaseUrl = node.serverConfigNode.server;

        node.on('input', async function(msg, send, done) {
            const command = (msg.command || node.command || "clear").toLowerCase();
            const topic = msg.topic || node.topic;
            const sequenceId = msg["sequence-id"] || node.sequenceId;

            if (!topic) {
                node.error("Topic not configured or provided in msg.topic", msg);
                node.status({fill:"red", shape:"ring", text:"no topic"});
                if (done) { done(); }
                return;
            }

            if (!sequenceId) {
                node.error("Sequence ID is required for update operations", msg);
                node.status({fill:"red", shape:"ring", text:"no sequenceId"});
                if (done) { done(); }
                return;
            }

            const headers = {};
            if (node.serverConfigNode.accessToken) {
                headers['Authorization'] = `Bearer ${node.serverConfigNode.accessToken}`;
            } else if (node.serverConfigNode.username && node.serverConfigNode.password) {
                const B64 = Buffer.from(`${node.serverConfigNode.username}:${node.serverConfigNode.password}`).toString('base64');
                headers['Authorization'] = `Basic ${B64}`;
            }
            headers['X-sequence-id'] = sequenceId;

            let method, url;
            if (command === "clear") {
                method = "PUT";
                url = `${ntfyServerBaseUrl}/${topic}/${sequenceId}/clear`;
            } else if (command === "delete") {
                method = "DELETE";
                url = `${ntfyServerBaseUrl}/${topic}/${sequenceId}`;
            } else {
                node.error("Invalid command. Must be 'clear' or 'delete'", msg);
                node.status({fill:"red", shape:"ring", text:"invalid command"});
                if (done) { done(); }
                return;
            }

            const fetchOptions = {
                method: method,
                headers: headers
            };

            let tlsDisabled = false;
            let prevTlsReject;
            if (url.startsWith('https://') && node.insecure) {
                tlsDisabled = true;
                prevTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
                process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            }

            node.status({fill:"blue", shape:"dot", text:`${command}...`});

            try {
                const response = await fetch(url, fetchOptions);
                if (!response.ok) {
                    const errorBody = await response.text();
                    node.error(`Ntfy API error: ${response.status} ${response.statusText} - ${errorBody}`, msg);
                    node.status({fill:"red", shape:"ring", text:`API error ${response.status}`});
                } else {
                    node.status({fill:"green", shape:"dot", text:`${command} sent`});
                }
            } catch (err) {
                node.error(`Failed to send Ntfy update: ${err.message}`, msg);
                node.status({fill:"red", shape:"ring", text:"send error"});
            } finally {
                if (tlsDisabled) {
                    if (prevTlsReject === undefined) {
                        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
                    } else {
                        process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTlsReject;
                    }
                }
            }
            if (done) { done(); }
        });

        node.on('close', function() {
            node.status({});
        });
    }
    RED.nodes.registerType("ntfy-update", NtfyUpdateNode);
}
