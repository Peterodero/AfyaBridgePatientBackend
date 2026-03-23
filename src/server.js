const http = require('http');
require('dotenv').config();

const app = require('./app');
const { connectDB } = require('./config/database');
const { initSocket } = require('./config/socket');

const PORT = process.env.PORT || 3008;
const API_PREFIX = `/api/${process.env.API_VERSION || 'v1'}`;

const server = http.createServer(app);

// Attach Socket.IO to the same HTTP server
initSocket(server);

const startServer = async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`AfyaBridge API running on port ${PORT}`);
    console.log(`Base URL: http://localhost:${PORT}${API_PREFIX}`);
    console.log(`Socket.IO: ws://localhost:${PORT}`);
  });
};

startServer();
