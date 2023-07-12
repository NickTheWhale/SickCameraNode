const net = require('net');
const http = require('http');
const ejs = require('ejs');
const dotenv = require('dotenv');
dotenv.config();

const HTTP_ADDRESS = process.env.HTTP_ADDRESS || "127.0.0.1";
const HTTP_PORT = process.env.HTTP_PORT || 8080;

const TCP_ADDRESS = process.env.TCP_ADDRESS || "127.0.0.1";
const TCP_PORT = process.env.TCP_PORT || 3000;

var g_imageData = null;
var g_latestImageData = null;
var g_count = null;

function handleData(data) {
    try {
        var offset = 0;
        if (isPacketStart(data, offset)) {
            offset += 8;
            const height = data.readUInt32LE(offset); offset += 4;
            const width = data.readUInt32LE(offset); offset += 4;
            const number = data.readUInt32LE(offset); offset += 4;
            const time = data.readBigUInt64LE(offset); offset += 8;
            const size = data.readBigUInt64LE(offset); offset += 8;
            //console.log(`height: ${height}, width: ${width}, number: ${number}, time: ${time}, size: ${size}`);
            g_count = number;
            g_imageData = Buffer.allocUnsafe(Number(size));
            data.copy(g_imageData, 0, offset);
        }
        if (g_imageData) {
            const remainingSize = g_imageData.length - g_imageData.byteOffset - g_imageData.length;
            const dataSize = Math.min(data.length, remainingSize);
            data.copy(g_imageData, g_imageData.byteOffset + g_imageData.length - remainingSize, 0, dataSize);

            if (dataSize < remainingSize) {
                g_imageData = g_imageData.slice(0, g_imageData.byteOffset + g_imageData.length - remainingSize + dataSize);
            } else {
                g_latestImageData = Buffer.copyBytesFrom(g_imageData);
                g_imageData = null;
            }
        }
    }
    catch (error) {
        console.error(error?.message ?? "handleData() failed");
    }
}

function isPacketStart(data, offset) {
    ret = false
    if (data.byteLength >= 8) {
        ret = data[offset++] === 0
            && data[offset++] === 255
            && data[offset++] === 0
            && data[offset++] === 255
            && data[offset++] === 0
            && data[offset++] === 255
            && data[offset++] === 0
            && data[offset++] === 255;
    }
    return ret;
}

const tcpServer = net.createServer((socket) => {
    socket.on('data', handleData);
    socket.on('error', (err) => { console.error('tcp socket error', err); });
});

tcpServer.on('error', (err) => {
    console.error('tcp server error:', err);
});

tcpServer.listen(TCP_PORT, TCP_ADDRESS, () => {
    console.log(`tcp server listening at ${TCP_ADDRESS}:${TCP_PORT}`);
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