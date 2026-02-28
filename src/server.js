const http = require('http');
require('dotenv').config();

const app = require('./app');
const { connectDB } = require('./config/database');


const PORT = process.env.PORT || 3000;

const server = http.createServer(app)

const API_PREFIX = `/api/${process.env.API_VERSION || 'v1'}`;


const startServer = async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`AfyaBridge API running on port ${PORT}`);
    console.log(`Base URL: http://localhost:${PORT}${API_PREFIX}`);
  });
};

startServer();

