const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

const authRoutes = require('./routes/auth');
const updatesRoutes = require('./routes/updates');
const tasksRoutes = require('./routes/tasks');
const notificationsRoutes = require('./routes/notifications');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const coursesRoutes = require('./routes/courses');
const { initSocket } = require('./socket/presence');
const compression = require('compression');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// Secure CORS policy: Allow development, intranets, and deployed github.io pages
const allowedOrigins = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
  /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
  /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$/,
  /^https?:\/\/[a-zA-Z0-9-]+\.github\.io/
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Allow server-to-server or tools like Postman
    const isAllowed = allowedOrigins.some((regex) => regex.test(origin));
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy (Unauthorized Origin)'));
    }
  },
  credentials: true
};

// Rate limiter for authentication endpoints to prevent brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { message: 'Too many login attempts from this IP. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Middlewares
app.use(helmet()); // Secure HTTP headers
app.use(mongoSanitize()); // Prevent NoSQL Injection attacks
app.use(compression()); // gzip all responses
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// REST Route mappings
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/updates', updatesRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courses', coursesRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Express Error Handler:', err.stack);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

// Port configuration
const PORT = process.env.PORT || 5000;

// Read MongoDB URI from workspace file
let MONGODB_URI = '';
try {
  const uriPath = path.join(__dirname, '..', 'mongodb_uri.md');
  if (fs.existsSync(uriPath)) {
    const fileContent = fs.readFileSync(uriPath, 'utf8');
    // Extract URI from markdown code block or plain line
    const match = fileContent.match(/(mongodb\+srv:\/\/[^\s`]+|mongodb:\/\/[^\s`]+)/);
    if (match) {
      MONGODB_URI = match[0];
    } else {
      // Fallback: clean the lines of any line numbers from IDE
      const lines = fileContent.split('\n');
      const uriLine = lines.find(l => l.includes('mongodb://') || l.includes('mongodb+srv://'));
      if (uriLine) {
        MONGODB_URI = uriLine.replace(/^\d+:\s*/, '').trim();
      }
    }
  }
} catch (err) {
  console.error('Error reading mongodb_uri.md:', err);
}

// Fallback to process.env if reading file fails
MONGODB_URI = MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/easy-updates';

console.log('Connecting to MongoDB URI:', MONGODB_URI.split('@')[1] ? 'mongodb://***@' + MONGODB_URI.split('@')[1] : MONGODB_URI);

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected successfully.');

    // Initialize Socket.io presence on Server
    const io = initSocket(server, app);

    // Start background ETA notification checker
    const { startEtaNotifier } = require('./services/etaNotifier');
    startEtaNotifier(io);

    // Start Server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
