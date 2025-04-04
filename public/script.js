document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const landingPage = document.getElementById('landing-page');
    const roomPage = document.getElementById('room-page');
    const createRoomForm = document.getElementById('create-room-form');
    const joinRoomForm = document.getElementById('join-room-form');
    const roomIdDisplay = document.getElementById('room-id-display');
    const copyRoomLink = document.getElementById('copy-room-link');
    const urlForm = document.getElementById('url-form');
    const fileForm = document.getElementById('file-form');
    const videoPlayer = document.getElementById('video-player');
    const videoUrl = document.getElementById('video-url');
    const videoFile = document.getElementById('video-file');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const syncBtn = document.getElementById('sync-btn');
    const toggleVideo = document.getElementById('toggle-video');
    const toggleAudio = document.getElementById('toggle-audio');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const messagesContainer = document.getElementById('messages');
    const videoGrid = document.getElementById('video-grid');
    const optionTabs = document.querySelectorAll('.option-tab');

    // State variables
    let socket;
    let currentRoom = '';
    let username = '';
    let myPeer;
    let myStream;
    let peers = {};
    let videoEnabled = true;
    let audioEnabled = true;

    // Tab switching functionality
    optionTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            optionTabs.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Hide all content divs
            document.querySelectorAll('.video-option-content').forEach(content => {
                content.classList.add('hidden');
            });
            
            // Show the selected content div
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

    // Create Room
    createRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        username = document.getElementById('username').value.trim();
        if (!username) return;
        
        initializeRoom(generateRoomId());
    });

    // Join Room
    joinRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        username = document.getElementById('join-username').value.trim();
        const roomId = document.getElementById('room-id').value.trim();
        if (!username || !roomId) return;
        
        initializeRoom(roomId);
    });

    // Copy Room Link
    copyRoomLink.addEventListener('click', () => {
        const roomLink = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
        navigator.clipboard.writeText(roomLink)
            .then(() => {
                copyRoomLink.textContent = 'Copied!';
                setTimeout(() => {
                    copyRoomLink.textContent = 'Copy Room Link';
                }, 2000);
            });
    });

    // Load video from URL
    urlForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = videoUrl.value.trim();
        if (!url) return;
        
        loadVideo(url);
        socket.emit('video-loaded', { roomId: currentRoom, videoUrl: url });
    });

    // Load video from file
    fileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const file = videoFile.files[0];
        if (!file) return;
        
        const fileUrl = URL.createObjectURL(file);
        loadVideo(fileUrl);
        
        // Since we can't send the actual file over socket.io, we'll just notify others
        socket.emit('video-file-loaded', { roomId: currentRoom, fileName: file.name });
    });

    // Video control events
    playBtn.addEventListener('click', () => {
        videoPlayer.play();
        socket.emit('video-play', { roomId: currentRoom, time: videoPlayer.currentTime });
    });

    pauseBtn.addEventListener('click', () => {
        videoPlayer.pause();
        socket.emit('video-pause', { roomId: currentRoom, time: videoPlayer.currentTime });
    });

    syncBtn.addEventListener('click', () => {
        socket.emit('request-sync', { roomId: currentRoom, time: videoPlayer.currentTime });
    });

    videoPlayer.addEventListener('seeked', () => {
        socket.emit('video-seek', { roomId: currentRoom, time: videoPlayer.currentTime });
    });

    // Chat functionality
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (!message) return;
        
        socket.emit('chat-message', { roomId: currentRoom, username, message });
        addMessage(username, message, true);
        messageInput.value = '';
    });

    // Toggle video/audio
    toggleVideo.addEventListener('click', () => {
        videoEnabled = !videoEnabled;
        toggleVideo.textContent = videoEnabled ? 'Video' : 'No Video';
        
        if (myStream) {
            myStream.getVideoTracks().forEach(track => {
                track.enabled = videoEnabled;
            });
        }
    });

    toggleAudio.addEventListener('click', () => {
        audioEnabled = !audioEnabled;
        toggleAudio.textContent = audioEnabled ? 'Audio' : 'No Audio';
        
        if (myStream) {
            myStream.getAudioTracks().forEach(track => {
                track.enabled = audioEnabled;
            });
        }
    });

    // Check URL for room parameter
    function checkUrlForRoom() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        if (roomId) {
            document.getElementById('room-id').value = roomId;
        }
    }

    // Initialize room
    function initializeRoom(roomId) {
        currentRoom = roomId;
        roomIdDisplay.textContent = roomId;
        
        // Show room page, hide landing page
        landingPage.classList.add('hidden');
        roomPage.classList.remove('hidden');
        
        // Initialize socket connection
        initSocket();
        
        // Initialize WebRTC
        initWebRTC();
        
        // Update URL with room ID
        const newUrl = `${window.location.pathname}?room=${roomId}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
    }

    // Initialize Socket.io connection
    function initSocket() {
        socket = io('http://localhost:3000');
        
        socket.on('connect', () => {
            socket.emit('join-room', { roomId: currentRoom, username });
        });
        
        socket.on('user-joined', (data) => {
            addMessage('System', `${data.username} joined the room`, false);
        });
        
        socket.on('user-left', (data) => {
            addMessage('System', `${data.username} left the room`, false);
            
            // Remove peer video if they disconnected
            if (peers[data.userId]) {
                const videoElement = document.getElementById(`video-${data.userId}`);
                if (videoElement) {
                    videoElement.remove();
                }
                peers[data.userId].close();
                delete peers[data.userId];
            }
        });
        
        socket.on('chat-message', (data) => {
            addMessage(data.username, data.message, false);
        });
        
        socket.on('video-loaded', (data) => {
            addMessage('System', `${data.username} loaded a video`, false);
            loadVideo(data.videoUrl);
        });
        
        socket.on('video-file-loaded', (data) => {
            addMessage('System', `${data.username} loaded a file: ${data.fileName}`, false);
            addMessage('System', 'Please upload the file on your device too', false);
        });
        
        socket.on('video-play', (data) => {
            videoPlayer.currentTime = data.time;
            videoPlayer.play();
        });
        
        socket.on('video-pause', (data) => {
            videoPlayer.currentTime = data.time;
            videoPlayer.pause();
        });
        
        socket.on('video-seek', (data) => {
            videoPlayer.currentTime = data.time;
        });
        
        socket.on('request-sync', (data) => {
            videoPlayer.currentTime = data.time;
            if (data.playing) {
                videoPlayer.play();
            } else {
                videoPlayer.pause();
            }
        });
    }

    // Initialize WebRTC for video calls
    function initWebRTC() {
        myPeer = new Peer(undefined, {
            host: 'localhost',
            port: 3001,
            path: '/peerjs'
        });
        
        navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        }).then(stream => {
            myStream = stream;
            addVideoStream('my-video', stream, true);
            
            myPeer.on('call', call => {
                call.answer(stream);
                call.on('stream', userVideoStream => {
                    addVideoStream(`video-${call.peer}`, userVideoStream, false);
                });
                
                peers[call.peer] = call;
            });
            
            socket.on('user-connected', userId => {
                connectToNewUser(userId, stream);
            });
        });
        
        myPeer.on('open', id => {
            socket.emit('peer-id', { roomId: currentRoom, peerId: id });
        });
    }

    // Connect to a new user with WebRTC
    function connectToNewUser(userId, stream) {
        const call = myPeer.call(userId, stream);
        call.on('stream', userVideoStream => {
            addVideoStream(`video-${userId}`, userVideoStream, false);
        });
        call.on('close', () => {
            const videoElement = document.getElementById(`video-${userId}`);
            if (videoElement) {
                videoElement.remove();
            }
        });
        
        peers[userId] = call;
    }

    // Add video stream to the grid
    function addVideoStream(id, stream, isLocal) {
        const videoElement = document.createElement('video');
        videoElement.srcObject = stream;
        videoElement.id = id;
        videoElement.autoplay = true;
        if (isLocal) {
            videoElement.muted = true;
        }
        
        videoGrid.append(videoElement);
    }

    // Add message to chat
    function addMessage(sender, message, isOwnMessage) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        if (isOwnMessage) {
            messageElement.classList.add('own-message');
        }
        
        const usernameElement = document.createElement('span');
        usernameElement.classList.add('username');
        usernameElement.textContent = sender + ': ';
        
        const textElement = document.createElement('span');
        textElement.textContent = message;
        
        messageElement.appendChild(usernameElement);
        messageElement.appendChild(textElement);
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Load video
    function loadVideo(url) {
        videoPlayer.src = url;
    }

    // Generate random room ID
    function generateRoomId() {
        return Math.random().toString(36).substring(2, 7);
    }

    // Check URL for room parameter on page load
    checkUrlForRoom();
});