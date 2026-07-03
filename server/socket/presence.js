const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Keep track of connected sockets per user
// Key: User ID, Value: Array of Socket IDs
const activeConnections = {};

const initSocket = (server, app) => {
  const io = new Server(server, {
    cors: {
      origin: '*', // Allow all origins for development
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true
    }
  });

  // Attach socket.io instance to Express app for routing access
  app.set('socketio', io);

  // Auth Handshake Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallbacksecret');
      
      // If 2FA is pending, disallow connection
      if (decoded.is2faPending) {
        return next(new Error('Authentication error: 2FA required'));
      }

      const user = await User.findById(decoded.id).select('username avatarColor status approvalStatus isApproved');
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      const isApproved = user.approvalStatus === 'approved' || user.isApproved === true;
      if (!isApproved) {
        return next(new Error('Authentication error: Account not approved'));
      }

      socket.user = user;
      next();
    } catch (error) {
      console.error('Socket authentication handshake error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    
    // Join a room for personal notification messages
    socket.join(userId);

    // Track active connection socket IDs
    if (!activeConnections[userId]) {
      activeConnections[userId] = [];
    }
    activeConnections[userId].push(socket.id);

    console.log(`User connected: ${socket.user.username} (${socket.id}). Active sockets: ${activeConnections[userId].length}`);

    // If this is the user's first socket tab opening, broadcast online status
    if (activeConnections[userId].length === 1) {
      try {
        const user = await User.findByIdAndUpdate(
          userId,
          { status: 'online', currentPage: 'Home', currentAction: 'Viewing Dashboard' },
          { new: true }
        ).select('username avatarColor status statusOverride lastSeen currentPage currentAction');

        if (user.statusOverride === 'offline') {
          io.emit('presence:offline', { _id: user._id, lastSeen: user.lastSeen });
        } else {
          io.emit('presence:online', user);
        }
      } catch (err) {
        console.error('Error updating presence online status:', err);
      }
    } else {
      // Send current state to newly connected client
      try {
        const user = await User.findById(userId).select('username avatarColor status statusOverride lastSeen currentPage currentAction');
        socket.emit('presence:self', user);
      } catch (err) {
        console.error('Error sending presence state to self:', err);
      }
    }

    // Broadcast all current online users to this connecting socket
    try {
      const onlineUsers = await User.find({ 
        status: 'online',
        statusOverride: { $ne: 'offline' },
        $or: [{ approvalStatus: 'approved' }, { isApproved: true }]
      }).select('username avatarColor status statusOverride lastSeen currentPage currentAction');
      socket.emit('presence:list', onlineUsers);
    } catch (err) {
      console.error('Error fetching online users list:', err);
    }

    // Join a room for a specific update/task comment thread
    socket.on('thread:join', ({ threadId }) => {
      socket.join(`thread:${threadId}`);
      console.log(`Socket ${socket.id} joined thread room: thread:${threadId}`);
    });

    // Leave a specific comment thread room
    socket.on('thread:leave', ({ threadId }) => {
      socket.leave(`thread:${threadId}`);
      console.log(`Socket ${socket.id} left thread room: thread:${threadId}`);
    });

    // Handle typing indicator broadcasts within a thread room
    socket.on('thread:typing', ({ threadId }) => {
      socket.to(`thread:${threadId}`).emit('thread:typing:update', {
        userId: socket.user._id,
        username: socket.user.username,
        isTyping: true
      });
    });

    socket.on('thread:stop_typing', ({ threadId }) => {
      socket.to(`thread:${threadId}`).emit('thread:typing:update', {
        userId: socket.user._id,
        username: socket.user.username,
        isTyping: false
      });
    });

    // Handle user page/action changes
    socket.on('presence:activity', async (data) => {
      const { page, action } = data;
      try {
        const user = await User.findByIdAndUpdate(
          userId,
          { currentPage: page || '', currentAction: action || '' },
          { new: true }
        ).select('username avatarColor status statusOverride lastSeen currentPage currentAction');

        if (user) {
          if (user.statusOverride === 'offline') {
            io.emit('presence:offline', { _id: user._id, lastSeen: user.lastSeen });
          } else {
            io.emit('presence:update', user);
          }
        }
      } catch (err) {
        console.error('Error updating user activity:', err);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.id}`);
      
      // Filter out this socket
      if (activeConnections[userId]) {
        activeConnections[userId] = activeConnections[userId].filter(id => id !== socket.id);
        
        // If no more active sockets exist for this user, mark offline
        if (activeConnections[userId].length === 0) {
          delete activeConnections[userId];
          
          try {
            const lastSeenTime = new Date();
            const user = await User.findByIdAndUpdate(
              userId,
              { status: 'offline', lastSeen: lastSeenTime, currentPage: '', currentAction: '' },
              { new: true }
            ).select('username avatarColor status lastSeen currentPage currentAction');

            io.emit('presence:offline', user);
            console.log(`User offline: ${socket.user.username}`);
          } catch (err) {
            console.error('Error setting user presence to offline:', err);
          }
        }
      }
    });
  });

  return io;
};

module.exports = { initSocket };
