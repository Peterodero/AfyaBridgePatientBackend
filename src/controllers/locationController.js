const { models:{SavedLocation, Order} } = require('../models/index.js');
const { successResponse, errorResponse } = require('../utils/response');

// GET /locations/search
// Searches for a place by query string (calls Google Maps Geocoding API)
const searchLocations = async (req, res) => {
  try {
    const { q, lat, lng } = req.query;

    // TODO: Replace with real Google Maps Geocoding API call
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

// GET /locations/saved
// Returns all saved locations for the current patient
const getSavedLocations = async (req, res) => {
  try {
    const locations = await SavedLocation.findAll({
      where: { patient_id: req.user.id },
      order: [['is_default', 'DESC'], ['created_at', 'DESC']],
    });

    return successResponse(res, {
      locations: locations.map((l) => ({
        id: l.id,
        label: l.label,
        address: l.address,
        coordinates: l.gps_lat ? { lat: parseFloat(l.gps_lat), lng: parseFloat(l.gps_lng) } : null,
        isDefault: l.is_default,
        instructions: l.instructions,
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'GET_SAVED_LOCATIONS_ERROR');
  }
};

// POST /locations/saved
// Saves a new location for the patient
const saveLocation = async (req, res) => {
  try {
    const { label, address, coordinates, instructions, isDefault } = req.body;

    // If this is set as default, clear previous default
    if (isDefault) {
      await SavedLocation.update(
        { is_default: false },
        { where: { patient_id: req.user.id, is_default: true } }
      );
    }

    const location = await SavedLocation.create({
      patient_id: req.user.id,
      label: label || 'Home',
      address,
      gps_lat: coordinates?.lat || null,
      gps_lng: coordinates?.lng || null,
      is_default: isDefault || false,
      instructions: instructions || null,
    });

    return successResponse(res, {
      id: location.id,
      label: location.label,
      address: location.address,
      coordinates: location.gps_lat ? { lat: parseFloat(location.gps_lat), lng: parseFloat(location.gps_lng) } : null,
      isDefault: location.is_default,
    }, 'Location saved successfully', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SAVE_LOCATION_ERROR');
  }
};

// PUT /locations/saved/:locationId
// Updates a saved location
const updateSavedLocation = async (req, res) => {
  try {
    const { locationId } = req.params;
    const { label, address, coordinates, instructions, isDefault } = req.body;

    const location = await SavedLocation.findOne({ where: { id: locationId, patient_id: req.user.id } });
    if (!location)
      return errorResponse(res, 'Location not found', 404, 'NOT_FOUND');

    if (isDefault) {
      await SavedLocation.update(
        { is_default: false },
        { where: { patient_id: req.user.id, is_default: true } }
      );
    }

    await location.update({
      label: label ?? location.label,
      address: address ?? location.address,
      gps_lat: coordinates?.lat ?? location.gps_lat,
      gps_lng: coordinates?.lng ?? location.gps_lng,
      instructions: instructions ?? location.instructions,
      is_default: isDefault ?? location.is_default,
    });

    return successResponse(res, {
      id: location.id,
      label: location.label,
      address: location.address,
      isDefault: location.is_default,
    }, 'Location updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'UPDATE_LOCATION_ERROR');
  }
};

// DELETE /locations/saved/:locationId
// Deletes a saved location
const deleteSavedLocation = async (req, res) => {
  try {
    const { locationId } = req.params;

    const location = await SavedLocation.findOne({ where: { id: locationId, patient_id: req.user.id } });
    if (!location)
      return errorResponse(res, 'Location not found', 404, 'NOT_FOUND');

    await location.destroy();

    return successResponse(res, null, 'Location deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'DELETE_LOCATION_ERROR');
  }
};

// POST /locations/delivery
// Sets or updates the patient's default delivery address (also saves to user profile)
const setDeliveryLocation = async (req, res) => {
  try {
    const { address, coordinates, label, saveForLater } = req.body;

    // Always update user's address field as active delivery address
    await req.user.update({ address });

    let savedLocation = null;
    if (saveForLater) {
      // Save to SavedLocations table as default
      await SavedLocation.update(
        { is_default: false },
        { where: { patient_id: req.user.id, is_default: true } }
      );

      savedLocation = await SavedLocation.create({
        patient_id: req.user.id,
        label: label || 'Home',
        address,
        gps_lat: coordinates?.lat || null,
        gps_lng: coordinates?.lng || null,
        is_default: true,
      });
    }

    return successResponse(res, {
      locationId: savedLocation?.id || `LOC-${Date.now()}`,
      address,
      label: label || 'Home',
      confirmed: true,
      saved: !!saveForLater,
    }, 'Delivery location set');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SET_LOCATION_ERROR');
  }
};

// POST /prescriptions/refill/:orderId/location
// Updates the delivery address on an existing Order
const confirmRefillLocation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { address, coordinates, deliveryInstructions } = req.body;

    const order = await Order.findOne({ where: { id: orderId, patient_id: req.user.id } });
    if (!order) return errorResponse(res, 'Order not found', 404, 'NOT_FOUND');

    await order.update({ patient_address: deliveryInstructions ? `${address} — ${deliveryInstructions}` : address });

    return successResponse(res, {
      orderId: order.id,
      deliveryAddress: order.patient_address,
      confirmed: true,
    }, 'Delivery address confirmed');
  } catch (error) {
    return errorResponse(res, error.message, 500, 'CONFIRM_LOCATION_ERROR');
  }
};

module.exports = {
  searchLocations,
  getSavedLocations,
  saveLocation,
  updateSavedLocation,
  deleteSavedLocation,
  setDeliveryLocation,
  confirmRefillLocation,
};