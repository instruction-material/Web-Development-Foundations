import express from "express";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {Server} from "socket.io";


const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = Number(process.env.PORT ?? 3003);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.static(path.join(__dirname, "../public")));

io.on("connection", socket => {
	socket.on("chat:message", value => {
		io.emit("chat:message", value);
	});
});

server.listen(port, () => {
	console.log(`Realtime chat listening on http://localhost:${port}`);
});

