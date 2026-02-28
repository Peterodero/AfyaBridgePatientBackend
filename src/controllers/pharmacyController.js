const { Pharmacy, RefillOrder } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');
const { Op, literal } = require('sequelize');

// Haversine distance formula (km)
const getDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
};

// GET /pharmacies/nearby
const getNearbyPharmacies = async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;

    const pharmacies = await Pharmacy.findAll({ where: { isActive: true } });

    const nearby = pharmacies
      .map((p) => ({ ...p.toJSON(), distance: getDistance(parseFloat(lat), parseFloat(lng), parseFloat(p.latitude), parseFloat(p.longitude)) }))
      .filter((p) => parseFloat(p.distance) <= parseFloat(radius))
      .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

    return successResponse(res, {
      pharmacies: nearby.map((p) => ({
        id: p.id, name: p.name, branch: p.branch,
        address: p.address, distance: `${p.distance} km`,
        operatingHours: { status: p.openNow ? 'open' : 'closed' },
        selected: false,
      })),
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'NEARBY_PHARMACIES_ERROR');
  }
};

// GET /pharmacies/search
const searchPharmacies = async (req, res) => {
  try {
    const { q, lat, lng } = req.query;

    const pharmacies = await Pharmacy.findAll({
      where: {
        isActive: true,
        [Op.or]: [
          { name: { [Op.like]: `%${q}%` } },
          { branch: { [Op.like]: `%${q}%` } },
          { address: { [Op.like]: `%${q}%` } },
        ],
      },
    });

    const withDistance = pharmacies.map((p) => ({
      ...p.toJSON(),
      distance: lat && lng ? `${getDistance(parseFloat(lat), parseFloat(lng), parseFloat(p.latitude), parseFloat(p.longitude))} km` : null,
    }));

    return successResponse(res, {
      searchTerm: q,
      pharmacies: withDistance.map((p) => ({
        id: p.id, name: p.name, branch: p.branch,
        address: p.address, distance: p.distance,
        rating: p.rating, openNow: p.openNow,
        location: { lat: p.latitude, lng: p.longitude },
      })),
      mapData: {
        center: { lat: parseFloat(lat), lng: parseFloat(lng) },
        userLocation: { lat: parseFloat(lat), lng: parseFloat(lng) },
        pharmacyPins: withDistance.map((p) => ({ id: p.id, lat: p.latitude, lng: p.longitude, name: p.name })),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SEARCH_PHARMACIES_ERROR');
  }
};

// GET /pharmacies/map
const getPharmacyMapData = async (req, res) => {
  try {
    const { lat, lng, radius = 3 } = req.query;

    const pharmacies = await Pharmacy.findAll({ where: { isActive: true } });

    const nearby = pharmacies
      .map((p) => ({ ...p.toJSON(), dist: getDistance(parseFloat(lat), parseFloat(lng), parseFloat(p.latitude), parseFloat(p.longitude)) }))
      .filter((p) => parseFloat(p.dist) <= parseFloat(radius));

    return successResponse(res, {
      mapConfig: { center: { lat: parseFloat(lat), lng: parseFloat(lng) }, zoom: 14 },
      userLocation: { lat: parseFloat(lat), lng: parseFloat(lng), pulse: true },
      pharmacies: nearby.map((p) => ({ id: p.id, name: p.name, location: { lat: p.latitude, lng: p.longitude }, icon: 'pin' })),
      controls: [
        { type: 'zoom_in', icon: '➕' },
        { type: 'zoom_out', icon: '➖' },
        { type: 'current_location', icon: '📍' },
      ],
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'PHARMACY_MAP_ERROR');
  }
};

// POST /prescriptions/pharmacy/select
const selectPharmacy = async (req, res) => {
  try {
    const { pharmacyId, fulfillmentType } = req.body;

    const pharmacy = await Pharmacy.findByPk(pharmacyId);
    if (!pharmacy) return errorResponse(res, 'Pharmacy not found', 404, 'NOT_FOUND');

    return successResponse(res, {
      pharmacy: { id: pharmacy.id, name: pharmacy.name, branch: pharmacy.branch },
      fulfillmentType,
      estimatedReady: 'Today by 4:30 PM',
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SELECT_PHARMACY_ERROR');
  }
};

module.exports = { getNearbyPharmacies, searchPharmacies, getPharmacyMapData, selectPharmacy };
