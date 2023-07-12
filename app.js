const WebSocket = require('ws')
const http = require('http');
const ejs = require('ejs');
const dotenv = require('dotenv');
dotenv.config();

const HTTP_ADDRESS = process.env.HTTP_ADDRESS || "127.0.0.1";
const HTTP_PORT = process.env.HTTP_PORT || 8080;

const TCP_ADDRESS = process.env.TCP_ADDRESS || "127.0.0.1";
const TCP_PORT = process.env.TCP_PORT || 3000;

var g_latestImageData = null;
var g_count = null;


const wss = new WebSocket.Server({ port: TCP_PORT });
wss.on('connection', (ws) => {
    console.log('Connected to a client');

    ws.on('message', (message) => {
        offset = 8;
        const height = message.readUInt32LE(offset); offset += 4;
        const width = message.readUInt32LE(offset); offset += 4;
        const number = message.readUInt32LE(offset); offset += 4;
        const time = message.readBigUInt64LE(offset); offset += 8;
        const size = message.readBigUInt64LE(offset); offset += 8;
        //console.log(`height: ${height}, width: ${width}, number: ${number}, time: ${time}, size: ${size}`);
        g_latestImageData = Buffer.allocUnsafe(Number(size));
        message.copy(g_latestImageData, 0, offset, message.length);
        g_count = number;
        console.log(g_latestImageData);
    });
});

const httpServer = http.createServer((req, res) => {
    if (req.url === '/stream') {
        res.statusCode = 200;
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("connection", "keep-alive");
        res.setHeader("Content-Type", "text/event-stream");
        setInterval(() => {
            if (g_latestImageData !== null && g_count !== null) {
                const data = JSON.stringify({ image: g_latestImageData.toString('base64'), count: g_count });
                res.write(`data: ${data}\n\n`);
            }
        }, 150);
    }
    else {
        ejs.renderFile("index.ejs", { httpAddress: HTTP_ADDRESS, httpPort: HTTP_PORT }, {}, (err, template) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Internal Server Error: ${err.message}`);
            }
            else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(template);
            }
        });
    }
});

httpServer.listen(HTTP_PORT, HTTP_ADDRESS, () => {
    console.log(`http server running at ${HTTP_ADDRESS}:${HTTP_PORT}`);
});