const axios = require('axios');

const SERVICES = {
  doctor: process.env.DOCTOR_SERVICE_URL || 'http://localhost:3001/api/v1',
  pharmacy: process.env.PHARMACY_SERVICE_URL || 'http://localhost:3002/api/v1',
  rider: process.env.RIDER_SERVICE_URL || 'http://localhost:3003/api/v1',
};

const serviceClient = async (service, method, endpoint, data = null, token = null) => {
  try {
    const url = `${SERVICES[service]}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await axios({ method, url, data, headers });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error?.message || 'Service unavailable',
      status: error.response?.status || 503,
    };
  }
};

module.exports = serviceClient;