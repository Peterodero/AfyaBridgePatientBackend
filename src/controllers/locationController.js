const { SavedLocation, RefillOrder } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');

// GET /locations/search
const searchLocations = async (req, res) => {
  try {
    const { q, lat, lng } = req.query;

    // In production: call Google Maps Geocoding API
    // Mock response for now
    const mockResults = [
      {
        id: `LOC-${Date.now()}`,
        name: q,
        address: `${q}, Nairobi, Kenya`,
        type: 'building',
        coordinates: { lat: parseFloat(lat) || -1.2921, lng: parseFloat(lng) || 36.8219 },
      },
    ];

    return successResponse(res, { results: mockResults });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SEARCH_LOCATION_ERROR');
  }
};

// POST /locations/delivery
const setDeliveryLocation = async (req, res) => {
  try {
    const { address, coordinates, label, saveLocation } = req.body;

    let savedLocation = null;
    if (saveLocation) {
      savedLocation = await SavedLocation.create({
        patientId: req.patient.id,
        label: label || 'Home',
        address,
        latitude: coordinates?.lat,
        longitude: coordinates?.lng,
      });
    }

    return successResponse(res, {
      locationId: savedLocation?.id || `LOC-${Date.now()}`,
      address,
      confirmed: true,
    }, 'Delivery location set');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SET_LOCATION_ERROR');
  }
};

// POST /prescriptions/refill/:refillId/location
const confirmRefillLocation = async (req, res) => {
  try {
    const { refillId } = req.params;
    const { locationId, deliveryInstructions } = req.body;

    const savedLocation = await SavedLocation.findByPk(locationId);
    const order = await RefillOrder.findOne({ where: { id: refillId, patientId: req.patient.id } });

    if (!order) return errorResponse(res, 'Order not found', 404, 'NOT_FOUND');

    const address = savedLocation?.address;
    await order.update({
      deliveryAddress: address,
      deliveryCoordinatesLat: savedLocation?.latitude,
      deliveryCoordinatesLng: savedLocation?.longitude,
      deliveryInstructions,
    });

    return successResponse(res, {
      refillId: order.id,
      deliveryAddress: address,
      deliveryFee: order.deliveryFee,
      total: order.total,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'CONFIRM_LOCATION_ERROR');
  }
};

module.exports = { searchLocations, setDeliveryLocation, confirmRefillLocation };
