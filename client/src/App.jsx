// client/src/App.jsx
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const DEFAULT_AVATAR = "/avatar.png";
const socket = io("http://localhost:3000");

function App() {
  const [username, setUsername] = useState("");
  const [chosenName, setChosenName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR);

  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [online, setOnline] = useState({ users: [], count: 0 });
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [currentRoom, setCurrentRoom] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [privateTarget, setPrivateTarget] = useState("");

  const chatBoxRef = useRef();

  // Socket listeners
  useEffect(() => {
    socket.on("message", (msg) => {
      setMessages((prev) => [...prev, { ...msg, type: "global" }]);
    });

    socket.on("room_message", (msg) => {
      setMessages((prev) => [...prev, { ...msg, type: "room" }]);
    });

    socket.on("system_message", (m) => {
      setMessages((prev) => [...prev, { text: m.text, type: "system" }]);
    });

    socket.on("user_joined", ({ username }) => {
      setMessages((prev) => [...prev, { text: `${username} joined`, type: "system" }]);
    });

    socket.on("user_left", ({ username }) => {
      setMessages((prev) => [...prev, { text: `${username} left`, type: "system" }]);
    });

    socket.on("private_message", (payload) => {
      setMessages((prev) => [...prev, { ...payload, type: "private_in" }]);
    });

    socket.on("private_message_sent", (payload) => {
      setMessages((prev) => [...prev, { ...payload, type: "private_out" }]);
    });

    socket.on("user_list", (payload) => {
      setOnline(payload || { users: [], count: 0 });
    });

    socket.on("typing", ({ username: tUser }) => {
      setTypingUsers((prev) => new Set(prev).add(tUser));
    });

    socket.on("stop_typing", ({ username: tUser }) => {
      setTypingUsers((prev) => {
        const s = new Set(prev);
        s.delete(tUser);
        return s;
      });
    });

    return () => {
      socket.off();
    };
  }, []);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle Join
  const submitUsername = () => {
    if (!username.trim()) return alert("Please enter a name");

    setChosenName(username);
    socket.emit("set_username", { username, avatar: avatarUrl });
  };

  // Send message
  const sendMessage = ({ toUsername, room } = {}) => {
    const t = text.trim();
    if (!t) return;

    if (toUsername) {
      socket.emit("private_message", { toUsername, text: t });
    } else {
      socket.emit("message", { text: t, room: room || currentRoom || null });
    }

    setText("");
  };

  // Typing event
  let typingTimeout = null;
  const handleTyping = () => {
    socket.emit("typing", { room: currentRoom || null });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit("stop_typing", { room: currentRoom || null });
    }, 800);
  };

  // Room functions
  const joinRoom = () => {
    if (!roomInput.trim()) return;
    socket.emit("join_room", { room: roomInput });
    setCurrentRoom(roomInput);
    setRoomInput("");
  };

  const leaveRoom = () => {
    if (!currentRoom) return;
    socket.emit("leave_room", { room: currentRoom });
    setCurrentRoom("");
  };

  // Private chat
  const startPrivate = (u) => {
    setPrivateTarget(u);
  };

  return (
    <div className="container">

      {/* ---------- JOIN SCREEN ---------- */}
      {!chosenName ? (
        <div className="join-container">
          <h2 className="join-title">Join the Chat</h2>

          <input
            className="join-input"
            placeholder="Your name..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <img src={avatarUrl} className="avatar-preview" alt="avatar" />

          <label className="avatar-label">Avatar URL</label>

          <input
            className="join-input"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="/avatar.png or https://image-url"
          />

          <button className="join-btn" onClick={submitUsername}>Join Chat</button>
        </div>
      ) : (
        <>
          {/* ---------- TOP BAR ---------- */}
          <div className="topbar">
            <h2>Socket.io Chat {currentRoom ? `(Room: ${currentRoom})` : ""}</h2>

            <div className="rightTop">
              <div className="online">Online: {online.count}</div>

              <div className="user-list">
                {online.users.map((u) => (
                  <div key={u.username} className="user-item" onClick={() => startPrivate(u.username)}>
                    <img src={u.avatar || DEFAULT_AVATAR} alt="av" />
                    <span>{u.username}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ---------- CHAT BOX ---------- */}
          <div ref={chatBoxRef} className="chat-box">
            {messages.map((m, i) => {
              if (m.type === "system")
                return <div key={i} className="system-msg">{m.text}</div>;

              if (m.type === "private_in")
                return <div key={i} className="private-msg in"><strong>{m.from} → You:</strong> {m.text}</div>;

              if (m.type === "private_out")
                return <div key={i} className="private-msg out"><strong>You → {m.to}:</strong> {m.text}</div>;

              if (m.type === "room")
                return <div key={i} className="message"><strong>{m.username} (room):</strong> {m.text}</div>;

              return <div key={i} className="message"><strong>{m.username}:</strong> {m.text}</div>;
            })}

            {typingUsers.size > 0 && (
              <div className="typing">{[...typingUsers].join(", ")} typing...</div>
            )}
          </div>

          {/* ---------- ROOM CONTROLS ---------- */}
          <div className="controls">
            <input
              placeholder="Room name..."
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
            />
            <button onClick={joinRoom}>Join</button>
            <button onClick={leaveRoom}>Leave</button>
          </div>

          {/* ---------- INPUT BAR ---------- */}
          <div className="input-area">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={privateTarget ? `Private to ${privateTarget}` : "Type message..."}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (privateTarget) sendMessage({ toUsername: privateTarget });
                  else sendMessage();
                } else handleTyping();
              }}
            />

            <button
              onClick={() => {
                if (privateTarget) {
                  sendMessage({ toUsername: privateTarget });
                  setPrivateTarget("");
                } else {
                  sendMessage();
                }
              }}
            >
              Send
            </button>

            {privateTarget && (
              <button onClick={() => setPrivateTarget("")}>Cancel</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
