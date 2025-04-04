const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Set up PeerJS server
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/peerjs'
});

app.use('/peerjs', peerServer);

// Rooms data
const rooms = {};
const userPeers = {};

// Socket.io connection
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Join room
    socket.on('join-room', (data) => {
        const { roomId, username } = data;
        
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: {},
                videoUrl: '',
                isPlaying: false,
                currentTime: 0
            };
        }
        
        rooms[roomId].users[socket.id] = { username };
        
        // Notify others in the room
        socket.to(roomId).emit('user-joined', { username, userId: socket.id });
        
        console.log(`${username} joined room ${roomId}`);
    });
    
    // Store peer ID
    socket.on('peer-id', (data) => {
        const { roomId, peerId } = data;
        
        if (rooms[roomId] && rooms[roomId].users[socket.id]) {
            rooms[roomId].users[socket.id].peerId = peerId;
            userPeers[socket.id] = peerId;
            
            // Notify others about the new peer
            socket.to(roomId).emit('user-connected', peerId);
        }
    });
    
    // Chat message
    socket.on('chat-message', (data) => {
        const { roomId, username, message } = data;
        
        socket.to(roomId).emit('chat-message', { username, message });
    });
    
    // Video loaded
    socket.on('video-loaded', (data) => {
        const { roomId, videoUrl } = data;
        
        if (rooms[roomId]) {
            rooms[roomId].videoUrl = videoUrl;
            rooms[roomId].currentTime = 0;
            rooms[roomId].isPlaying = false;
            
            const username = rooms[roomId].users[socket.id]?.username || 'Someone';
            socket.to(roomId).emit('video-loaded', { 
                username, 
                videoUrl 
            });
        }
    });
    
    // Video file loaded
    socket.on('video-file-loaded', (data) => {
        const { roomId, fileName } = data;
        
        if (rooms[roomId]) {
            const username = rooms[roomId].users[socket.id]?.username || 'Someone';
            socket.to(roomId).emit('video-file-loaded', { 
                username, 
                fileName 
            });
        }
    });
    
    // Video play
    socket.on('video-play', (data) => {
        const { roomId, time } = data;
        
        if (rooms[roomId]) {
            rooms[roomId].isPlaying = true;
            rooms[roomId].currentTime = time;
            
            socket.to(roomId).emit('video-play', { time });
        }
    });
    
    // Video pause
    socket.on('video-pause', (data) => {
        const { roomId, time } = data;
        
        if (rooms[roomId]) {
            rooms[roomId].isPlaying = false;
            rooms[roomId].currentTime = time;
            
            socket.to(roomId).emit('video-pause', { time });
        }
    });
    
    // Video seek
    socket.on('video-seek', (data) => {
        const { roomId, time } = data;
        
        if (rooms[roomId]) {
            rooms[roomId].currentTime = time;
            
            socket.to(roomId).emit('video-seek', { time });
        }
    });
    
    // Request sync
    socket.on('request-sync', (data) => {
        const { roomId, time } = data;
        
        if (rooms[roomId]) {
            rooms[roomId].currentTime = time;
            
            socket.to(roomId).emit('request-sync', { 
                time, 
                playing: rooms[roomId].isPlaying 
            });
        }
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Find which room the user was in
        const roomId = Object.keys(rooms).find(id => 
            rooms[id].users && rooms[id].users[socket.id]
        );
        
        if (roomId) {
            const username = rooms[roomId].users[socket.id]?.username;
            const peerId = rooms[roomId].users[socket.id]?.peerId;
            
            // Notify others in the room
            socket.to(roomId).emit('user-left', { 
                username, 
                userId: peerId || socket.id 
            });
            
            // Remove user from room
            delete rooms[roomId].users[socket.id];
            
            // Remove room if empty
            if (Object.keys(rooms[roomId].users).length === 0) {
                delete rooms[roomId];
            }
        }
        
        // Clean up peer mappings
        delete userPeers[socket.id];
    });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
