module.exports = function(RED) {
    "use strict";

    function encodeRFC2047(str) {
        if (typeof str !== 'string' || /^[\x00-\x7F]*$/.test(str)) {
            return str;
        }
        return `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`;
    }

    function NtfyNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.serverConfigNode = RED.nodes.getNode(config.serverConfig);
        this.topic = config.topic;
        this.priority = config.priority;
        this.title = config.title;
        this.message = config.message;
        this.tags = config.tags;
        this.icon = config.icon;
        this.click = config.click;
        this.attach = config.attach;
        this.filename = config.filename;
        this.actions = config.actions; // Expects a string, potentially multi-line
        this.email = config.email;
        this.delay = config.delay;
        this.cache = config.cache;
        this.firebase = config.firebase;
        this.sequenceId = config.sequenceId;
        this.insecure = config.insecure || false;
        this.markdown = config.markdown || false;

        let node = this;

        if (!node.serverConfigNode || !node.serverConfigNode.server) {
            node.error("Ntfy server configuration is missing or incomplete.");
            node.status({fill:"red", shape:"ring", text:"config error"});
            return;
        }
        
        const ntfyServerBaseUrl = node.serverConfigNode.server;

        node.on('input', async function(msg, send, done) {
            // Helper to determine if the node config has a valid override
            const getVal = (configVal, msgVal) => {
                return (configVal !== undefined && configVal !== null && configVal.toString().trim() !== "") 
                    ? configVal 
                    : msgVal;
            };

            // Markdown: allow override by msg.markdown, else use node config
            let markdown = (typeof msg.markdown !== 'undefined') ? !!msg.markdown : !!node.markdown;

            const topic = getVal(node.topic, msg.topic);
            const title = getVal(node.title, msg.title);
            const priority = getVal(node.priority, msg.priority);
            const tags = getVal(node.tags, msg.tags);
            const iconUrl = getVal(node.icon, msg.icon);
            const clickUrl = getVal(node.click, msg.click);
            const attachUrl = getVal(node.attach, msg.attach);
            const filename = getVal(node.filename, msg.filename);
            const actions = getVal(node.actions, msg.actions);
            const email = getVal(node.email, msg.email);
            const delay = getVal(node.delay, msg.delay);
            const cache = getVal(node.cache, msg.cache);
            const firebase = getVal(node.firebase, msg.firebase);
            const sequenceId = getVal(node.sequenceId, msg["sequence-id"]);

            // Fixed messageBody logic: fall back to payload if node.message is empty string or undefined
            let rawBody = (node.message !== undefined && node.message.trim() !== "") ? node.message : msg.payload;
            let messageBody = (rawBody !== undefined && rawBody !== null) 
                ? (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)) 
                : undefined;
            if (!topic) {
                node.error("Topic not configured or provided in msg.topic", msg);
                node.status({fill:"red", shape:"ring", text:"no topic"});
                if (done) { done(); }
                return;
            }

            // Ntfy expects the message in the request body. Other parameters are headers.
            const headers = {};
            if (markdown) headers['X-Markdown'] = 'true';
            if (title) headers['Title'] = encodeRFC2047(title);
            if (priority) headers['Priority'] = priority.toString();
            
            if (tags) {
                if (Array.isArray(tags)) {
                    headers['Tags'] = tags.map(t => encodeRFC2047(t)).join(',');
                } else if (typeof tags === 'string') {
                    headers['Tags'] = encodeRFC2047(tags);
                }
            }
            if (iconUrl) headers['Icon'] = encodeRFC2047(iconUrl);
            if (clickUrl) headers['Click'] = encodeRFC2047(clickUrl);
            if (attachUrl) headers['Attach'] = encodeRFC2047(attachUrl);
            if (filename && attachUrl) headers['Filename'] = encodeRFC2047(filename); // Filename is only useful with Attach
            if (email) headers['Email'] = email;
            if (delay) headers['Delay'] = delay;
            if (cache) headers['Cache'] = cache;
            if (firebase) headers['Firebase'] = firebase;
            if (sequenceId) headers['X-sequence-id'] = sequenceId;

            if (actions) {
                let formattedActions = "";
                if (typeof actions === 'string') {
                    formattedActions = actions.trim(); // Use directly if string (e.g. from config textarea)
                } else if (Array.isArray(actions)) {
                    // If msg.actions is an array, try to format it.
                    // Each item could be a pre-formatted string or an object {type, label, url, clear?, ...}
                    formattedActions = actions.map(action => {
                        if (typeof action === 'string') return action;
                        if (typeof action === 'object' && action.type && action.label && action.url) {
                            let actionStr = `${action.type}, ${action.label}, ${action.url}`;
                            if (action.clear !== undefined) actionStr += `, clear=${action.clear}`;
                            // Basic support for method, headers, body if provided as strings
                            if (action.method) actionStr += `, method=${action.method}`;
                            if (action.headers) actionStr += `, headers=${typeof action.headers === 'string' ? action.headers : JSON.stringify(action.headers)}`;
                            if (action.body) actionStr += `, body=${typeof action.body === 'string' ? action.body : JSON.stringify(action.body)}`;
                            return actionStr;
                        }
                        return null; // Invalid action object
                    }).filter(Boolean).join('; ');
                }
                if (formattedActions) {
                    headers['Actions'] = encodeRFC2047(formattedActions);
                }
            }

            // Authentication
            if (node.serverConfigNode.accessToken) {
                headers['Authorization'] = `Bearer ${node.serverConfigNode.accessToken}`;
            } else if (node.serverConfigNode.username && node.serverConfigNode.password) {
                const B64 = Buffer.from(`${node.serverConfigNode.username}:${node.serverConfigNode.password}`).toString('base64');
                headers['Authorization'] = `Basic ${B64}`;
            }
            
            const fullUrl = `${ntfyServerBaseUrl}/${topic}`;
            
            const fetchOptions = {
                method: 'POST',
                headers: headers,
                body: messageBody || "" // ntfy allows empty body if other headers (like Title) are set
            };

            let tlsDisabled = false;
            let prevTlsReject;
            if (fullUrl.startsWith('https://') && node.insecure) {
                tlsDisabled = true;
                prevTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
                process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            }

            node.status({fill:"blue", shape:"dot", text:"sending..."});

            try {
                const response = await fetch(fullUrl, fetchOptions);
                if (!response.ok) {
                    const errorBody = await response.text();
                    node.error(`Ntfy API error: ${response.status} ${response.statusText} - ${errorBody}`, msg);
                    node.status({fill:"red", shape:"ring", text:`API error ${response.status}`});
                } else {
                    node.status({fill:"green", shape:"dot", text:"sent"});
                }
            } catch (err) {
                node.error(`Failed to send Ntfy message: ${err.message}`, msg);
                node.status({fill:"red", shape:"ring", text:"send error"});
                if (err.code === 'EPROTO' || (err.message && err.message.toLowerCase().includes('wrong version number'))) {
                    node.warn("SSL Error (EPROTO/wrong version number). Ensure server URL scheme (http/https) is correct. If using self-signed certs or specific TLS versions, 'Allow insecure HTTPS' might help for cert validation but not for protocol mismatches.");
                }
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
    RED.nodes.registerType("ntfy", NtfyNode);
}