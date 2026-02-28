require('dotenv').config();
const { sequelize } = require('./database');
require('../models');

const migrate = async () => {
  try {
    await sequelize.sync({ force: false });
    console.log('All tables created/updated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
