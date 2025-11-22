// server/app.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  }
});

// Map socketId -> { username, avatar, rooms: Set }
const clients = new Map();

// Helper: get socketId by username (first match)
function getSocketIdByUsername(name) {
  for (const [id, info] of clients.entries()) {
    if (info.username === name) return id;
  }
  return null;
}

function broadcastUserList() {
  const list = Array.from(clients.values()).map(({ username, avatar }) => ({ username, avatar }));
  io.emit("user_list", { users: list, count: list.length });
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Initialize client record
  clients.set(socket.id, { username: null, avatar: null, rooms: new Set() });

  // set username (and optional avatar)
  socket.on("set_username", ({ username, avatar } = {}) => {
    if (!username || typeof username !== "string") username = "Anonymous";
    const record = clients.get(socket.id) || {};
    record.username = username;
    record.avatar = avatar || null;
    clients.set(socket.id, record);
    socket.username = username;
    socket.avatar = avatar || null;

    io.emit("user_joined", { username });
    broadcastUserList();
    console.log(`Username set ${socket.id} => ${username}`);
  });

  // typing indicator (room optional)
  socket.on("typing", ({ room } = {}) => {
    const username = socket.username || "Anonymous";
    if (room) {
      socket.to(room).emit("typing", { username, room });
    } else {
      socket.broadcast.emit("typing", { username });
    }
  });

  socket.on("stop_typing", ({ room } = {}) => {
    const username = socket.username || "Anonymous";
    if (room) {
      socket.to(room).emit("stop_typing", { username, room });
    } else {
      socket.broadcast.emit("stop_typing", { username });
    }
  });

  // public message (if room specified -> room message)
  socket.on("message", ({ text, room } = {}) => {
    const username = socket.username || "Anonymous";
    const msg = { username, text, timestamp: Date.now(), room: room || null };
    if (room) {
      io.to(room).emit("room_message", msg);
      console.log("Room message:", room, msg);
    } else {
      io.emit("message", msg);
      console.log("Global message:", msg);
    }
  });

  // private message: { toUsername, text }
  socket.on("private_message", ({ toUsername, text }) => {
    const from = socket.username || "Anonymous";
    const toSocketId = getSocketIdByUsername(toUsername);
    const payload = { from, to: toUsername, text, timestamp: Date.now() };
    if (toSocketId) {
      io.to(toSocketId).emit("private_message", payload); // send to target
      socket.emit("private_message_sent", payload);        // ack to sender
      console.log("Private message from", from, "to", toUsername);
    } else {
      socket.emit("user_not_found", { toUsername });
    }
  });

  // join a room
  socket.on("join_room", ({ room }) => {
    if (!room) return;
    socket.join(room);
    const record = clients.get(socket.id) || {};
    record.rooms = record.rooms || new Set();
    record.rooms.add(room);
    clients.set(socket.id, record);
    io.to(room).emit("system_message", { text: `${socket.username || "Anonymous"} joined ${room}` });
    broadcastUserList();
    console.log(`${socket.username} joined room ${room}`);
  });

  // leave a room
  socket.on("leave_room", ({ room }) => {
    if (!room) return;
    socket.leave(room);
    const record = clients.get(socket.id);
    if (record && record.rooms) record.rooms.delete(room);
    io.to(room).emit("system_message", { text: `${socket.username || "Anonymous"} left ${room}` });
    broadcastUserList();
    console.log(`${socket.username} left room ${room}`);
  });

  socket.on("disconnect", () => {
    const rec = clients.get(socket.id) || {};
    console.log("User disconnected:", socket.id, rec.username);
    if (rec.username) {
      io.emit("user_left", { username: rec.username });
    }
    clients.delete(socket.id);
    broadcastUserList();
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
