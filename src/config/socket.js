const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { Message, User } = require('../models');

let io;

// Track online users: userId → socketId
const onlineUsers = new Map();

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? ['https://afyabridge.co.ke', 'https://app.afyabridge.co.ke']
        : '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ── JWT Authentication middleware for every socket connection ──
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token ||
                    socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id || decoded.patientId;

      const user = await User.findByPk(userId, {
        attributes: ['id', 'full_name', 'role', 'is_active', 'account_status'],
      });

      if (!user || !user.is_active || user.account_status !== 'active') {
        return next(new Error('Account not found or disabled'));
      }

      socket.userId = user.id;
      socket.userRole = user.role;
      socket.userName = user.full_name;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    console.log(`[Socket] Connected: ${socket.userName} (${socket.userRole}) — ${socket.id}`);

    // Register user as online
    onlineUsers.set(userId, socket.id);

    // Each user joins their own private room (userId as room name)
    socket.join(userId);

    // Broadcast online status to all connected clients
    io.emit('user_online', { userId });

    // ── SEND MESSAGE ──────────────────────────────────────────
    // Client emits: { receiverId, content, messageType, fileUrl }
    socket.on('send_message', async (data, callback) => {
      try {
        const { receiverId, content, messageType = 'text', fileUrl } = data;

        if (!receiverId || (!content && !fileUrl)) {
          return callback?.({ success: false, error: 'receiverId and content are required' });
        }

        // Determine patient_id and doctor_id from the two users
        const receiver = await User.findByPk(receiverId, { attributes: ['id', 'role'] });
        if (!receiver) return callback?.({ success: false, error: 'Receiver not found' });

        const patientId  = socket.userRole === 'patient' ? userId : receiverId;
        const doctorId   = socket.userRole === 'doctor'  ? userId : receiverId;

        // Save to DB
        const message = await Message.create({
          sender_id:    userId,
          receiver_id:  receiverId,
          patient_id:   patientId,
          doctor_id:    doctorId,
          content:      content || '',
          message_type: messageType,
          file_url:     fileUrl || null,
          is_read:      false,
        });

        const payload = {
          id:          message.id,
          senderId:    userId,
          senderName:  socket.userName,
          receiverId,
          content:     message.content,
          messageType: message.message_type,
          fileUrl:     message.file_url,
          isRead:      false,
          sentAt:      message.created_at,
        };

        // Push to receiver's room in real-time
        io.to(receiverId).emit('new_message', payload);

        // Confirm to sender
        callback?.({ success: true, message: payload });
      } catch (err) {
        console.error('[Socket] send_message error:', err.message);
        callback?.({ success: false, error: err.message });
      }
    });

    // ── MARK MESSAGES AS READ ─────────────────────────────────
    // Client emits: { senderId } — mark all messages from senderId as read
    socket.on('mark_read', async (data, callback) => {
      try {
        const { senderId } = data;

        await Message.update(
          { is_read: true, read_at: new Date() },
          { where: { sender_id: senderId, receiver_id: userId, is_read: false } }
        );

        // Notify the sender that their messages were read
        io.to(senderId).emit('messages_read', { byUserId: userId, readAt: new Date() });

        callback?.({ success: true });
      } catch (err) {
        callback?.({ success: false, error: err.message });
      }
    });

    // ── TYPING INDICATOR ──────────────────────────────────────
    // Client emits: { receiverId }
    socket.on('typing', ({ receiverId }) => {
      io.to(receiverId).emit('user_typing', { senderId: userId, senderName: socket.userName });
    });

    socket.on('stop_typing', ({ receiverId }) => {
      io.to(receiverId).emit('user_stop_typing', { senderId: userId });
    });

    // ── DISCONNECT ────────────────────────────────────────────
    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      io.emit('user_offline', { userId });
      console.log(`[Socket] Disconnected: ${socket.userName} — ${socket.id}`);
    });
  });

  console.log('[Socket] Socket.IO initialized');
  return io;
};

// Get io instance (used in chatController to emit from REST endpoints)
const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

const isUserOnline = (userId) => onlineUsers.has(userId);

module.exports = { initSocket, getIO, isUserOnline };
