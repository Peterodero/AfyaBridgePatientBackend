const { models: {Pharmacy, Order} } = require('../models/index.js');
const { successResponse, errorResponse } = require('../utils/response');
const { Op } = require('sequelize');

// Haversine distance formula (km)
const getDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
};

// GET /pharmacies/nearby
const getNearbyPharmacies = async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;

    const pharmacies = await Pharmacy.findAll({ where: { is_active: true } });

    const nearby = pharmacies
      .map((p) => ({
        ...p.toJSON(),
        distance: getDistance(parseFloat(lat), parseFloat(lng), parseFloat(p.gps_lat), parseFloat(p.gps_lng)),
      }))
      .filter((p) => parseFloat(p.distance) <= parseFloat(radius))
      .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

    return successResponse(res, {
      pharmacies: nearby.map((p) => ({
        id: p.id,
        name: p.name,
        latitude: p.gps_lat,
        longitude: p.gps_lng,
        address: `${p.address_line1}${p.address_line2 ? ', ' + p.address_line2 : ''}, ${p.county}`,
        phone: p.phone,
        distance: `${p.distance} km`,
        is24hr: p.is_24hr,
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
        is_active: true,
        [Op.or]: [
          { name: { [Op.like]: `%${q}%` } },
          { address_line1: { [Op.like]: `%${q}%` } },
          { county: { [Op.like]: `%${q}%` } },
        ],
      },
    });

    const withDistance = pharmacies.map((p) => ({
      ...p.toJSON(),
      distance:
        lat && lng
          ? `${getDistance(parseFloat(lat), parseFloat(lng), parseFloat(p.gps_lat), parseFloat(p.gps_lng))} km`
          : null,
    }));

    return successResponse(res, {
      searchTerm: q,
      pharmacies: withDistance.map((p) => ({
        id: p.id,
        name: p.name,
        address: `${p.address_line1}, ${p.county}`,
        phone: p.phone,
        distance: p.distance,
        is24hr: p.is_24hr,
        location: { lat: p.gps_lat, lng: p.gps_lng },
      })),
      mapData: {
        center: { lat: parseFloat(lat), lng: parseFloat(lng) },
        pharmacyPins: withDistance.map((p) => ({ id: p.id, lat: p.gps_lat, lng: p.gps_lng, name: p.name })),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SEARCH_PHARMACIES_ERROR');
  }
};

// GET /pharmacies/map
const getPharmacyMapData = async (req, res) => {
  try {
    const { lat, lng, radius = 3000 } = req.query;

    const pharmacies = await Pharmacy.findAll({ where: { is_active: true } });

    const nearby = pharmacies
      .map((p) => ({
        ...p.toJSON(),
        dist: getDistance(parseFloat(lat), parseFloat(lng), parseFloat(p.gps_lat), parseFloat(p.gps_lng)),
      }))
      .filter((p) => parseFloat(p.dist) <= parseFloat(radius));

    return successResponse(res, {
      mapConfig: { center: { lat: parseFloat(lat), lng: parseFloat(lng) }, zoom: 14 },
      userLocation: { lat: parseFloat(lat), lng: parseFloat(lng), pulse: true },
      pharmacies: nearby.map((p) => ({
        id: p.id,
        name: p.name,
        location: { lat: p.gps_lat, lng: p.gps_lng },
        icon: 'pin',
      })),
      controls: [
        { type: 'zoom_in', icon: '' },
        { type: 'zoom_out', icon: '' },
        { type: 'current_location', icon: '' },
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
      pharmacy: {
        id: pharmacy.id,
        name: pharmacy.name,
        address: `${pharmacy.address_line1}, ${pharmacy.county}`,
        phone: pharmacy.phone,
      },
      fulfillmentType,
      estimatedReady: 'Today by 4:30 PM',
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, 'SELECT_PHARMACY_ERROR');
  }
};

module.exports = { getNearbyPharmacies, searchPharmacies, getPharmacyMapData, selectPharmacy };
